use prop_house::common::registry::voting_strategy::VotingStrategy;
use prop_house::common::libraries::round::Proposal;
use starknet::EthAddress;
use array::ArrayTrait;

trait ITimedFundingRound {
    fn get_proposal(proposal_id: u32) -> Proposal;
    fn propose(proposer_address: EthAddress, metadata_uri: Array<felt252>);
    fn edit_proposal(proposer_address: EthAddress, proposal_id: u32, metadata_uri: Array<felt252>);
    fn cancel_proposal(proposer_address: EthAddress, proposal_id: u32);
    fn vote(
        voter_address: EthAddress,
        proposal_votes: Array<ProposalVote>,
        used_voting_strategy_ids: Array<felt252>,
        user_voting_strategy_params_flat: Array<felt252>,
    );
    fn finalize_round(awards: Array<Award>);
}

mod RoundState {
    /// The round is active. It has not been cancelled or finalized.
    const ACTIVE: u8 = 0;
    /// The round has been cancelled. No more proposals or votes can be submitted. It cannot be finalized.
    const CANCELLED: u8 = 1;
    /// The round has been finalized. No more proposals or votes can be submitted.
    const FINALIZED: u8 = 2;
}

struct RoundParams {
    award_hash: felt252,
    proposal_period_start_timestamp: u64,
    proposal_period_duration: u64,
    vote_period_duration: u64,
    winner_count: u16,
    voting_strategies: Span<VotingStrategy>,
}

#[derive(Copy, Drop, Serde)]
struct Award {
    asset_id: u256,
    amount: u256,
}

#[derive(Copy, Drop, Serde)]
struct ProposalVote {
    proposal_id: u32,
    voting_power: u256,
}

// TODO: Move these to registry that's indexed by chain ID
// Deployment-time constants
const voting_strategy_registry_address: felt252 = 0xDEAD0001;
const eth_execution_strategy: felt252 = 0xDEAD0002;
const eth_tx_auth_strategy: felt252 = 0xDEAD0003;
const eth_sig_auth_strategy: felt252 = 0xDEAD0004;

#[contract]
mod TimedFundingRound {
    use starknet::{
        ContractAddress, EthAddress, get_block_timestamp, get_caller_address,
        Felt252TryIntoContractAddress
    };
    use super::{
        ITimedFundingRound, ProposalVote, RoundParams, RoundState, Award,
        voting_strategy_registry_address, eth_execution_strategy, eth_tx_auth_strategy,
        eth_sig_auth_strategy
    };
    use prop_house::rounds::timed_funding::config::RoundConfig;
    use prop_house::common::libraries::round::{Round, Proposal, ProposalWithId};
    use prop_house::common::registry::voting_strategy::{
        IVotingStrategyRegistryDispatcherTrait, IVotingStrategyRegistryDispatcher, VotingStrategy
    };
    use prop_house::common::utils::traits::{
        IVotingStrategyDispatcherTrait, IVotingStrategyDispatcher,
        IExecutionStrategyDispatcherTrait, IExecutionStrategyDispatcher
    };
    use prop_house::common::utils::array::{
        assert_no_duplicates, construct_2d_array, Immutable2DArray, get_sub_array, ArrayTraitExt,
        array_slice
    };
    use prop_house::common::utils::hash::{keccak_uint256s_be_to_be, LegacyHashEthAddress};
    use prop_house::common::utils::constants::{MASK_192, MASK_250};
    use prop_house::common::utils::merkle::MerkleTreeTrait;
    use prop_house::common::utils::serde::SpanSerde;
    use integer::{u256_from_felt252, U16IntoFelt252, U32IntoFelt252};
    use array::{ArrayTrait, SpanTrait};
    use traits::{TryInto, Into};
    use option::OptionTrait;
    use zeroable::Zeroable;

    /// The maximum number of winners that can be specified for a round.
    const MAX_WINNERS: u16 = 255;

    struct Storage {
        _config: RoundConfig,
        _is_voting_strategy_registered: LegacyMap<felt252, bool>,
        _spent_voting_power: LegacyMap<EthAddress, u256>,
    }

    #[event]
    fn ProposalCreated(
        proposal_id: u32, proposer_address: EthAddress, metadata_uri: Array<felt252>
    ) {}

    #[event]
    fn ProposalEdited(proposal_id: u32, updated_metadata_uri: Array<felt252>) {}

