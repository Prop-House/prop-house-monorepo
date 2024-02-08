import { BigNumber } from '@ethersproject/bignumber';
import {
  AssetType,
  Custom,
  RoundType,
  Timed,
  RoundChainConfig,
  RoundEventState,
  GetRoundStateParams,
} from '../../types';
import { TimedRound__factory } from '@prophouse/protocol';
import { encoding, intsSequence, splitUint256 } from '../../utils';
import { defaultAbiCoder } from '@ethersproject/abi';
import { ADDRESS_ONE } from '../../constants';
import { Account, BlockTag, Call, hash } from 'starknet';
import { Time, TimeUnit } from 'time-ts';
import { RoundBase } from './base';
import { isAddress } from '@ethersproject/address';
import { OrderDirection, Proposal_Order_By } from '../../gql';
import { keccak256, solidityKeccak256 } from 'ethers/lib/utils';
import { AddressZero } from '@ethersproject/constants';
import { MerkleTree } from 'merkletreejs';

export class TimedRound<CS extends void | Custom = void> extends RoundBase<RoundType.TIMED, CS> {
  // Storage variable name helpers
  protected readonly _SPENT_VOTING_POWER_STORE = '_spent_voting_power';
  protected readonly _CONFIG_STORE = '_config';

  /**
   * The `RoundConfig` struct type
   */
  // prettier-ignore
  public static CONFIG_STRUCT_TYPE = `
    tuple(
      tuple(
        uint8 assetType,
        address token,
        uint256 identifier,
        uint256 amount
      )[] awards,
      tuple(address relayer, uint256 deposit) metaTx,
      uint248 proposalThreshold,
      uint256[] proposingStrategies,
      uint256[] proposingStrategyParamsFlat,
      uint256[] votingStrategies,
      uint256[] votingStrategyParamsFlat,
      uint40 proposalPeriodStartTimestamp,
      uint40 proposalPeriodDuration,
      uint40 votePeriodDuration,
      uint16 winnerCount
  )`;

  /**
   * The minimum proposal submission period duration
   */
  public static MIN_PROPOSAL_PERIOD_DURATION = Time.toSeconds(60, TimeUnit.Minutes);

  /**
   * The minimum vote period duration
   */
  public static MIN_VOTE_PERIOD_DURATION = Time.toSeconds(60, TimeUnit.Minutes);

  /**
   * Maximum winner count for this strategy
   */
  public static MAX_WINNER_COUNT = 25;

  /**
   * EIP712 timed round types
   */
  public static readonly EIP_712_TYPES = {
    ...super.EIP_712_TYPES,
    ProposalVote: [
      { name: 'proposalId', type: 'uint32' },
      { name: 'votingPower', type: 'uint256' },
    ],
    Propose: [
      { name: 'authStrategy', type: 'bytes32' },
      { name: 'round', type: 'bytes32' },
      { name: 'proposer', type: 'address' },
      { name: 'metadataUri', type: 'uint256[]' },
      { name: 'usedProposingStrategies', type: 'UserStrategy[]' },
      { name: 'salt', type: 'uint256' },
    ],
    EditProposal: [
      { name: 'authStrategy', type: 'bytes32' },
      { name: 'round', type: 'bytes32' },
      { name: 'proposer', type: 'address' },
      { name: 'proposalId', type: 'uint32' },
      { name: 'metadataUri', type: 'uint256[]' },
      { name: 'salt', type: 'uint256' },
    ],
    CancelProposal: [
      { name: 'authStrategy', type: 'bytes32' },
      { name: 'round', type: 'bytes32' },
      { name: 'proposer', type: 'address' },
      { name: 'proposalId', type: 'uint32' },
      { name: 'salt', type: 'uint256' },
    ],
    Vote: [
      { name: 'authStrategy', type: 'bytes32' },
      { name: 'round', type: 'bytes32' },
      { name: 'voter', type: 'address' },
      { name: 'proposalVotes', type: 'ProposalVote[]' },
      { name: 'usedVotingStrategies', type: 'UserStrategy[]' },
      { name: 'salt', type: 'uint256' },
    ],
  };

  /**
   * Returns a `TimedRound` instance for the provided chain configuration
   * @param config The chain config
   */
  public static for<CS extends void | Custom = void>(config: RoundChainConfig<CS>) {
    return new TimedRound<CS>(config);
  }

