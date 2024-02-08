#[starknet::contract]
mod TimedRound {
    use starknet::{EthAddress, get_block_timestamp, get_caller_address};
    use prop_house::rounds::timed::config::{
        ITimedRound, RoundState, RoundConfig, RoundParams, Proposal, ProposalVote, LeadingProposals,
    };
    use prop_house::rounds::timed::constants::MAX_WINNERS;
    use prop_house::common::libraries::round::{Asset, Round, UserStrategy, StrategyGroup};
    use prop_house::common::utils::contract::get_round_dependency_registry;
    use prop_house::common::utils::traits::{
        IExecutionStrategyDispatcherTrait, IExecutionStrategyDispatcher,
        IRoundDependencyRegistryDispatcherTrait,
    };
    use prop_house::common::utils::hash::{keccak_u256s_be, LegacyHashEthAddress};
    use prop_house::common::utils::constants::{DependencyKey, RoundType, StrategyType};
    use prop_house::common::utils::storage::PackedU32VecStore;
    use prop_house::common::utils::merkle::MerkleTreeTrait;
    use prop_house::common::utils::vec::{Vec, VecTrait};
    use nullable::{NullableTrait, FromNullableResult, match_nullable};
    use array::{ArrayTrait, SpanTrait};
    use integer::u256_from_felt252;
    use traits::{TryInto, Into};
    use dict::Felt252DictTrait;
    use option::OptionTrait;
    use zeroable::Zeroable;
    use box::BoxTrait;

    #[storage]
    struct Storage {
        _config: RoundConfig,
        _proposal_count: u32,
        _proposals: LegacyMap<u32, Proposal>,
        _leading_proposal_ids: Vec<u32>,
        _spent_voting_power: LegacyMap<EthAddress, u256>,
    }

   #[event]
   #[derive(Drop, starknet::Event)]
    enum Event {
        ProposalCreated: ProposalCreated,
        ProposalEdited: ProposalEdited,
        ProposalCancelled: ProposalCancelled,
        VoteCast: VoteCast,
        RoundFinalized: RoundFinalized,
    }

    /// Emitted when a proposal is created.
    /// * `proposal_id` - The ID of the proposal.
    /// * `proposer` - The address of the proposer.
    /// * `metadata_uri` - The URI of the metadata.
    #[derive(Drop, starknet::Event)]
    struct ProposalCreated {
        proposal_id: u32, proposer: EthAddress, metadata_uri: Array<felt252>
    }

    /// Emitted when a proposal is edited.
    /// * `proposal_id` - The ID of the proposal.
    /// * `updated_metadata_uri` - The updated URI of the metadata.
    #[derive(Drop, starknet::Event)]
    struct ProposalEdited {
        proposal_id: u32, updated_metadata_uri: Array<felt252>
    }

    /// Emitted when a proposal is cancelled.
    /// * `proposal_id` - The ID of the cancelled proposal.
    #[derive(Drop, starknet::Event)]
    struct ProposalCancelled {
        proposal_id: u32,
    }

    /// Emitted when a vote is cast.
    /// * `proposal_id` - The ID of the proposal.
    /// * `voter` - The address of the voter.
    /// * `voting_power` - The voting power of the voter.
    #[derive(Drop, starknet::Event)]
    struct VoteCast {
        proposal_id: u32, voter: EthAddress, voting_power: u256
    }

    /// Emitted when a round is finalized.
    /// * `winning_proposal_ids` - The IDs of the winning proposals.
    /// * `merkle_root` - The merkle root of the winners.
    #[derive(Drop, starknet::Event)]
    struct RoundFinalized {
        winning_proposal_ids: Span<u32>, merkle_root: u256
    }

    #[constructor]
    fn constructor(ref self: ContractState, round_params: Array<felt252>) {
        initializer(ref self, round_params.span());
    }

    #[external(v0)]
    impl TimedRound of ITimedRound<ContractState> {
        /// Returns the proposal for the given proposal ID.
        /// * `proposal_id` - The proposal ID.
        fn get_proposal(self: @ContractState, proposal_id: u32) -> Proposal {
            let proposal = self._proposals.read(proposal_id);
            assert(proposal.proposer.is_non_zero(), 'TR: Proposal does not exist');

            proposal
        }