    #[event]
    fn ProposalCancelled(proposal_id: u32) {}

    #[event]
    fn VoteCast(proposal_id: u32, voter_address: EthAddress, voting_power: u256) {}

    #[event]
    fn RoundFinalized(winning_proposal_ids: Span<u32>, merkle_root: u256) {}

    impl TimedFundingRound of ITimedFundingRound {
        fn get_proposal(proposal_id: u32) -> Proposal {
            let proposal = Round::_proposals::read(proposal_id);
            assert(proposal.proposer.is_non_zero(), 'TFR: Proposal does not exist');

            proposal
        }

        fn propose(proposer_address: EthAddress, metadata_uri: Array<felt252>) {
            // Verify that the caller is a valid auth strategy
            _assert_caller_is_valid_auth_strategy();

            // Verify that the funding round is active
            _assert_round_active();

            let config = _config::read();
            let current_timestamp = get_block_timestamp();

            // Ensure that the round is in the proposal period
            assert(
                current_timestamp >= config.proposal_period_start_timestamp,
                'TFR: Proposal period not begun',
            );
            assert(
                current_timestamp < config.proposal_period_end_timestamp,
                'TFR: Proposal period has ended',
            );

            let proposal_id = Round::_proposal_count::read() + 1;
            let proposal = Proposal {
                proposer: proposer_address,
                last_updated_at: current_timestamp,
                is_cancelled: false,
                voting_power: 0,
            };

            // Store the proposal and increment the proposal count
            Round::_proposals::write(proposal_id, proposal);
            Round::_proposal_count::write(proposal_id);

            ProposalCreated(proposal_id, proposer_address, metadata_uri);
        }

        fn edit_proposal(
            proposer_address: EthAddress, proposal_id: u32, metadata_uri: Array<felt252>
        ) {
            // Verify that the caller is a valid auth strategy
            _assert_caller_is_valid_auth_strategy();

            // Verify that the funding round is active
            _assert_round_active();

            let mut proposal = Round::_proposals::read(proposal_id);

            // Ensure that the proposal exists
            assert(proposal.proposer.is_non_zero(), 'TFR: Proposal does not exist');

            // Ensure that the proposal has not already been cancelled
            assert(!proposal.is_cancelled, 'TFR: Proposal already cancelled');

            // Ensure that the caller is the proposer
            assert(proposer_address == proposal.proposer, 'TFR: Caller is not proposer');

            // Set the last update timestamp
            proposal.last_updated_at = get_block_timestamp();
            Round::_proposals::write(proposal_id, proposal);

            ProposalEdited(proposal_id, metadata_uri);
        }

        fn cancel_proposal(proposer_address: EthAddress, proposal_id: u32) {
            // Verify that the caller is a valid auth strategy
            _assert_caller_is_valid_auth_strategy();

            // Verify that the funding round is active
            _assert_round_active();

            let mut proposal = Round::_proposals::read(proposal_id);

            // Ensure that the proposal exists
            assert(proposal.proposer.is_non_zero(), 'TFR: Proposal does not exist');

            // Ensure that the proposal has not already been cancelled
            assert(!proposal.is_cancelled, 'TFR: Proposal already cancelled');

            // Ensure that the caller is the proposer
            assert(proposer_address == proposal.proposer, 'TFR: Caller is not proposer');

            // Cancel the proposal
            proposal.is_cancelled = true;
            Round::_proposals::write(proposal_id, proposal);

            ProposalCancelled(proposal_id);
        }

        fn vote(
            voter_address: EthAddress,
            proposal_votes: Array<ProposalVote>,
            used_voting_strategy_ids: Array<felt252>,
            user_voting_strategy_params_flat: Array<felt252>,
        ) {
            // Verify that the caller is a valid auth strategy
            _assert_caller_is_valid_auth_strategy();

            // Verify that the funding round is active
            _assert_round_active();

            let config = _config::read();
            let current_timestamp = get_block_timestamp();

            // The snapshot is taken at the proposal period end timestamp
            let snapshot_timestamp = config.proposal_period_end_timestamp;
            let vote_period_start_timestamp = snapshot_timestamp + 1;

            // Ensure that the round is in the voting period
            assert(current_timestamp >= vote_period_start_timestamp, 'TFR: Vote period not begun');
            assert(
                current_timestamp <= config.vote_period_end_timestamp, 'TFR: Vote period has ended'
            );

            // Determine the cumulative voting power of the user
            let cumulative_voting_power = _get_cumulative_voting_power(
                snapshot_timestamp,
                voter_address,
                used_voting_strategy_ids,
                user_voting_strategy_params_flat.span(),
            );
            assert(cumulative_voting_power.is_non_zero(), 'TFR: User has no voting power');

            // Cast votes, throwing if the remaining voting power is insufficient
            _cast_votes_on_one_or_more_proposals(
                voter_address, cumulative_voting_power, proposal_votes.span()
            );
        }