  /**
   * Given the provided params, return the round state
   * @param params The information required to get the round state
   */
  // prettier-ignore
  public static getState(params: GetRoundStateParams<RoundType.TIMED>) {
    const { eventState, config } = params;
    if (!eventState || !config) {
      return Timed.RoundState.UNKNOWN;
    }
    if (eventState === RoundEventState.CANCELLED) {
      return Timed.RoundState.CANCELLED;
    }

    const timestamp = BigNumber.from(this._TIMESTAMP_SECS);
    const proposalPeriodEndTimestamp = BigNumber.from(config.proposalPeriodStartTimestamp).add(
      config.proposalPeriodDuration,
    );
    if (timestamp.lt(config.proposalPeriodStartTimestamp)) {
      return Timed.RoundState.NOT_STARTED;
    }
    if (timestamp.lt(proposalPeriodEndTimestamp)) {
      return Timed.RoundState.IN_PROPOSING_PERIOD;
    }
    if (timestamp.lt(proposalPeriodEndTimestamp.add(config.votePeriodDuration))) {
      return Timed.RoundState.IN_VOTING_PERIOD;
    }
    if (timestamp.lt(proposalPeriodEndTimestamp.add(config.votePeriodDuration).add(Time.toSeconds(56, TimeUnit.Days)))) {
      if (eventState === RoundEventState.FINALIZED) {
        return Timed.RoundState.IN_CLAIMING_PERIOD;
      }
      return Timed.RoundState.IN_REPORTING_PERIOD;
    }
    return Timed.RoundState.COMPLETE;
  }

  /**
   * The Starknet relayer path
   */
  public get relayerPath() {
    return 'timed_round';
  }

  /**
   * The round type
   */
  public get type() {
    return RoundType.TIMED as const;
  }

  /**
   * The round implementation contract address
   */
  public get impl() {
    return this._addresses.evm.round.timed;
  }

  /**
   * The round implementation contract interface
   */
  public get interface() {
    return TimedRound__factory.createInterface();
  }

  /**
   * Convert the provided round configuration to a config struct
   * @param config The timed round config
   */
  public async getConfigStruct(config: Timed.Config<CS>): Promise<Timed.ConfigStruct> {
    // prettier-ignore
    if (config.proposalPeriodDurationSecs < TimedRound.MIN_PROPOSAL_PERIOD_DURATION) {
      throw new Error('Proposal period duration is too short');
    }
    if (config.votePeriodDurationSecs < TimedRound.MIN_VOTE_PERIOD_DURATION) {
      throw new Error('Vote period duration is too short');
    }
    if (config.metaTx && BigNumber.from(config.metaTx.deposit ?? 0).gt(0) && !config.metaTx.relayer) {
      throw new Error('Must provide meta-transaction relayer when deposit is non-zero');
    }
    if (config.winnerCount == 0) {
      throw new Error('Round must have at least one winner');
    }
    if (config.winnerCount > TimedRound.MAX_WINNER_COUNT) {
      throw new Error(
        `Winner count too high. Maximum winners: ${TimedRound.MAX_WINNER_COUNT}. Got: ${config.winnerCount}.`,
      );
    }
    if (config.awards.length !== 1 && config.awards.length !== config.winnerCount) {
      throw new Error(
        `Must specify a single award asset to split or one asset per winner. Winners: ${config.winnerCount}. Awards: ${config.awards.length}.`,
      );
    }
    if (config.awards.length === 1 && config.winnerCount > 1) {
      if (config.awards[0].assetType === AssetType.ERC721) {
        throw new Error(`Cannot split ERC721 between multiple winners`);
      }
      // prettier-ignore
      if (!BigNumber.from(config.awards[0].amount).mod(config.winnerCount).eq(0)) {
        throw new Error(`Award must split equally between winners`);
      }
    }
    const proposalThreshold = BigNumber.from(config.proposalThreshold ?? 0);
    if (proposalThreshold.gt(0) && !config.proposingStrategies?.length) {
      throw new Error('Round must have at least one proposing strategy when threshold is non-zero');
    }
    if (config.votingStrategies.length == 0) {
      throw new Error('Round must have at least one voting strategy');
    }

    const [proposingStrategies, votingStrategies] = await Promise.all([
      Promise.all(
        (config.proposingStrategies ?? []).map(s => this._govPower.getStrategyAddressAndParams(s)),
      ),
      Promise.all(config.votingStrategies.map(s => this._govPower.getStrategyAddressAndParams(s))),
    ]);

    return {
      awards: config.awards.map(award => encoding.getAssetStruct(award)),
      metaTx: {
        relayer: config.metaTx?.relayer ?? AddressZero,
        deposit: config.metaTx?.deposit ?? 0,
      },
      proposalThreshold,
      proposingStrategies: proposingStrategies.map(s => s.address),
      proposingStrategyParamsFlat: encoding.flatten2DArray(proposingStrategies.map(s => s.params)),
      votingStrategies: votingStrategies.map(s => s.address),
      votingStrategyParamsFlat: encoding.flatten2DArray(votingStrategies.map(s => s.params)),
      proposalPeriodStartTimestamp: config.proposalPeriodStartUnixTimestamp,
      proposalPeriodDuration: config.proposalPeriodDurationSecs,
      votePeriodDuration: config.votePeriodDurationSecs,
      winnerCount: config.winnerCount,
    };
  }