        /// Submit a proposal to the round.
        /// * `proposer` - The address of the proposer.
        /// * `metadata_uri` - The proposal metadata URI.
        /// * `used_proposing_strategies` - The strategies used to propose.
        fn propose(
            ref self: ContractState,
            proposer: EthAddress,
            metadata_uri: Array<felt252>,
            used_proposing_strategies: Array<UserStrategy>,
        ) {
            let config = self._config.read();
            let current_timestamp = get_block_timestamp();

            _assert_caller_valid_and_round_active(@self);
            _assert_in_proposal_period(config, current_timestamp);

            // Determine the cumulative proposition power of the user
            let cumulative_proposition_power = Round::get_cumulative_governance_power(
                @Round::unsafe_new_contract_state(),
                config.proposal_period_start_timestamp,
                proposer,
                StrategyType::PROPOSING,
                used_proposing_strategies.span(),
            );
            assert(
                cumulative_proposition_power >= config.proposal_threshold.into(),
                'TR: Proposition power too low'
            );

            let proposal_id = self._proposal_count.read() + 1;
            let proposal = Proposal {
                proposer: proposer,
                last_updated_at: current_timestamp,
                is_cancelled: false,
                voting_power: 0,
            };

            // Store the proposal and increment the proposal count
            self._proposals.write(proposal_id, proposal);
            self._proposal_count.write(proposal_id);

            self.emit(Event::ProposalCreated(ProposalCreated { proposal_id, proposer, metadata_uri }));
        }

        /// Edit a proposal.
        /// * `proposer` - The address of the proposer.
        /// * `proposal_id` - The ID of the proposal to cancel.
        /// * `metadata_uri` - The updated proposal metadata URI.
        fn edit_proposal(ref self: ContractState, proposer: EthAddress, proposal_id: u32, metadata_uri: Array<felt252>) {
            _assert_caller_valid_and_round_active(@self);
            _assert_in_proposal_period(self._config.read(), get_block_timestamp());

            let mut proposal = self._proposals.read(proposal_id);

            // Ensure the proposal exists, the caller is the proposer, and the proposal hasn't been cancelled
            assert(proposal.proposer.is_non_zero(), 'TR: Proposal does not exist');
            assert(proposer == proposal.proposer, 'TR: Caller is not proposer');
            assert(!proposal.is_cancelled, 'TR: Proposal is cancelled');

            // Set the last update timestamp
            proposal.last_updated_at = get_block_timestamp();
            self._proposals.write(proposal_id, proposal);

            self.emit(Event::ProposalEdited(ProposalEdited { proposal_id, updated_metadata_uri: metadata_uri }));
        }

        /// Cancel a proposal.
        /// * `proposer` - The address of the proposer.
        /// * `proposal_id` - The ID of the proposal to cancel.
        fn cancel_proposal(ref self: ContractState, proposer: EthAddress, proposal_id: u32) {
            _assert_caller_valid_and_round_active(@self);
            _assert_in_proposal_period(self._config.read(), get_block_timestamp());

            let mut proposal = self._proposals.read(proposal_id);

            // Ensure the proposal exists, the caller is the proposer, and the proposal hasn't been cancelled
            assert(proposal.proposer.is_non_zero(), 'TR: Proposal does not exist');
            assert(proposer == proposal.proposer, 'TR: Caller is not proposer');
            assert(!proposal.is_cancelled, 'TR: Proposal is cancelled');

            // Cancel the proposal
            proposal.is_cancelled = true;
            self._proposals.write(proposal_id, proposal);

            self.emit(Event::ProposalCancelled(ProposalCancelled { proposal_id }));
        }

        /// Cast votes on one or more proposals.
        /// * `voter` - The address of the voter.
        /// * `proposal_votes` - The votes to cast.
        /// * `used_voting_strategies` - The strategies used to vote.
        fn vote(
            ref self: ContractState,
            voter: EthAddress,
            proposal_votes: Array<ProposalVote>,
            used_voting_strategies: Array<UserStrategy>,
        ) {
            let config = self._config.read();
            let current_timestamp = get_block_timestamp();

            _assert_caller_valid_and_round_active(@self);
            _assert_in_vote_period(config, current_timestamp);

            // Determine the cumulative voting power of the user at the snapshot timestamp
            let snapshot_timestamp = config.proposal_period_end_timestamp;
            let cumulative_voting_power = Round::get_cumulative_governance_power(
                @Round::unsafe_new_contract_state(), snapshot_timestamp, voter, StrategyType::VOTING, used_voting_strategies.span()
            );
            assert(cumulative_voting_power.is_non_zero(), 'TR: User has no voting power');

            // Cast votes, throwing if the remaining voting power is insufficient
            let mut leading_proposals = _get_leading_proposals(@self);
            _cast_votes_on_one_or_more_proposals(
                ref self, voter, cumulative_voting_power, proposal_votes.span(), ref leading_proposals
            );
            self._leading_proposal_ids.write(leading_proposals.index_to_pid);
        }