        fn finalize_round(awards: Array<Award>) {
            // Verify that the funding round is active
            _assert_round_active();

            // Verify the validity of the provided awards
            _assert_awards_valid(awards.span());

            let config = _config::read();
            let current_timestamp = get_block_timestamp();

            assert(
                current_timestamp > config.vote_period_end_timestamp, 'TFR: Vote period not ended'
            );

            let proposal_count = Round::_proposal_count::read();

            // If no proposals were submitted, the round must be cancelled.
            assert(proposal_count != 0, 'TFR: No proposals submitted');

            let active_proposals = Round::get_active_proposals();
            let winning_proposals = Round::get_n_proposals_by_voting_power_desc(
                active_proposals, config.winner_count.into()
            );

            // TODO: Support arbitrary execution.

            // Compute the merkle root for the given leaves.
            let leaves = _compute_leaves(winning_proposals, awards);

            let mut merkle_tree = MerkleTreeTrait::<u256>::new();
            let merkle_root = merkle_tree.compute_merkle_root(leaves);
            let execution_strategy = IExecutionStrategyDispatcher {
                contract_address: eth_execution_strategy.try_into().unwrap(), 
            };
            execution_strategy.execute(_build_execution_params(merkle_root));

            let mut config = _config::read();

            config.round_state = RoundState::FINALIZED;
            _config::write(config);

            RoundFinalized(Round::extract_proposal_ids(winning_proposals), merkle_root);
        }
    }

    #[constructor]
    fn constructor(round_params: Array<felt252>) {
        initializer(round_params.span());
    }

    /// Returns the proposal for the given proposal ID.
    /// * `proposal_id` - The proposal ID.
    #[view]
    fn get_proposal(proposal_id: u32) -> Proposal {
        TimedFundingRound::get_proposal(proposal_id)
    }

    /// Submit a proposal to the round.
    /// * `proposer_address` - The address of the proposer.
    /// * `metadata_uri` - The proposal metadata URI.
    #[external]
    fn propose(proposer_address: EthAddress, metadata_uri: Array<felt252>) {
        TimedFundingRound::propose(proposer_address, metadata_uri);
    }

    /// Edit a proposal.
    /// * `proposer_address` - The address of the proposer.
    /// * `proposal_id` - The ID of the proposal to cancel.
    /// * `metadata_uri` - The updated proposal metadata URI.
    #[external]
    fn edit_proposal(proposer_address: EthAddress, proposal_id: u32, metadata_uri: Array<felt252>) {
        TimedFundingRound::edit_proposal(proposer_address, proposal_id, metadata_uri);
    }

    /// Cancel a proposal.
    /// * `proposer_address` - The address of the proposer.
    /// * `proposal_id` - The ID of the proposal to cancel.
    #[external]
    fn cancel_proposal(proposer_address: EthAddress, proposal_id: u32) {
        TimedFundingRound::cancel_proposal(proposer_address, proposal_id);
    }

    /// Cast votes on one or more proposals.
    /// * `voter_address` - The address of the voter.
    /// * `proposal_votes` - The votes to cast.
    /// * `used_voting_strategy_ids` - The IDs of the voting strategies used to cast the votes.
    /// * `user_voting_strategy_params_flat` - The flattened parameters for the voting strategies used to cast the votes.
    #[external]
    fn vote(
        voter_address: EthAddress,
        proposal_votes: Array<ProposalVote>,
        used_voting_strategy_ids: Array<felt252>,
        user_voting_strategy_params_flat: Array<felt252>,
    ) {
        TimedFundingRound::vote(
            voter_address,
            proposal_votes,
            used_voting_strategy_ids,
            user_voting_strategy_params_flat,
        );
    }