  /**
   * Determine if the provided user is eligible to propose a round
   * @param round The round address
   * @param user The user address
   */
  public async getProposeEligibility(round: string, user: string) {
    const roundWithStrategies = await this._query.getRound(round);
    const nonZeroStrategyProposingPowers = await this._govPower.getPowerForStrategies(
      user,
      roundWithStrategies.config.proposalPeriodStartTimestamp,
      roundWithStrategies.proposingStrategiesRaw,
    );
    const userProposingPower = nonZeroStrategyProposingPowers.reduce(
      (acc, { govPower }) => acc.add(govPower),
      BigNumber.from(0),
    );
    return {
      canPropose: userProposingPower.gte(roundWithStrategies.config.proposalThreshold),
      requiredProposingPower: roundWithStrategies.config.proposalThreshold,
      userProposingPower,
    };
  }

  /**
   * Estimate the round registration message fee cost (in wei)
   * @param configStruct The round configuration struct
   */
  public async estimateMessageFee(configStruct: Timed.ConfigStruct) {
    const rawPayload = await this.getContract(this.impl).getRegistrationPayload(configStruct);
    const payload = [
      encoding.hexPadLeft(ADDRESS_ONE).toLowerCase(),
      ...rawPayload.slice(1).map(p => p.toString()),
    ];
    payload[5] = configStruct.proposalPeriodStartTimestamp.toString();
    payload[6] = configStruct.proposalPeriodDuration.toString();
    payload[7] = configStruct.votePeriodDuration.toString();
    payload[8] = configStruct.winnerCount.toString();

    payload[9] = configStruct.proposalThreshold.toString();

    const response = await this._starknet['fetchEndpoint']('starknet_estimateMessageFee', {
      message: {
        from_address: this._addresses.evm.messenger,
        to_address: this._addresses.starknet.roundFactory,
        entry_point_selector: hash.getSelectorFromName('register_round'),
        payload: payload.map(p => `0x${BigInt(p).toString(16)}`),
      },
      block_id: BlockTag.pending as any,
    });
    if (!response.overall_fee) {
      throw new Error(`Unexpected message fee response: ${response}`);
    }
    return response.overall_fee.toString();
  }

  /**
   * ABI-encode the timed round configuration
   * @param config The timed round config
   */
  public encode(configStruct: Timed.ConfigStruct): string {
    return defaultAbiCoder.encode([TimedRound.CONFIG_STRUCT_TYPE], [configStruct]);
  }

  /**
   * Given the provided params, return the round state
   * @param params The information required to get the round state
   */
  public getState(params: GetRoundStateParams<RoundType.TIMED>) {
    return TimedRound.getState(params);
  }

  /**
   * Given a round address, return a `TimedRound` contract instance
   * @param address The round address
   */
  public getContract(address: string) {
    return TimedRound__factory.connect(address, this._evm);
  }