        /// Cancel the round.
        fn cancel_round(ref self: ContractState) {
            // Round cancellations can only come from an origin chain round
            Round::assert_caller_is_deployer(@Round::unsafe_new_contract_state());
            _assert_round_active(@self);

            let mut config = self._config.read();
            config.round_state = RoundState::Cancelled(());
            self._config.write(config);
        }

        /// Finalize the round by determining winners and relaying execution.
        /// * `awards` - The awards to distribute.
        fn finalize_round(ref self: ContractState, awards: Array<Asset>) {
            let mut config = self._config.read();

            _assert_round_active(@self);
            _assert_vote_period_has_ended(config);

            // If no awards were offered in the config, the awards array must be empty.
            // Otherwise, assert the validity of the provided awards.
            match config.award_hash.into() {
                0 => assert(awards.is_empty(), 'TR: Awards not empty'),
                _ => _assert_awards_valid(@self, awards.span()),
            }

            // If no proposals were submitted, the round must be cancelled.
            let proposal_count = self._proposal_count.read();
            assert(proposal_count.is_non_zero(), 'TR: No proposals submitted');

            let (winning_proposal_ids, winning_proposals) = _get_winning_proposal_ids_and_data(@self);
            let leaves = _compute_leaves(winning_proposal_ids, winning_proposals, awards);

            let mut merkle_tree = MerkleTreeTrait::<u256>::new();
            let merkle_root = merkle_tree.compute_merkle_root(leaves);

            let execution_strategy_address = get_round_dependency_registry().get_dependency_at_key(
                Round::origin_chain_id(@Round::unsafe_new_contract_state()), RoundType::TIMED, DependencyKey::EXECUTION_STRATEGY
            );
            if execution_strategy_address.is_non_zero() {
                let execution_strategy = IExecutionStrategyDispatcher {
                    contract_address: execution_strategy_address, 
                };
                execution_strategy.execute(_build_execution_params(merkle_root));
            }

            config.round_state = RoundState::Finalized(());
            self._config.write(config);

            self.emit(Event::RoundFinalized(RoundFinalized { winning_proposal_ids, merkle_root }));
        }
    }

    /// Initialize the round.
    fn initializer(ref self: ContractState, round_params_: Span<felt252>) {
        let RoundParams {
            award_hash,
            proposal_period_start_timestamp,
            proposal_period_duration,
            vote_period_duration,
            winner_count,
            proposal_threshold,
            proposing_strategies,
            voting_strategies,
        } = _decode_param_array(round_params_);

        assert(proposal_period_start_timestamp.is_non_zero(), 'TR: Invalid PPST');
        assert(proposal_period_duration.is_non_zero(), 'TR: Invalid PPD');
        assert(vote_period_duration.is_non_zero(), 'TR: Invalid VPD');
        assert(winner_count.is_non_zero() && winner_count <= MAX_WINNERS, 'TR: Invalid winner count');
        assert(voting_strategies.len().is_non_zero(), 'TR: No voting strategies');

        let proposal_period_end_timestamp = proposal_period_start_timestamp + proposal_period_duration;
        let vote_period_end_timestamp = proposal_period_end_timestamp + vote_period_duration;

        self._config.write(
            RoundConfig {
                round_state: RoundState::Active(()),
                winner_count,
                proposal_period_start_timestamp,
                proposal_period_end_timestamp,
                vote_period_end_timestamp,
                proposal_threshold,
                award_hash,
            }
        );

        let mut round_state = Round::unsafe_new_contract_state();
        let mut strategy_groups = array![
            StrategyGroup {
                strategy_type: StrategyType::PROPOSING, strategies: proposing_strategies
            },
            StrategyGroup {
                strategy_type: StrategyType::VOTING, strategies: voting_strategies
            },
        ];
        Round::initializer(ref round_state, strategy_groups.span());
    }