    /// Finalize the round by determining winners and relaying execution.
    /// * `awards` - The awards to distribute.
    #[external]
    fn finalize_round(awards: Array<Award>) {
        TimedFundingRound::finalize_round(awards);
    }

    ///
    /// Internals
    ///

    /// Initialize the round.
    fn initializer(round_params_: Span<felt252>) {
        let RoundParams{award_hash,
        proposal_period_start_timestamp,
        proposal_period_duration,
        vote_period_duration,
        winner_count,
        voting_strategies,
        } =
            _decode_param_array(
            round_params_
        );

        assert(award_hash != 0, 'TFR: Invalid award hash');
        assert(proposal_period_start_timestamp != 0, 'TFR: Invalid PPST', );
        assert(proposal_period_duration != 0, 'TFR: Invalid PPD');
        assert(vote_period_duration != 0, 'TFR: Invalid VPD');
        assert(winner_count != 0 & winner_count <= MAX_WINNERS, 'TFR: Invalid winner count');
        assert(voting_strategies.len() != 0, 'TFR: No voting strategies');

        let proposal_period_end_timestamp = proposal_period_start_timestamp + proposal_period_duration;
        let vote_period_end_timestamp = proposal_period_end_timestamp + vote_period_duration;

        _config::write(
            RoundConfig {
                round_state: RoundState::ACTIVE,
                winner_count,
                proposal_period_start_timestamp,
                proposal_period_end_timestamp,
                vote_period_end_timestamp,
                award_hash,
            }
        );
        _register_voting_strategies(voting_strategies);
    }

    /// Decode the round parameters from an array of felt252s.
    fn _decode_param_array(params: Span<felt252>) -> RoundParams {
        let award_hash = *params.at(0).into();
        let proposal_period_start_timestamp = (*params.at(1)).try_into().unwrap();
        let proposal_period_duration = (*params.at(2)).try_into().unwrap();
        let vote_period_duration = (*params.at(3)).try_into().unwrap();
        let winner_count = (*params.at(4)).try_into().unwrap();
        let voting_strategy_addresses_len = (*params.at(5)).try_into().unwrap();
        let voting_strategy_addresses = array_slice(params, 6, voting_strategy_addresses_len);
        let voting_strategy_params_flat_len = (*params.at(6 + voting_strategy_addresses_len))
            .try_into()
            .unwrap();
        let voting_strategy_params_flat = array_slice(
            params, 7 + voting_strategy_addresses_len, voting_strategy_params_flat_len
        );

        let array_2d = construct_2d_array(voting_strategy_params_flat.span());
        let mut voting_strategies = Default::default();

        let mut i = 0;
        loop {
            if i == voting_strategy_addresses_len {
                break ();
            }
            let address = (*voting_strategy_addresses.at(i)).try_into().unwrap();
            let params = get_sub_array(@array_2d, i);
            voting_strategies.append(VotingStrategy { address, params: params.span() });
            i += 1;
        };

        RoundParams {
            award_hash,
            proposal_period_start_timestamp,
            proposal_period_duration,
            vote_period_duration,
            winner_count,
            voting_strategies: voting_strategies.span(),
        }
    }

    /// Asserts that the caller is a valid auth strategy.
    fn _assert_caller_is_valid_auth_strategy() {
        let caller: felt252 = get_caller_address().into();
        assert(
            caller == eth_tx_auth_strategy | caller == eth_sig_auth_strategy,
            'TFR: Invalid auth strategy'
        );
    }

    /// Asserts that the round is active.
    fn _assert_round_active() {
        assert(_config::read().round_state == RoundState::ACTIVE, 'TFR: Round not active');
    }

    /// Asserts that the provided awards are valid.
    fn _assert_awards_valid(awards: Span<Award>) {
        let flattened_awards = _flatten_and_abi_encode_awards(awards);
        let stored_award_hash = _config::read().award_hash.into();
        let computed_award_hash = keccak_uint256s_be_to_be(flattened_awards) & MASK_250;

        assert(computed_award_hash == stored_award_hash, 'TFR: Invalid awards provided');
    }