  /**
   * Sign a propose message and return the proposer, signature, and signed message
   * @param config The round address and proposal metadata URI
   */
  public async signProposeMessage(config: Timed.ProposeConfig) {
    const address = await this.signer.getAddress();
    const { proposingStrategiesRaw, config: timedConfig } = await this._query.getRound(config.round);

    if (isAddress(config.round)) {
      // If the origin chain round is provided, fetch the Starknet round address
      config.round = await this._query.getStarknetRoundAddress(config.round);
    }

    // TODO: Select only enough proposing strategies to meet the threshold
    // TODO: Fetch the proposal threshold.
    let nonZeroStrategyProposingPowers: any[] = [];
    let userParams: string[][] = [];
    if (timedConfig.proposalThreshold > 0 && proposingStrategiesRaw.length > 0) {
      const timestamp = await this.getProposingPeriodSnapshotTimestamp(config.round);
      nonZeroStrategyProposingPowers = await this._govPower.getPowerForStrategies(
        address,
        timestamp,
        proposingStrategiesRaw,
      );
      userParams = await this._govPower.getUserParamsForStrategies(
        address,
        timestamp,
        nonZeroStrategyProposingPowers.map(s => s.strategy),
      );
    }

    const metadataUriIntsSequence = intsSequence.IntsSequence.LEFromString(config.metadataUri);
    const message = {
      round: encoding.hexPadLeft(config.round),
      metadataUri: config.metadataUri,
      proposer: address,
      authStrategy: encoding.hexPadLeft(this._addresses.starknet.auth.timed.sig),
      usedProposingStrategies: nonZeroStrategyProposingPowers.map(({ strategy }, i) => ({
        id: strategy.id,
        userParams: userParams[i],
      })),
      salt: this.generateSalt(),
    };
    const signature = await this.signer._signTypedData(
      this.DOMAIN,
      this.pick(TimedRound.EIP_712_TYPES, ['Propose', 'UserStrategy']),
      {
        ...message,
        metadataUri: metadataUriIntsSequence.values,
      },
    );
    return {
      address,
      signature,
      message,
    };
  }

  /**
   * Sign a propose message and submit it to the Starknet relayer
   * @param config The round address and proposal metadata URI
   */
  public async proposeViaSignature(config: Timed.ProposeConfig) {
    const { address, signature, message } = await this.signProposeMessage(config);
    return this.sendToRelayer<Timed.RequestParams>({
      address,
      signature,
      action: Timed.Action.PROPOSE,
      data: message,
    });
  }

  /**
   * Sign an edit proposal message and return the proposer, signature, and signed message
   * @param config The round address and updated proposal metadata URI
   */
  public async signEditProposalMessage(config: Timed.EditProposalConfig) {
    const address = await this.signer.getAddress();
    if (isAddress(config.round)) {
      // If the origin chain round is provided, fetch the Starknet round address
      config.round = await this._query.getStarknetRoundAddress(config.round);
    }

    const metadataUriIntsSequence = intsSequence.IntsSequence.LEFromString(config.metadataUri);
    const message = {
      round: encoding.hexPadLeft(config.round),
      metadataUri: config.metadataUri,
      proposalId: config.proposalId,
      proposer: address,
      authStrategy: encoding.hexPadLeft(this._addresses.starknet.auth.timed.sig),
      salt: this.generateSalt(),
    };
    const signature = await this.signer._signTypedData(
      this.DOMAIN,
      this.pick(TimedRound.EIP_712_TYPES, ['EditProposal']),
      {
        ...message,
        metadataUri: metadataUriIntsSequence.values,
      },
    );
    return {
      address,
      signature,
      message,
    };
  }

  /**
   * Edit a proposal message and submit it to the Starknet relayer
   * @param config The round address and proposal metadata URI
   */
  public async editProposalViaSignature(config: Timed.EditProposalConfig) {
    const { address, signature, message } = await this.signEditProposalMessage(config);
    return this.sendToRelayer<Timed.RequestParams>({
      address,
      signature,
      action: Timed.Action.EDIT_PROPOSAL,
      data: message,
    });
  }

  /**
   * Sign a cancel proposal message and return the proposer, signature, and signed message
   * @param config The round address and proposal ID
   */
  public async signCancelProposalMessage(config: Timed.CancelProposalConfig) {
    const address = await this.signer.getAddress();
    if (isAddress(config.round)) {
      // If the origin chain round is provided, fetch the Starknet round address
      config.round = await this._query.getStarknetRoundAddress(config.round);
    }

    const message = {
      round: encoding.hexPadLeft(config.round),
      proposalId: config.proposalId,
      proposer: address,
      authStrategy: encoding.hexPadLeft(this._addresses.starknet.auth.timed.sig),
      salt: this.generateSalt(),
    };
    const signature = await this.signer._signTypedData(
      this.DOMAIN,
      this.pick(TimedRound.EIP_712_TYPES, ['CancelProposal']),
      message,
    );
    return {
      address,
      signature,
      message,
    };
  }