    /// Decode the round parameters from an array of felt252s.
    /// * `params` - The array of felt252s.
    fn _decode_param_array(params: Span<felt252>) -> RoundParams {
        let award_hash = *params.at(0);
        let proposal_period_start_timestamp = (*params.at(1)).try_into().unwrap();
        let proposal_period_duration = (*params.at(2)).try_into().unwrap();
        let vote_period_duration = (*params.at(3)).try_into().unwrap();
        let winner_count = (*params.at(4)).try_into().unwrap();
        let proposal_threshold = *params.at(5);

        let (proposing_strategies, offset) = Round::parse_strategies(params, 6);
        let (voting_strategies, _) = Round::parse_strategies(params, offset);

        RoundParams {
            award_hash,
            proposal_period_start_timestamp,
            proposal_period_duration,
            vote_period_duration,
            winner_count,
            proposal_threshold,
            proposing_strategies,
            voting_strategies,
        }
    }

    /// Asserts that the round is active.
    fn _assert_round_active(self: @ContractState) {
        assert(self._config.read().round_state == RoundState::Active(()), 'TR: Round not active');
    }

    /// Asserts that caller is a valid auth strategy and that the round is active.
    fn _assert_caller_valid_and_round_active(self: @ContractState) {
        Round::assert_caller_is_valid_auth_strategy(
            @Round::unsafe_new_contract_state(),
            RoundType::TIMED,
        );
        _assert_round_active(self);
    }

    /// Asserts that the provided awards are valid.
    fn _assert_awards_valid(self: @ContractState, awards: Span<Asset>) {
        let computed_award_hash = Round::compute_asset_hash(awards);
        let stored_award_hash = self._config.read().award_hash;

        assert(computed_award_hash == stored_award_hash, 'TR: Invalid awards provided');
    }

    /// Asserts that the round is in the proposal period.
    /// * `config` - The round config.
    /// * `current_timestamp` - The current timestamp.
    fn _assert_in_proposal_period(config: RoundConfig, current_timestamp: u64) {
        assert(
            current_timestamp >= config.proposal_period_start_timestamp,
            'TR: Proposal period not started',
        );
        assert(
            current_timestamp < config.proposal_period_end_timestamp,
            'TR: Proposal period has ended',
        );
    }

    /// Asserts that the round is in the vote period.
    /// * `config` - The round config.
    /// * `current_timestamp` - The current timestamp.
    fn _assert_in_vote_period(config: RoundConfig, current_timestamp: u64) {
        let vote_period_start_timestamp = config.proposal_period_end_timestamp + 1;

        assert(current_timestamp >= vote_period_start_timestamp, 'TR: Vote period not started');
        assert(current_timestamp <= config.vote_period_end_timestamp, 'TR: Vote period has ended');
    }

    /// Asserts that the vote period has ended.
    /// * `config` - The round config.
    fn _assert_vote_period_has_ended(config: RoundConfig) {
        let current_timestamp = get_block_timestamp();
        assert(current_timestamp > config.vote_period_end_timestamp, 'TR: Vote period not ended');
    }

    /// Cast votes on one or more proposals.
    /// * `voter` - The address of the voter.
    /// * `cumulative_voting_power` - The cumulative voting power of the voter.
    /// * `proposal_votes` - The votes to cast.
    /// * `leading_proposals` - The leading proposals.
    fn _cast_votes_on_one_or_more_proposals(
        ref self: ContractState,
        voter: EthAddress,
        cumulative_voting_power: u256,
        mut proposal_votes: Span<ProposalVote>,
        ref leading_proposals: LeadingProposals,
    ) {
        let mut spent_voting_power = self._spent_voting_power.read(voter);
        let mut remaining_voting_power = cumulative_voting_power - spent_voting_power;
        loop {
            match proposal_votes.pop_front() {
                Option::Some(proposal_vote) => {
                    // Cast the votes for the proposal
                    spent_voting_power += _cast_votes_on_proposal(
                        ref self, voter, *proposal_vote, remaining_voting_power, ref leading_proposals,
                    );
                    remaining_voting_power = cumulative_voting_power - spent_voting_power;
                },
                Option::None(_) => {
                    // Update the spent voting power for the user
                    self._spent_voting_power.write(voter, spent_voting_power);
                    break;
                },
            };
        };
    }

