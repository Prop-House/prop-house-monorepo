import { StarknetContractFactory } from 'starknet-hardhat-plugin-extended/dist/src/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  infiniteRoundSetup,
  CONTRACT_URI,
  METADATA_URI,
  ONE_DAY_SEC,
  ONE_ETHER,
  PROPOSE_SELECTOR,
  VOTE_SELECTOR,
  CANCEL_PROPOSAL_SELECTOR,
  getStarknetArtifactPaths,
  STARKNET_MAX_FEE,
  asciiToHex,
  generateIncrementalClaimLeaf,
  generateIncrementalClaimMerkleTree,
} from '../../utils';
import {
  AssetType,
  HouseType,
  RoundType,
  VotingStrategyType,
  PropHouse,
  utils,
  Asset,
  ContractAddresses,
  InfiniteRoundContract,
  InfiniteRound__factory,
  encoding,
  splitUint256,
  Infinite,
} from '@prophouse/sdk';
import * as gql from '@prophouse/sdk/dist/gql';
import * as addresses from '@prophouse/protocol/dist/src/addresses';
import { GovPowerStrategyType as GQLGovPowerStrategyType } from '@prophouse/sdk/dist/gql/evm/graphql';
import { MockStarknetMessaging, StarkNetCommit } from '../../../typechain';
import { BigNumber, BigNumberish, constants } from 'ethers';
import hre, { starknet, ethers, network } from 'hardhat';
import { StarknetContract } from 'hardhat/types';
import { poseidonHashMany } from 'micro-starknet';
import { Account, stark } from 'starknet';
import { solidity } from 'ethereum-waffle';
import chai, { expect } from 'chai';

chai.use(solidity);

const maskTo250Bits = (value: BigNumberish) => {
  return BigNumber.from(value).and(ethers.BigNumber.from(2).pow(250).sub(1));
};

enum ProposalState {
  ACTIVE = 0,
  STALE = 1,
  CANCELLED = 2,
  REJECTED = 3,
  APPROVED = 4,
}