  /**
   * Cancel a proposal and submit it to the Starknet relayer
   * @param config The round address and proposal metadata URI
   */
  public async cancelProposalViaSignature(config: Timed.CancelProposalConfig) {
    const { address, signature, message } = await this.signCancelProposalMessage(config);
    return this.sendToRelayer<Timed.RequestParams>({
      address,
      signature,
      action: Timed.Action.CANCEL_PROPOSAL,
      data: message,
    });
  }

  /**
   * Sign proposal votes and return the voter, signature, and signed message
   * @param config The round address and proposal vote(s)
   */
  public async signVoteMessage(config: Timed.VoteConfig) {
    const address = await this.signer.getAddress();
    const suppliedVotingPower = config.votes.reduce(
      (acc, { votingPower }) => acc.add(votingPower),
      BigNumber.from(0),
    );
    if (suppliedVotingPower.eq(0)) {
      throw new Error('Must vote on at least one proposal');
    }
    const { govPowerStrategiesRaw } = await this._query.getRoundVotingStrategies(config.round);

    if (isAddress(config.round)) {
      // If the origin chain round is provided, fetch the Starknet round address
      config.round = await this._query.getStarknetRoundAddress(config.round);
    }
    const timestamp = await this.getVotingPeriodSnapshotTimestamp(config.round);
    const nonZeroStrategyVotingPowers = await this._govPower.getPowerForStrategies(
      address,
      timestamp,
      govPowerStrategiesRaw,
    );
    const totalVotingPower = nonZeroStrategyVotingPowers.reduce(
      (acc, { govPower }) => acc.add(govPower),
      BigNumber.from(0),
    );
    const spentVotingPower = await this.getSpentVotingPower(config.round, address);
    const remainingVotingPower = totalVotingPower.sub(spentVotingPower);
    if (suppliedVotingPower.gt(remainingVotingPower)) {
      throw new Error('Not enough voting power remaining');
    }

    const userParams = await this._govPower.getUserParamsForStrategies(
      address,
      timestamp,
      nonZeroStrategyVotingPowers.map(s => s.strategy),
    );
    const message = {
      round: encoding.hexPadLeft(config.round),
      voter: address,
      proposalVotes: config.votes,
      authStrategy: encoding.hexPadLeft(this._addresses.starknet.auth.timed.sig),
      usedVotingStrategies: nonZeroStrategyVotingPowers.map(({ strategy }, i) => ({
        id: strategy.id,
        userParams: userParams[i],
      })),
      salt: this.generateSalt(),
    };
    const signature = await this.signer._signTypedData(
      this.DOMAIN,
      this.pick(TimedRound.EIP_712_TYPES, ['Vote', 'ProposalVote', 'UserStrategy']),
      message,
    );
    return {
      address,
      message,
      signature,
    };
  }

  /**
   * Sign proposal votes and submit them to the Starknet relayer
   * @param config The round address and proposal vote(s)
   */
  public async voteViaSignature(config: Timed.VoteConfig) {
    const { address, signature, message } = await this.signVoteMessage(config);
    return this.sendToRelayer<Timed.RequestParams>({
      address,
      signature,
      action: Timed.Action.VOTE,
      data: message,
    });
  }

  /**
   * Relay a signed propose payload to Starknet
   * @param account The Starknet account used to submit the transaction
   * @param params The propose request params
   */
  public async relaySignedProposePayload(
    account: Account,
    params: Omit<Timed.RequestParams<Timed.Action.PROPOSE>, 'action'>,
  ) {
    const payload = {
      ...params,
      action: Timed.Action.PROPOSE,
    };

    let preCalls: Call[] = [];
    if (payload.data.usedProposingStrategies.length > 0) {
      const timestamp = await this.getProposingPeriodSnapshotTimestamp(params.data.round);
      const { govPowerStrategiesRaw } = await this._query.getGovPowerStrategies({
        where: {
          id_in: params.data.usedProposingStrategies.map(({ id }) => id),
        },
      });
      preCalls = await this._govPower.getPreCallsForStrategies(
        params.data.proposer,
        timestamp,
        govPowerStrategiesRaw,
      );
    }

    const call = this.createEVMSigAuthCall(payload, 'authenticate_propose', this.getProposeCalldata(params.data));
    const fee = await account.estimateFee([...preCalls, call]);
    return account.execute([...preCalls, call], undefined, {
      maxFee: fee.suggestedMaxFee,
    });
  }