    /// Cast votes on a single proposal.
    /// * `voter` - The address of the voter.
    /// * `proposal_vote` - The proposal vote information.
    /// * `remaining_voting_power` - The remaining voting power of the voter.
    /// * `leading_proposals` - The leading proposals.
    fn _cast_votes_on_proposal(
        ref self: ContractState,
        voter: EthAddress,
        proposal_vote: ProposalVote,
        remaining_voting_power: u256,
        ref leading_proposals: LeadingProposals,
    ) -> u256 {
        let proposal_id = proposal_vote.proposal_id;
        let voting_power = proposal_vote.voting_power;

        let mut proposal = self._proposals.read(proposal_id);
        assert(proposal.proposer.is_non_zero(), 'TR: Proposal does not exist');

        // Exit early if the proposal has been cancelled
        if proposal.is_cancelled {
            return 0;
        }

        assert(voting_power.is_non_zero(), 'TR: No voting power provided');
        assert(remaining_voting_power >= voting_power, 'TR: Insufficient voting power');

        proposal.voting_power += voting_power;
        self._proposals.write(proposal_id, proposal);

        let index_or_null = leading_proposals.pid_to_index.get(proposal_id.into());
        _insert_or_update_leading_proposal(@self, ref leading_proposals, index_or_null, proposal_id, proposal);

        self.emit(Event::VoteCast(VoteCast { proposal_id, voter, voting_power }));

        voting_power
    }

    /// Build the execution parameters that will be passed to the execution strategy.
    /// * `merkle_root` - The merkle root that will be used for asset claims.
    fn _build_execution_params(merkle_root: u256) -> Span<felt252> {
        let mut execution_params = array![
            merkle_root.low.into(),
            merkle_root.high.into(),
        ];
        execution_params.span()
    }

    /// Compute the leaves for the given proposals and awards, if present.
    /// * `proposal_ids` - The proposal IDs to compute the leaves for.
    /// * `proposals` - The proposals to compute the leaves for.
    /// * `awards` - The awards to compute the leaves for.
    fn _compute_leaves(proposal_ids: Span<u32>, proposals: Span<Proposal>, awards: Array<Asset>) -> Span<u256> {
        if awards.is_empty() {
            return _compute_leaves_for_no_awards(proposal_ids, proposals);
        }
        if awards.len() == 1 {
            return _compute_leaves_for_split_award(proposal_ids, proposals, *awards.at(0));
        }
        _compute_leaves_for_assigned_awards(proposal_ids, proposals, awards)
    }

    /// Compute the leaves for the given proposals using the proposer address
    /// and rank of the proposal.
    /// * `proposal_ids` - The proposal IDs to compute the leaves for.
    /// * `proposals` - The proposals to compute the leaves for.
    fn _compute_leaves_for_no_awards(proposal_ids: Span<u32>, mut proposals: Span<Proposal>) -> Span<u256> {
        let mut leaves = ArrayTrait::new();

        let mut position = 0;
        loop {
            match proposals.pop_front() {
                Option::Some(p) => {
                    let proposal_id = *proposal_ids.at(position);

                    position += 1;
                    leaves.append(_compute_winner_leaf(proposal_id, position, *p.proposer));
                },
                Option::None(_) => {
                    break leaves.span();
                },
            };
        }
    }

    /// Compute the leaves for the given proposals using an award that is to be split
    /// evenly among the them.
    /// * `proposal_ids` - The proposal IDs to compute the leaves for.
    /// * `proposals` - The proposals to compute the leaves for.
    /// * `award_to_split` - The award to split evenly among the proposals.
    fn _compute_leaves_for_split_award(
        proposal_ids: Span<u32>, proposals: Span<Proposal>, award_to_split: Asset
    ) -> Span<u256> {
        let proposal_len: felt252 = proposals.len().into();
        let amount_per_proposal = award_to_split.amount / proposal_len.into();

        let mut leaves = ArrayTrait::new();
        let proposal_count = proposals.len();

        let mut position = 0;
        loop {
            if position == proposal_count {
                break leaves.span();
            }
            let proposal_id = *proposal_ids.at(position);
            let p = *proposals.at(position);

            position += 1;
            leaves.append(
                _compute_winner_leaf_with_award(
                    proposal_id, position, p.proposer, award_to_split.asset_id, amount_per_proposal
                )
            );
        }
    }