    /// Register the provided voting strategies if they are not already registered.
    /// * `voting_strategies` - The voting strategies to register.
    fn _register_voting_strategies(mut voting_strategies: Span<VotingStrategy>) {
        let voting_strategy_registry = IVotingStrategyRegistryDispatcher {
            contract_address: voting_strategy_registry_address.try_into().unwrap(), 
        };

        loop {
            match voting_strategies.pop_front() {
                Option::Some(s) => {
                    let strategy_id = voting_strategy_registry
                        .register_voting_strategy_if_not_exists(*s);
                    _is_voting_strategy_registered::write(strategy_id, true);
                },
                Option::None(_) => {
                    break ();
                },
            };
        };
    }

    /// Returns the cumulative voting power of the given voter for the provided voting strategies.
    /// * `timestamp` - The timestamp at which to calculate the cumulative voting power.
    /// * `voter` - The address of the voter.
    /// * `used_voting_strategy_ids` - The IDs of the voting strategies used to calculate the
    /// cumulative voting power.
    /// * `user_voting_strategy_params_all` - The voting strategy parameters for all users.
    fn _get_cumulative_voting_power(
        timestamp: u64,
        voter_address: EthAddress,
        mut used_voting_strategy_ids: Array<felt252>,
        user_voting_strategy_params_all: Span<felt252>,
    ) -> u256 {
        // Ensure there are no duplicates to prevent double counting
        assert_no_duplicates(ref used_voting_strategy_ids);

        let voting_strategy_registry = IVotingStrategyRegistryDispatcher {
            contract_address: voting_strategy_registry_address.try_into().unwrap(), 
        };

        let mut cumulative_voting_power = 0;
        loop {
            match used_voting_strategy_ids.pop_front() {
                Option::Some(strategy_id) => {
                    let voting_strategy = voting_strategy_registry.get_voting_strategy(strategy_id);
                    let voting_strategy_contract = IVotingStrategyDispatcher {
                        contract_address: voting_strategy.address
                    };
                    let voting_power = voting_strategy_contract
                        .get_voting_power(
                            timestamp,
                            voter_address.into(),
                            voting_strategy.params,
                            user_voting_strategy_params_all,
                        );
                    cumulative_voting_power += voting_power;
                },
                Option::None(_) => {
                    break cumulative_voting_power;
                },
            };
        }
    }

    /// Cast votes on one or more proposals.
    /// * `voter_address` - The address of the voter.
    /// * `cumulative_voting_power` - The cumulative voting power of the voter.
    /// * `proposal_votes` - The votes to cast.
    fn _cast_votes_on_one_or_more_proposals(
        voter_address: EthAddress,
        cumulative_voting_power: u256,
        mut proposal_votes: Span<ProposalVote>
    ) {
        let mut spent_voting_power = _spent_voting_power::read(voter_address);
        let mut remaining_voting_power = cumulative_voting_power - spent_voting_power;
        loop {
            match proposal_votes.pop_front() {
                Option::Some(proposal_vote) => {
                    // Cast the votes for the proposal
                    spent_voting_power +=
                        _cast_votes_on_proposal(
                            voter_address, *proposal_vote, remaining_voting_power, 
                        );
                    remaining_voting_power -= spent_voting_power;
                },
                Option::None(_) => {
                    // Update the spent voting power for the user
                    _spent_voting_power::write(voter_address, spent_voting_power);
                    break ();
                },
            };
        };
    }

    /// Cast votes on a single proposal.
    /// * `voter_address` - The address of the voter.
    /// * `proposal_vote` - The proposal vote information.
    /// * `remaining_voting_power` - The remaining voting power of the voter.
    fn _cast_votes_on_proposal(
        voter_address: EthAddress, proposal_vote: ProposalVote, remaining_voting_power: u256, 
    ) -> u256 {
        let proposal_id = proposal_vote.proposal_id;
        let voting_power = proposal_vote.voting_power;

        let mut proposal = Round::_proposals::read(proposal_id);
        assert(proposal.proposer.is_non_zero(), 'TFR: Proposal does not exist');

        // Exit early if the proposal has been cancelled
        if proposal.is_cancelled {
            return 0;
        }

        assert(voting_power.is_non_zero(), 'TFR: No voting power provided');
        assert(remaining_voting_power >= voting_power, 'TFR: Insufficient voting power');

        let new_proposal_voting_power = proposal.voting_power + voting_power;
        proposal.voting_power = new_proposal_voting_power;
        Round::_proposals::write(proposal_id, proposal);

        VoteCast(proposal_id, voter_address, voting_power);

        voting_power
    }