  /**
   * Relay a signed edit proposal payload to Starknet
   * @param account The Starknet account used to submit the transaction
   * @param params The edit proposal request params
   */
  public async relaySignedEditProposalPayload(
    account: Account,
    params: Omit<Timed.RequestParams<Timed.Action.EDIT_PROPOSAL>, 'action'>,
  ) {
    const payload = {
      ...params,
      action: Timed.Action.EDIT_PROPOSAL,
    };
    const call = this.createEVMSigAuthCall(payload, 'authenticate_edit_proposal', this.getEditProposalCalldata(params.data));
    const fee = await account.estimateFee(call);
    return account.execute(call, undefined, {
      maxFee: fee.suggestedMaxFee,
    });
  }

  /**
   * Relay a signed cancel proposal payload to Starknet
   * @param account The Starknet account used to submit the transaction
   * @param params The cancel proposal request params
   */
  public async relaySignedCancelProposalPayload(
    account: Account,
    params: Omit<Timed.RequestParams<Timed.Action.CANCEL_PROPOSAL>, 'action'>,
  ) {
    const payload = {
      ...params,
      action: Timed.Action.CANCEL_PROPOSAL,
    };
    const call = this.createEVMSigAuthCall(payload, 'authenticate_cancel_proposal', this.getCancelProposalCalldata(params.data));
    const fee = await account.estimateFee(call);
    return account.execute(call, undefined, {
      maxFee: fee.suggestedMaxFee,
    });
  }

  /**
   * Relay a signed vote payload to Starknet
   * @param account The Starknet account used to submit the transaction
   * @param params The vote request params
   */
  public async relaySignedVotePayload(
    account: Account,
    params: Omit<Timed.RequestParams<Timed.Action.VOTE>, 'action'>,
  ) {
    const payload = {
      ...params,
      action: Timed.Action.VOTE,
    };

    const timestamp = await this.getVotingPeriodSnapshotTimestamp(params.data.round);
    const { govPowerStrategiesRaw } = await this._query.getGovPowerStrategies({
      where: {
        id_in: params.data.usedVotingStrategies.map(({ id }) => id),
      },
    });
    const preCalls = await this._govPower.getPreCallsForStrategies(
      params.data.voter,
      timestamp,
      govPowerStrategiesRaw,
    );

    const call = this.createEVMSigAuthCall(payload, 'authenticate_vote', this.getVoteCalldata(params.data));
    const fee = await account.estimateFee([...preCalls, call], { blockIdentifier: 'pending' });
    return account.execute([...preCalls, call], undefined, {
      maxFee: fee.suggestedMaxFee,
    });
  }

  /**
   * Finalize the round by tallying votes and submitting a result via the execution strategy
   * @param account The Starknet account used to submit the transaction
   * @param config The round finalization config
   */
  public async determineWinners(account: Account, config: Timed.FinalizationConfig) {
    const calldata = [config.awards.length.toString()].concat(
      config.awards.map(a => {
        const id = splitUint256.SplitUint256.fromUint(
          BigNumber.from(a.assetId).toBigInt(),
        );
        const amount = splitUint256.SplitUint256.fromUint(
          BigNumber.from(a.amount).toBigInt(),
        );
        return [id.low, id.high, amount.low, amount.high];
      }).flat(),
    );
    const call = {
      contractAddress: config.round,
      entrypoint: 'finalize_round',
      calldata: calldata,
    };
    const fee = await account.estimateFee(call);
    return account.execute(call, undefined, {
      maxFee: fee.suggestedMaxFee,
    });
  }

  /**
   * Cancel an active round. This function can only be called by the round manager.
   * @param roundAddress The address of the round to cancel
   */
  public async cancel(roundAddress: string) {
    return this.getContract(roundAddress).connect(this.signer).cancel({ value: 2e14 });
  }

  /**
   * Finalize a round by posting the merkle root containing the winning proposals
   * onchain and entering the claiming period.
   * @param roundAddress The address of the round to finalize
   */
  public async finalize(roundAddress: string) {
    const root = await this._query.getRoundMerkleRoot(roundAddress);
    if (!root) throw new Error(`No merkle root for round ${roundAddress}`);

    const { low, high } = splitUint256.SplitUint256.fromHex(root);

    const contract = this.getContract(roundAddress).connect(this.signer);
    return contract.finalize(low, high);
  }