    /// Compute the leaves for the given proposals using awards that are to be assigned
    /// to each proposal individually.
    /// * `proposal_ids` - The proposal IDs to compute the leaves for.
    /// * `proposals` - The proposals to compute the leaves for.
    /// * `awards` - The awards to assign to each proposal.
    fn _compute_leaves_for_assigned_awards(
        proposal_ids: Span<u32>, proposals: Span<Proposal>, awards: Array<Asset>
    ) -> Span<u256> {
        let proposal_count = proposals.len();
        let mut leaves = ArrayTrait::new();

        let mut position = 0;
        loop {
            if position == proposal_count {
                break leaves.span();
            }
            let award = *awards.at(position);
            let proposal_id = *proposal_ids.at(position);
            let p = *proposals.at(position);

            position += 1;
            leaves.append(
                _compute_winner_leaf_with_award(
                    proposal_id, position, p.proposer, award.asset_id, award.amount
                )
            );
        }
    }

    /// Compute a single leaf consisting of a proposal id, proposal rank,
    /// and proposer address.
    /// * `proposal_id` - The ID of the proposal.
    /// * `proposer` - The proposer of the proposal.
    /// * `position` - The rank of the proposal in the winning set.
    fn _compute_winner_leaf(proposal_id: u32, position: u32, proposer: EthAddress) -> u256 {
        let mut leaf_input = array![
            u256_from_felt252(proposal_id.into()),
            u256_from_felt252(position.into()),
            u256_from_felt252(proposer.into()),
        ];
        keccak_u256s_be(leaf_input.span())
    }

    /// Compute a single leaf consisting of a proposal ID, proposal rank,
    /// proposer address, asset ID, and asset amount.
    /// * `proposal_id` - The ID of the proposal.
    /// * `position` - The rank of the proposal in the winning set.
    /// * `proposer` - The proposer of the proposal.
    /// * `asset_id` - The ID of the asset to award.
    /// * `asset_amount` - The amount of the asset to award.
    fn _compute_winner_leaf_with_award(
        proposal_id: u32, position: u32, proposer: EthAddress, asset_id: u256, asset_amount: u256
    ) -> u256 {
        let mut leaf_input = array![
            u256_from_felt252(proposal_id.into()),
            u256_from_felt252(position.into()),
            u256_from_felt252(proposer.into()),
            asset_id,
            asset_amount,
        ];
        keccak_u256s_be(leaf_input.span())
    }

    /// Get the ID <-> index mappings for proposals currently in the lead.
    /// Proposals must receive at least one vote to be considered.
    fn _get_leading_proposals(self: @ContractState) -> LeadingProposals {
        let mut index_to_pid = self._leading_proposal_ids.read();
        let mut pid_to_index = Default::default();
        let count = index_to_pid.len();

        let mut i = 0;
        loop {
            if i == count {
                break;
            }
            pid_to_index.insert(index_to_pid.at(i).into(), nullable_from_box(BoxTrait::new(i)));

            i += 1;
        };
        LeadingProposals { index_to_pid, pid_to_index }
    }

    /// Get the winning proposal IDs and full proposal information.
    fn _get_winning_proposal_ids_and_data(self: @ContractState) -> (Span<u32>, Span<Proposal>) {
        let mut winning_proposals = _get_leading_proposals(self);
        let mut effective_heap_size = winning_proposals.index_to_pid.len();

        // Get the winning proposal IDs in ascending order, which is cheaper
        // due to the min heap.
        let mut winning_proposal_ids_asc = ArrayTrait::new();
        loop {
            if effective_heap_size == 0 {
                break;
            }
            effective_heap_size -= 1;
            winning_proposal_ids_asc.append(_pop_least_voted_proposal(self, ref winning_proposals, effective_heap_size));
        };

        let mut winning_proposal_ids = ArrayTrait::new();
        let mut winning_proposal_data = ArrayTrait::new();

        // Reverse the order of the proposals.
        let mut i = winning_proposal_ids_asc.len();
        loop {
            if i == 0 {
                break (winning_proposal_ids.span(), winning_proposal_data.span());
            }
            i -= 1;

            let proposal_id = *winning_proposal_ids_asc.at(i);
            winning_proposal_ids.append(proposal_id);
            winning_proposal_data.append(self._proposals.read(proposal_id));
        }
    }