    // Flatten and ABI-encode (adds data offset + array length prefix) an array of award assets.
    /// * `awards` - The array of awards to flatten and encode.
    fn _flatten_and_abi_encode_awards(mut awards: Span<Award>) -> Span<u256> {
        let award_count = awards.len();
        let award_count_felt: felt252 = award_count.into();

        let mut flattened_awards = Default::default();
        flattened_awards.append(0x20.into()); // Data offset
        flattened_awards.append(award_count_felt.into()); // Array length

        loop {
            match awards.pop_front() {
                Option::Some(a) => {
                    flattened_awards.append(*a.asset_id);
                    flattened_awards.append(*a.amount);
                },
                Option::None(_) => {
                    break flattened_awards.span();
                },
            };
        }
    }

    /// Build the execution parameters that will be passed to the execution strategy.
    /// * `merkle_root` - The merkle root that will be used for asset claims.
    fn _build_execution_params(merkle_root: u256) -> Span<felt252> {
        let mut execution_params = Default::default();
        execution_params.append(merkle_root.low.into());
        execution_params.append(merkle_root.high.into());

        execution_params.span()
    }

    /// Compute the leaves for the given proposals and awards.
    /// * `proposals` - The proposals to compute the leaves for.
    /// * `awards` - The awards to compute the leaves for.
    fn _compute_leaves(proposals: Span<ProposalWithId>, awards: Array<Award>) -> Span<u256> {
        if awards.len() == 1 {
            return _compute_leaves_for_split_award(proposals, *awards.at(0));
        }
        _compute_leaves_for_assigned_awards(proposals, awards)
    }

    /// Compute the leaves for the given proposals using an award that is to be split
    /// evenly among the them.
    /// * `proposals` - The proposals to compute the leaves for.
    /// * `award_to_split` - The award to split evenly among the proposals.
    /// TODO: Support instant reclamation of remaining assets when the submitted
    /// proposal count is less than the defined number of winners.
    fn _compute_leaves_for_split_award(
        proposals: Span<ProposalWithId>, award_to_split: Award
    ) -> Span<u256> {
        let proposal_len: felt252 = proposals.len().into();
        let amount_per_proposal = award_to_split.amount / proposal_len.into();

        let mut leaves = Default::<Array<u256>>::default();
        let proposal_count = proposals.len();

        let mut i = 0;
        loop {
            if i == proposal_count {
                break leaves.span();
            }
            leaves.append(
                _compute_leaf_for_proposal_award(
                    *proposals.at(i), award_to_split.asset_id, amount_per_proposal
                )
            );
            i += 1;
        }
    }

    /// Compute the leaves for the given proposals using awards that are to be assigned
    /// to each proposal individually.
    /// * `proposals` - The proposals to compute the leaves for.
    /// * `awards` - The awards to assign to each proposal.
    /// TODO: Support instant reclamation of remainder assets when the submitted
    /// proposal count is less than the defined number of winners.
    fn _compute_leaves_for_assigned_awards(
        proposals: Span<ProposalWithId>, awards: Array<Award>
    ) -> Span<u256> {
        let proposal_count = proposals.len();
        let mut leaves = Default::<Array<u256>>::default();

        let mut i = 0;
        loop {
            if i == proposal_count {
                break leaves.span();
            }
            let award = *awards.at(i);

            leaves.append(
                _compute_leaf_for_proposal_award(*proposals.at(i), award.asset_id, award.amount)
            );
            i += 1;
        }
    }

    /// Compute a single leaf consisting of a proposal ID, proposer address, asset ID, and asset amount.
    /// * `p` - The proposal to compute the leaf for.
    /// * `asset_id` - The ID of the asset to award.
    /// * `asset_amount` - The amount of the asset to award.
    fn _compute_leaf_for_proposal_award(
        p: ProposalWithId, asset_id: u256, asset_amount: u256
    ) -> u256 {
        let proposal_id: felt252 = p.proposal_id.into();

        let mut leaf_input = Default::default();
        leaf_input.append(proposal_id.into());
        leaf_input.append(u256_from_felt252(p.proposal.proposer.into()));
        leaf_input.append(asset_id);
        leaf_input.append(asset_amount);

        keccak_uint256s_be_to_be(leaf_input.span())
    }
}