describe('InfiniteRoundStrategy - ETH Transaction Auth Strategy', () => {
  const networkUrl = network.config.url!;

  let signer: SignerWithAddress;
  let starknetAccount: Account;

  let propHouse: PropHouse;
  let infiniteRound: InfiniteRoundContract;
  let mockStarknetMessaging: MockStarknetMessaging;
  let starknetCommit: StarkNetCommit;

  let infiniteRoundContract: StarknetContract;
  let infiniteRoundEthTxAuthStrategy: StarknetContract;

  let infiniteRoundL2Factory: StarknetContractFactory;

  let l2RoundAddress: string;
  let vanillaGovPowerStrategyId: string;

  const asset: Asset = {
    assetType: AssetType.ETH,
    amount: ONE_ETHER,
  };

  before(async () => {
    await starknet.devnet.restart();

    const { block_timestamp } = await starknet.devnet.setTime(Math.floor(Date.now() / 1000));

    [signer] = await ethers.getSigners();

    const config = await infiniteRoundSetup();
    ({
      infiniteRoundEthTxAuthStrategy,
      infiniteRoundL2Factory,
      mockStarknetMessaging,
      starknetAccount,
      starknetCommit,
    } = config);

    const vanillaGovPowerStrategyMetadata = getStarknetArtifactPaths(
      'VanillaGovernancePowerStrategy',
    );
    const vanillaGovPowerStrategyFactory = new StarknetContractFactory({
      hre,
      abiPath: vanillaGovPowerStrategyMetadata.sierra,
      metadataPath: vanillaGovPowerStrategyMetadata.sierra,
      casmPath: vanillaGovPowerStrategyMetadata.casm,
    });
    await config.starknetSigner.declare(vanillaGovPowerStrategyFactory, {
      maxFee: STARKNET_MAX_FEE,
    });

    const vanillaGovPowerStrategy = await config.starknetSigner.deploy(
      vanillaGovPowerStrategyFactory,
    );
    vanillaGovPowerStrategyId = `0x${poseidonHashMany([
      BigInt(vanillaGovPowerStrategy.address),
    ]).toString(16)}`;

    // Stub `getRoundVotingStrategies`
    gql.QueryWrapper.prototype.getRoundVotingStrategies = () =>
      Promise.resolve({
        govPowerStrategies: [
          {
            id: vanillaGovPowerStrategyId,
            type: GQLGovPowerStrategyType.Vanilla,
            address: vanillaGovPowerStrategy.address,
            params: [],
          },
        ],
      });

    // Override contract addresses
    (addresses.getContractAddressesForChainOrThrow as Function) = (): ContractAddresses => {
      return {
        evm: {
          prophouse: config.propHouse.address,
          messenger: config.messenger.address,
          house: {
            community: config.communityHouseImpl.address,
          },
          round: {
            infinite: config.infiniteRoundImpl.address,
            timed: constants.AddressZero,
          },
        },
        starknet: {
          roundFactory: config.roundFactory.address,
          strategyRegistry: config.strategyRegistry.address,
          govPower: {
            allowlist: constants.HashZero,
            balanceOf: constants.HashZero,
            vanilla: vanillaGovPowerStrategy.address,
          },
          auth: {
            infinite: {
              sig: config.infiniteRoundEthSigAuthStrategy.address,
              tx: config.infiniteRoundEthTxAuthStrategy.address,
            },
            timed: {
              sig: constants.HashZero,
              tx: constants.HashZero,
            },
          },
          herodotus: {
            factRegistry: '',
            l1HeadersStore: '',
          },
          classHashes: {
            infinite: config.infiniteRoundClassHash,
            timed: constants.HashZero,
          },
        },
      };
    };

    propHouse = new PropHouse({
      evmChainId: await signer.getChainId(),
      starknet: config.starknetProvider,
      evm: signer,
    });
    await starknet.devnet.loadL1MessagingContract(networkUrl, mockStarknetMessaging.address);

    const creationResponse = await propHouse.createAndFundRoundOnNewHouse(
      {
        houseType: HouseType.COMMUNITY,
        config: {
          contractURI: CONTRACT_URI,
        },
      },
      {
        roundType: RoundType.INFINITE,
        title: 'Test Round',
        description: 'A round used for testing purposes',
        config: {
          votingStrategies: [
            {
              strategyType: VotingStrategyType.VANILLA,
            },
          ],
          startUnixTimestamp: block_timestamp,
          votePeriodDurationSecs: ONE_DAY_SEC * 2,
          quorumFor: 1,
          quorumAgainst: 1,
        },
      },
      [
        {
          ...asset,
          // Ensure plenty of funds for testing
          amount: ONE_ETHER.mul(10),
        },
      ],
    );

    const creationReceipt = await creationResponse.wait();
    const [, , roundAddress] = creationReceipt.events!.find(
      ({ event }) => event === 'RoundCreated',
    )!.args!;

    await starknet.devnet.flush();

    infiniteRound = InfiniteRound__factory.connect(roundAddress, signer);

    // Send the pending L1 -> L2 message
    await starknet.devnet.flush();

    const block = await starknet.getBlock({
      blockNumber: 'latest',
    });
    [, l2RoundAddress] = block.transaction_receipts[0].events[1].data;

    infiniteRoundContract = infiniteRoundL2Factory.getContractAt(
      `0x${BigInt(l2RoundAddress).toString(16)}`,
    );

    await starknet.devnet.increaseTime(ONE_DAY_SEC + 1);
    await starknet.devnet.createBlock();
  });

  it('should create a proposal using an Ethereum transaction', async () => {
    const requestedAssets = encoding.compressAssets([asset]);
    const proposeCalldata = propHouse.round.infinite.getProposeCalldata({
      proposer: signer.address,
      metadataUri: METADATA_URI,
      requestedAssets: requestedAssets.map(([assetId, amount]) => ({ assetId, amount })),
      usedProposingStrategies: [],
    });

    // Commit the hash of the payload to the StarkNet commit L1 contract
    await starknetCommit.commit(
      infiniteRoundEthTxAuthStrategy.address,
      utils.encoding.getCommit(l2RoundAddress, PROPOSE_SELECTOR, proposeCalldata),
      {
        value: STARKNET_MAX_FEE,
      },
    );

    // Check that the L1 -> L2 message has been propagated
    expect((await starknet.devnet.flush()).consumed_messages.from_l1).to.have.a.lengthOf(1);

    // Create the proposal
    const { transaction_hash } = await starknetAccount.execute({
      contractAddress: infiniteRoundEthTxAuthStrategy.address,
      entrypoint: 'authenticate_propose',
      calldata: [l2RoundAddress, ...proposeCalldata],
    });

    const { events } = await starknet.getTransactionReceipt(transaction_hash);

    const [proposalId, proposerAddress, metadataUriLength, ...remainingData] = events[0].data;
    const actualMetadataUri = remainingData.slice(0, parseInt(metadataUriLength, 16));
    const requestedAssetLength = remainingData[parseInt(metadataUriLength, 16)];
    const actualRequestedAssets = remainingData.slice(parseInt(metadataUriLength, 16) + 1);

    expect(parseInt(proposalId, 16)).to.equal(1);
    expect(proposerAddress).to.equal(signer.address.toLowerCase());
    expect(parseInt(metadataUriLength, 16)).to.equal(3);
    expect(parseInt(requestedAssetLength, 16)).to.equal(1);
    expect(actualRequestedAssets).to.deep.equal(
      requestedAssets
        .map(asset => {
          const id = splitUint256.SplitUint256.fromUint(BigNumber.from(asset[0]).toBigInt());
          const amount = splitUint256.SplitUint256.fromUint(BigNumber.from(asset[1]).toBigInt());
          return [id.low, id.high, amount.low, amount.high];
        })
        .flat(),
    );

    const expectedMetadataUri = utils.intsSequence.IntsSequence.LEFromString(METADATA_URI);
    for (let i = 0; i < actualMetadataUri.length; i++) {
      expect(actualMetadataUri[i]).to.equal(expectedMetadataUri.values[i]);
    }
  });

  it('should not allow the same commit to be executed multiple times', async () => {
    const proposeCalldata = propHouse.round.infinite.getProposeCalldata({
      proposer: signer.address,
      metadataUri: METADATA_URI,
      requestedAssets: encoding
        .compressAssets([asset])
        .map(([assetId, amount]) => ({ assetId, amount })),
      usedProposingStrategies: [],
    });

    // Commit the hash of the payload to the StarkNet commit L1 contract
    await starknetCommit.commit(
      infiniteRoundEthTxAuthStrategy.address,
      utils.encoding.getCommit(l2RoundAddress, PROPOSE_SELECTOR, proposeCalldata),
      {
        value: STARKNET_MAX_FEE,
      },
    );

    await starknet.devnet.flush();
    await starknetAccount.execute({
      contractAddress: infiniteRoundEthTxAuthStrategy.address,
      entrypoint: 'authenticate_propose',
      calldata: [l2RoundAddress, ...proposeCalldata],
    });

    try {
      // Second attempt at calling authenticate should fail
      await starknetAccount.execute({
        contractAddress: infiniteRoundEthTxAuthStrategy.address,
        entrypoint: 'authenticate_propose',
        calldata: [l2RoundAddress, ...proposeCalldata],
      });
      expect(true).to.equal(false); // This line should never be reached
    } catch (error: any) {
      expect(error.message).to.contain(asciiToHex('EthereumTx: Unknown sender/hash'));
    }
  });

  it('should fail if the correct hash of the payload is not committed on L1 before execution is called', async () => {
    const proposeCalldata = propHouse.round.infinite.getProposeCalldata({
      proposer: signer.address,
      metadataUri: METADATA_URI,
      requestedAssets: encoding.compressAssets([asset]).map(
        ([assetId, amount]) => ({ assetId, amount }),
      ),
      usedProposingStrategies: [],
    });

    // Wrong selector
    await starknetCommit.commit(
      infiniteRoundEthTxAuthStrategy.address,
      utils.encoding.getCommit(l2RoundAddress, VOTE_SELECTOR, proposeCalldata),
      {
        value: STARKNET_MAX_FEE,
      },
    );

    await starknet.devnet.flush();
    try {
      await starknetAccount.execute({
        contractAddress: infiniteRoundEthTxAuthStrategy.address,
        entrypoint: 'authenticate_propose',
        calldata: [l2RoundAddress, ...proposeCalldata],
      });
      expect(true).to.equal(false); // This line should never be reached
    } catch (error: any) {
      expect(error.message).to.contain(asciiToHex('EthereumTx: Unknown sender/hash'));
    }
  });

  it('should fail if the commit sender address is not equal to the address in the payload', async () => {
    const proposeCalldata = propHouse.round.infinite.getProposeCalldata({
      proposer: ethers.Wallet.createRandom().address, // Random l1 address in the calldata
      metadataUri: METADATA_URI,
      requestedAssets: encoding.compressAssets([asset]).map(
        ([assetId, amount]) => ({ assetId, amount }),
      ),
      usedProposingStrategies: [],
    });

    await starknetCommit.commit(
      infiniteRoundEthTxAuthStrategy.address,
      utils.encoding.getCommit(l2RoundAddress, PROPOSE_SELECTOR, proposeCalldata),
      {
        value: STARKNET_MAX_FEE,
      },
    );

    await starknet.devnet.flush();
    try {
      await starknetAccount.execute({
        contractAddress: infiniteRoundEthTxAuthStrategy.address,
        entrypoint: 'authenticate_propose',
        calldata: [l2RoundAddress, ...proposeCalldata],
      });
      expect(true).to.equal(false); // This line should never be reached
    } catch (error: any) {
      expect(error.message).to.contain(asciiToHex('EthereumTx: Unknown sender/hash'));
    }
  });

  it('should cancel a proposal using an Ethereum transaction', async () => {
    const proposeCalldata = propHouse.round.infinite.getProposeCalldata({
      proposer: signer.address,
      metadataUri: METADATA_URI,
      requestedAssets: encoding.compressAssets([asset]).map(
        ([assetId, amount]) => ({ assetId, amount }),
      ),
      usedProposingStrategies: [],
    });

    await starknetCommit.commit(
      infiniteRoundEthTxAuthStrategy.address,
      utils.encoding.getCommit(l2RoundAddress, PROPOSE_SELECTOR, proposeCalldata),
      {
        value: STARKNET_MAX_FEE,
      },
    );

    // Check that the L1 -> L2 message has been propagated
    expect((await starknet.devnet.flush()).consumed_messages.from_l1).to.have.a.lengthOf(1);

    const { transaction_hash } = await starknetAccount.execute({
      contractAddress: infiniteRoundEthTxAuthStrategy.address,
      entrypoint: 'authenticate_propose',
      calldata: [l2RoundAddress, ...proposeCalldata],
    });

    const { events } = await starknet.getTransactionReceipt(transaction_hash);
    const [proposalId] = events[0].data;

    let { response } = await infiniteRoundContract.call('get_proposal', {
      proposal_id: proposalId,
    });
    expect(Number(response.state)).to.equal(ProposalState.ACTIVE);

    const cancelCalldata = stark.compileCalldata({
      proposer: signer.address,
      proposal_id: proposalId,
    });
    await starknetCommit.commit(
      infiniteRoundEthTxAuthStrategy.address,
      utils.encoding.getCommit(l2RoundAddress, CANCEL_PROPOSAL_SELECTOR, cancelCalldata),
      {
        value: STARKNET_MAX_FEE,
      },
    );

    expect((await starknet.devnet.flush()).consumed_messages.from_l1).to.have.a.lengthOf(1);

    await starknetAccount.execute({
      contractAddress: infiniteRoundEthTxAuthStrategy.address,
      entrypoint: 'authenticate_cancel_proposal',
      calldata: [l2RoundAddress, ...cancelCalldata],
    });

    ({ response } = await infiniteRoundContract.call('get_proposal', {
      proposal_id: proposalId,
    }));
    expect(Number(response.state)).to.equal(ProposalState.CANCELLED);
  });

  it('should create votes using an Ethereum transaction', async () => {
    const voteCalldata = propHouse.round.infinite.getVoteCalldata({
      voter: signer.address,
      proposalVotes: [
        {
          proposalId: 1,
          proposalVersion: 1,
          votingPower: 1,
          direction: Infinite.Direction.FOR,
        },
        {
          proposalId: 2,
          proposalVersion: 1,
          votingPower: 1,
          direction: Infinite.Direction.FOR,
        },
      ],
      usedVotingStrategies: [
        {
          id: vanillaGovPowerStrategyId,
          userParams: [],
        },
      ],
    });

    // Commit the hash of the payload to the StarkNet commit L1 contract
    await starknetCommit.commit(
      infiniteRoundEthTxAuthStrategy.address,
      utils.encoding.getCommit(l2RoundAddress, VOTE_SELECTOR, voteCalldata),
      {
        value: STARKNET_MAX_FEE,
      },
    );
    // Check that the L1 -> L2 message has been propagated
    expect((await starknet.devnet.flush()).consumed_messages.from_l1).to.have.a.lengthOf(1);

    await starknet.devnet.increaseTime(ONE_DAY_SEC);
    await starknet.devnet.createBlock();

    // Cast vote
    const { transaction_hash } = await starknetAccount.execute({
      contractAddress: infiniteRoundEthTxAuthStrategy.address,
      entrypoint: 'authenticate_vote',
      calldata: [l2RoundAddress, ...voteCalldata],
    });
    const { events } = await starknet.getTransactionReceipt(transaction_hash);

    // Approved events, which includes the approved proposal IDs
    expect(parseInt(events[0].data[0], 16)).to.equal(1);
    expect(parseInt(events[2].data[0], 16)).to.equal(2);

    const [pid1, voter1, vpLow1, vpHigh1, direction1] = events[1].data;
    const [pid2, voter2, vpLow2, vpHigh2, direction2] = events[3].data;

    expect(parseInt(pid1, 16)).to.equal(1);
    expect(voter1).to.equal(signer.address.toLowerCase());
    expect(parseInt(vpLow1, 16)).to.equal(1);
    expect(parseInt(vpHigh1, 16)).to.equal(0);
    expect(parseInt(direction1, 16)).to.equal(Infinite.Direction.FOR);
    expect(parseInt(pid2, 16)).to.equal(2);
    expect(voter2).to.equal(signer.address.toLowerCase());
    expect(parseInt(vpLow2, 16)).to.equal(1);
    expect(parseInt(vpHigh2, 16)).to.equal(0);
    expect(parseInt(direction2, 16)).to.equal(Infinite.Direction.FOR);
  });

  it('should allow winners to claim their awards', async () => {
    const { transaction_hash } = await starknetAccount.execute({
      contractAddress: infiniteRoundContract.address,
      entrypoint: 'process_winners',
      calldata: [],
    });
    const { events } = await starknet.getTransactionReceipt(transaction_hash);

    const [winnerCount, merkleRootLow, merkleRootHigh] = events[0].data;
    const merkleRoot = splitUint256.SplitUint256.fromObj({
      low: merkleRootLow,
      high: merkleRootHigh,
    });

    expect(parseInt(winnerCount, 16)).to.equal(2);
    expect(merkleRoot.toUint()).to.not.equal(0n);

    expect((await starknet.devnet.flush()).consumed_messages.from_l2).to.have.a.lengthOf(1);

    const updateWinnersTx = infiniteRound.updateWinners(winnerCount, merkleRootLow, merkleRootHigh);
    await expect(updateWinnersTx).to.emit(infiniteRound, 'WinnersUpdated').withArgs(winnerCount);

    const proposalIds = [1, 2];
    const requestedAssetsHash = maskTo250Bits(
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['tuple(bytes32,uint256)[]'],
          [[[utils.encoding.getETHAssetID(), ONE_ETHER]]],
        ),
      ),
    );
    const tree = generateIncrementalClaimMerkleTree(
      proposalIds.map(proposalId => ({
        proposalId,
        proposer: signer.address,
        requestedAssetsHash: requestedAssetsHash.toHexString(),
      })),
    );

    for (let i = 0; i < proposalIds.length; i++) {
      const proof = tree.getProof(i);
      const claimTx = await infiniteRound.claim(
        proposalIds[i],
        [
          {
            assetType: AssetType.ETH,
            amount: ONE_ETHER,
            token: constants.AddressZero,
            identifier: 0,
          },
        ],
        {
          pathIndices: proof.pathIndices,
          siblings: proof.siblings.flat().map((s: BigNumberish) => encoding.hexPadLeft(
            BigNumber.from(s).toHexString(),
          )),
        },
      );
      await expect(claimTx).to.emit(infiniteRound, 'AssetsClaimed');
    }
  });

  it('should finalize a round', async () => {
    const startFinalizationTx = infiniteRound.startFinalization({
      value: STARKNET_MAX_FEE,
    });
    await expect(startFinalizationTx).to.emit(infiniteRound, 'RoundFinalizationStarted');

    // Process L1 -> L2 message (finalize_round)
    await starknet.devnet.flush();

    // Process L2 -> L1 message (completeFinalization)
    await starknet.devnet.flush();

    const completeFinalizationTx = infiniteRound.completeFinalization(2);
    await expect(completeFinalizationTx).to.emit(infiniteRound, 'RoundFinalized');
  });
});