    /// Get the proposal ID with the smallest amount of voting power
    /// and "removing" it by moving it to the end of the heap.
    /// * `winning_proposals` - The winning proposals.
    /// * `heap_last_index` - The index of the last element in the heap.
    fn _pop_least_voted_proposal(self: @ContractState, ref winning_proposals: LeadingProposals, heap_last_index: u32) -> u32 {
        let root = winning_proposals.index_to_pid.at(0);
        let last = winning_proposals.index_to_pid.at(heap_last_index);

        // Swap the root with the last element
        _set_proposal_id_index(ref winning_proposals, 0, last);
        _set_proposal_id_index(ref winning_proposals, heap_last_index, root);

        // Only bubble down if there are elements left in the heap
        if heap_last_index > 0 {
            _bubble_down_proposal_in_heap(self, ref winning_proposals, 0, heap_last_index - 1);
        }

        // Return the minimum value
        root
    }

    /// Insert or update a proposal in the leading proposals vec.
    /// * `leading_proposals` - The leading proposals.
    /// * `index_or_null` - The index of the proposal, if it exists.
    /// * `proposal_id` - The ID of the proposal.
    /// * `proposal` - The proposal information.
    fn _insert_or_update_leading_proposal(self: @ContractState, ref leading_proposals: LeadingProposals, index_or_null: Nullable<u32>, proposal_id: u32, proposal: Proposal) {
        match match_nullable(index_or_null) {
            // Insert
            FromNullableResult::Null(()) => {
                let winner_count = self._config.read().winner_count;
                let leading_proposals_count = leading_proposals.index_to_pid.len();

                _handle_proposal_insertion_or_replacement(self, ref leading_proposals, leading_proposals_count, winner_count, proposal_id, proposal);
            },
            // Update
            FromNullableResult::NotNull(proposal_index) => {
                let leading_proposals_count = leading_proposals.index_to_pid.len();
                _bubble_down_proposal_in_heap(
                    self, ref leading_proposals, proposal_index.unbox(), leading_proposals_count - 1
                );
            },
        }
    }

    /// Insert a proposal into the leading proposals vec if it is not full,
    /// or replace the root proposal if it has a lower voting power.
    /// * `leading_proposals` - The leading proposals.
    /// * `leading_proposals_count` - The number of leading proposals.
    /// * `winner_count` - The number of winners.
    /// * `proposal_id` - The ID of the proposal.
    /// * `proposal` - The proposal information.
    fn _handle_proposal_insertion_or_replacement(
        self: @ContractState,
        ref leading_proposals: LeadingProposals,
        leading_proposals_count: u32,
        winner_count: u16,
        proposal_id: u32,
        proposal: Proposal,
    ) {
        // If winner count has not been reached, insert the proposal without removing another
        if leading_proposals_count < winner_count.into() {
            // Insert the proposal and update the heap
            let index = nullable_from_box(BoxTrait::new(leading_proposals_count));

            leading_proposals.pid_to_index.insert(proposal_id.into(), index);
            leading_proposals.index_to_pid.push(proposal_id);
            _bubble_up_proposal_in_heap(self, ref leading_proposals, leading_proposals_count);
        } else if _should_replace_least_voted_proposal(self, ref leading_proposals, proposal) {
            // Replace the proposal at the given index and update the heap
            _set_proposal_id_index(ref leading_proposals, 0, proposal_id);
            _bubble_down_proposal_in_heap(self, ref leading_proposals, 0, leading_proposals_count - 1);
        }
    }

    /// Return true if the given voting power is greater than the least voted (root) proposal's voting power,
    /// OR if the voting power is equal to the least voted proposal's voting power, but the last updated
    /// timestamp is less than the least voted proposal's last updated timestamp.
    /// * `leading_proposals` - The leading proposals.
    /// * `proposal` - The proposal information.
    fn _should_replace_least_voted_proposal(self: @ContractState, ref leading_proposals: LeadingProposals, proposal: Proposal) -> bool {
        let least_voted_proposal = self._proposals.read(leading_proposals.index_to_pid.at(0));

        if proposal.voting_power < least_voted_proposal.voting_power {
            return false;
        } else if proposal.voting_power == least_voted_proposal.voting_power {
            return proposal.last_updated_at < least_voted_proposal.last_updated_at;
        }
        return true;
    }