  /**
   * Claim the award for submitting the provided winning proposal
   * @param config The information needed to claim an award
   */
  public async claimAward(config: Timed.ClaimAwardConfig) {
    const [round, winningProposals] = await Promise.all([
      this._query.getRound(config.round),
      this._query.getProposalsForRound(
        config.round,
        {
          where: {
            isWinner: true,
          },
          orderBy: Proposal_Order_By.WinningPosition,
          orderDirection: OrderDirection.Asc,
        },
      )
    ]);
    if (!winningProposals.length) throw new Error(`No winning proposals for round ${config.round}`);

    const proposalLeaves = winningProposals.map((proposal, i) => {
      const award = round.config.awards[i];
      const assetStruct = encoding.getAssetStruct(award);
      const [assetId, amount] = encoding.compressAsset(award);

      const leaf = this.generateClaimLeaf({
        proposalId: proposal.id,
        position: proposal.winningPosition!,
        proposer: proposal.proposer,
        assetId: assetId.toString(),
        assetAmount: amount,
      });
      return {
        leaf,
        proposal,
        assetStruct,
      };
    });
    const { proposal, leaf, assetStruct } = proposalLeaves.find(({ proposal }) => proposal.id === config.proposalId) || {};
    if (!proposal || !leaf || !assetStruct) throw new Error(`Proposal, leaf, or asset not found for proposal ID ${config.proposalId}`);

    const tree = this.generateClaimMerkleTree(proposalLeaves.map(({ leaf }) => leaf));
    const proof = tree.getHexProof(leaf);

    const contract = this.getContract(config.round).connect(this.signer);
    return contract.claim(proposal.id, proposal.winningPosition!, assetStruct, proof);
  }

  /**
   * Claim the award for submitting the provided winning proposal to a recipient
   * @param config The information needed to claim an award to a recipient
   */
  public async claimAwardToRecipient(config: Timed.ClaimAwardToConfig) {
    const [round, winningProposals] = await Promise.all([
      this._query.getRound(config.round),
      this._query.getProposalsForRound(
        config.round,
        {
          where: {
            isWinner: true,
          },
          orderBy: Proposal_Order_By.WinningPosition,
          orderDirection: OrderDirection.Asc,
        },
      )
    ]);
    if (!winningProposals.length) throw new Error(`No winning proposals for round ${config.round}`);

    const proposalLeaves = winningProposals.map((proposal, i) => {
      const award = round.config.awards[i];
      const assetStruct = encoding.getAssetStruct(award);
      const [assetId, amount] = encoding.compressAsset(award);

      const leaf = this.generateClaimLeaf({
        proposalId: proposal.id,
        position: proposal.winningPosition!,
        proposer: proposal.proposer,
        assetId: assetId.toString(),
        assetAmount: amount,
      });
      return {
        leaf,
        proposal,
        assetStruct,
      };
    });
    const { proposal, leaf, assetStruct } = proposalLeaves.find(({ proposal }) => proposal.id === config.proposalId) || {};
    if (!proposal || !leaf || !assetStruct) throw new Error(`Proposal, leaf, or asset not found for proposal ID ${config.proposalId}`);

    const tree = this.generateClaimMerkleTree(proposalLeaves.map(({ leaf }) => leaf));
    const proof = tree.getHexProof(leaf);

    const contract = this.getContract(config.round).connect(this.signer);
    return contract.claimTo(config.recipient, proposal.id, proposal.winningPosition!, assetStruct, proof);
  }

  /**
   * Generates a calldata array used to submit a proposal through an authenticator
   * @param config The information required to generate the propose calldata
   */
  public getProposeCalldata(config: Timed.ProposeCalldataConfig): string[] {
    const metadataUri = intsSequence.IntsSequence.LEFromString(config.metadataUri);
    return [
      config.proposer,
      `0x${metadataUri.values.length.toString(16)}`,
      ...metadataUri.values,
      `0x${config.usedProposingStrategies.length.toString(16)}`,
      ...config.usedProposingStrategies.flatMap(({ id, userParams }) => 
        [id, userParams.length, ...userParams],
      ).map(v => v.toString()),
    ];
  }