    /// Bubble the proposal at the given index up the heap. In this min-heap, we bubble up 
    /// when a node's value decreases, reflecting that a proposal with lower voting power 
    /// (or newer timestamp in case of a tie) should move upwards. Specifically, if the 
    /// proposal's voting power is less than its parent's OR if the proposal's voting power 
    /// is equal to its parent's but was received later, it will swap the proposal with its 
    /// parent. The loop continues until the proposal either reaches the top of the heap or 
    /// its voting power is greater than its parent's (or equal but received earlier or at the 
    /// same time).
    /// * `leading_proposals` - The leading proposals.
    /// * `index` - The index of the proposal to bubble up.
    fn _bubble_up_proposal_in_heap(self: @ContractState, ref leading_proposals: LeadingProposals, mut index: u32) {
        loop {
            if index == 0 {
                break;
            }
            let parent_index = (index - 1) / 2;
            let parent_proposal_id = leading_proposals.index_to_pid.at(parent_index);
            let proposal_id = leading_proposals.index_to_pid.at(index);

            let proposal = self._proposals.read(proposal_id);
            let parent_proposal = self._proposals.read(parent_proposal_id);

            if proposal.voting_power > parent_proposal.voting_power {
                break;
            }
            if proposal.voting_power == parent_proposal.voting_power && proposal.last_updated_at <= parent_proposal.last_updated_at {
                break;
            }

            // Swap the current proposal with its parent.
            _set_proposal_id_index(ref leading_proposals, index, parent_proposal_id);
            _set_proposal_id_index(ref leading_proposals, parent_index, proposal_id);

            index = parent_index;
        };
    }

    /// Bubble the proposal at the given index down the heap. This function is used
    /// when the root proposal is replaced in a full heap OR a proposal's voting power
    /// is increased. This function ensures that the heap property is maintained after
    /// such updates. Specifically, it checks if the updated proposal (at the given index)
    /// has a higher voting power than one of its children or if the voting power is equal
    /// and the proposal was received later than its child. If so, it swaps the proposal
    /// with its child that has the lowest voting power. This process continues (i.e., it
    /// "bubbles down" the proposal) until the proposal has lower voting power than both its
    /// children or equal voting power and was received earlier than or at the same time as
    /// its child, or until it becomes a leaf node.
    /// * `leading_proposals` - The leading proposals.
    /// * `index` - The index of the proposal to bubble down.
    /// * `heap_last_index` - The index of the last element in the heap.
    fn _bubble_down_proposal_in_heap(self: @ContractState, ref leading_proposals: LeadingProposals, mut index: u32, heap_last_index: u32) {
        loop {
            let left_child_index = 2 * index + 1;
            let right_child_index = 2 * index + 2;

            // If the left child index is beyond the effective heap size, break the loop.
            if left_child_index > heap_last_index {
                break;
            }

            // Determine the index of the child with the lowest voting power.
            let min_child_index = if right_child_index <= heap_last_index {
                let left_child_proposal = self._proposals.read(leading_proposals.index_to_pid.at(left_child_index));
                let right_child_proposal = self._proposals.read(leading_proposals.index_to_pid.at(right_child_index));

                if left_child_proposal.voting_power < right_child_proposal.voting_power || (left_child_proposal.voting_power == right_child_proposal.voting_power && left_child_proposal.last_updated_at >= right_child_proposal.last_updated_at) {
                    left_child_index
                } else {
                    right_child_index
                }
            } else {
                left_child_index
            };

            let proposal_id = leading_proposals.index_to_pid.at(index);
            let min_child_proposal_id = leading_proposals.index_to_pid.at(min_child_index);
            let proposal = self._proposals.read(proposal_id);
            let min_child_proposal = self._proposals.read(min_child_proposal_id);

            if proposal.voting_power < min_child_proposal.voting_power || (proposal.voting_power == min_child_proposal.voting_power && proposal.last_updated_at >= min_child_proposal.last_updated_at) {
                break;
            }

            // Swap the current proposal with its min child.
            _set_proposal_id_index(ref leading_proposals, index, min_child_proposal_id);
            _set_proposal_id_index(ref leading_proposals, min_child_index, proposal_id);

            index = min_child_index;
        }
    }

    /// Set the proposal ID at the given index in the map of leading proposals.
    /// * `leading_proposals` - The leading proposals.
    /// * `index` - The index to set.
    /// * `proposal_id` - The proposal ID to set.
    fn _set_proposal_id_index(ref leading_proposals: LeadingProposals, index: u32, proposal_id: u32) {
        leading_proposals.index_to_pid.set(index, proposal_id);
        leading_proposals.pid_to_index.insert(proposal_id.into(), nullable_from_box(BoxTrait::new(index)));
    }
}