  /**
   * Generates a calldata array used to submit a proposal edit through an authenticator
   * @param config The information required to generate the edit proposal calldata
   */
  public getEditProposalCalldata(config: Timed.EditProposalCalldataConfig): string[] {
    const metadataUri = intsSequence.IntsSequence.LEFromString(config.metadataUri);
    return [
      config.proposer,
      `0x${config.proposalId.toString(16)}`,
      `0x${metadataUri.values.length.toString(16)}`,
      ...metadataUri.values,
    ];
  }

  /**
   * Generates a calldata array used to cancel a proposal through an authenticator
   * @param config The information required to generate the cancel proposal calldata
   */
  public getCancelProposalCalldata(config: Timed.CancelProposalCalldataConfig): string[] {
    return [config.proposer, `0x${config.proposalId.toString(16)}`];
  }

  /**
   * Generates a calldata array used to cast a vote through an authenticator
   * @param config The information required to generate the vote calldata
   */
  public getVoteCalldata(config: Timed.VoteCalldataConfig): string[] {
    return [
      config.voter,
      `0x${config.proposalVotes.length.toString(16)}`,
      ...config.proposalVotes.flatMap(({ proposalId, votingPower }) => {
        const p = splitUint256.SplitUint256.fromUint(BigInt(votingPower.toString()));
        return [proposalId, p.low, p.high];
      }),
      `0x${config.usedVotingStrategies.length.toString(16)}`,
      ...config.usedVotingStrategies.flatMap(({ id, userParams }) => 
        [id, userParams.length, ...userParams],
      ),
    ].map(v => v.toString());
  }

  /**
   * Create an EVM sig auth call using the provided parameters and calldata
   * @param params The request parameters
   * @param entrypoint The function selector
   * @param calldata Calldata specific to the entrypoint
   */
  public createEVMSigAuthCall(params: Timed.RequestParams, entrypoint: string, calldata: (string | number)[]) {
    const { round, authStrategy, salt } = params.data;
    const { r, s, v } = encoding.getRSVFromSig(params.signature);
    const rawSalt = splitUint256.SplitUint256.fromHex(`0x${salt.toString(16)}`);
    return {
      contractAddress: authStrategy,
      entrypoint,
      calldata: [
        r.low,
        r.high,
        s.low,
        s.high,
        v,
        rawSalt.low,
        rawSalt.high,
        round,
        ...calldata,
      ],
    };
  }

  /**
   * Get the proposing period snapshot block timestamp for the provided round
   * @param round The Starknet round address
   */
  public async getProposingPeriodSnapshotTimestamp(round: string): Promise<string> {
    const config = await this._starknet.getStorageAt(
      round,
      encoding.getStorageVarAddress(this._CONFIG_STORE),
    );
    return BigNumber.from(config).shr(24).mask(64).toString();
  }

  /**
   * Get the voting period snapshot block timestamp for the provided round
   * @param round The Starknet round address
   */
  public async getVotingPeriodSnapshotTimestamp(round: string): Promise<string> {
    const config = await this._starknet.getStorageAt(
      round,
      encoding.getStorageVarAddress(this._CONFIG_STORE),
    );
    return BigNumber.from(config).shr(88).mask(64).toString();
  }

  /**
   * Get the amount of voting power that has already been used by the `voter`
   * @param round The Starknet round address
   * @param voter The voter address
   */
  public async getSpentVotingPower(round: string, voter: string) {
    const key = encoding.getStorageVarAddress(this._SPENT_VOTING_POWER_STORE, voter);
    return BigNumber.from(await this._starknet.getStorageAt(round, key));
  }

  /**
   * Generate a single leaf for a claim merkle tree
   * @param winner Information relating to a round winner
   */
  protected generateClaimLeaf(winner: Timed.RoundWinner) {
    const { proposalId, position, proposer, assetId, assetAmount } = winner;
    return Buffer.from(
      solidityKeccak256(
        ['uint256', 'uint256', 'uint256', 'bytes32', 'uint256'],
        [proposalId, position, proposer, assetId, assetAmount],
      ).slice(2),
      'hex',
    ).toString('hex');
  }

  /**
   * Generate a claim merkle tree
   * @param winnersOrLeaves Round winner information or leaves
   */
  protected generateClaimMerkleTree(winnersOrLeaves: Timed.RoundWinner[] | string[]) {
    const leaves = winnersOrLeaves.map(winner => {
      if (typeof winner !== 'string') {
        return this.generateClaimLeaf(winner);
      }
      return winner;
    });
    return new MerkleTree(leaves, keccak256, { sortPairs: true });
  }
}
