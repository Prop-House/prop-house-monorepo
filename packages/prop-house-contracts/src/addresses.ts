import goerli from '../deployments/goerli.json';

export enum ChainId {
  EthereumMainnet = 1,
  EthereumGoerli = 5,
  EthereumHardhat = 31337,
}

export interface HouseImpls {
  community: string;
}

export interface RoundImpls {
  timedFunding: string;
}

export interface VotingStrategies {
  balanceOf: string;
  whitelist: string;
  vanilla: string;
}

export interface AuthStrategies {
  timedFundingEthSig: string;
  timedFundingEthTx: string;
}

export interface FossilContracts {
  factRegistry: string;
  l1HeadersStore: string;
}

export interface ClassHashes {
  timedFunding: string;
}

export interface EVMContracts {
  prophouse: string;
  house: HouseImpls;
  round: RoundImpls;
}

export interface StarknetContracts {
  votingRegistry: string;
  voting: VotingStrategies;
  auth: AuthStrategies;
  fossil: FossilContracts;
  classHashes: ClassHashes;
}

export interface ContractAddresses {
  evm: EVMContracts;
  starknet: StarknetContracts;
}

export const contracts: Record<number, ContractAddresses> = {
  [ChainId.EthereumGoerli]: {
    evm: {
      prophouse: goerli.ethereum.address.propHouse,
      house: {
        community: goerli.ethereum.address.communityHouseImpl,
      },
      round: {
        timedFunding: goerli.ethereum.address.timedFundingRoundImpl,
      },
    },
    starknet: {
      votingRegistry: goerli.starknet.address.votingStrategyRegistry,
      voting: {
        balanceOf: goerli.starknet.address.ethereumBalanceOfVotingStrategy,
        whitelist: goerli.starknet.address.merkleWhitelistVotingStrategy,
        vanilla: goerli.starknet.address.vanillaVotingStrategy,
      },
      auth: {
        timedFundingEthSig: goerli.starknet.address.timedFundingRoundEthSigAuthStrategy,
        timedFundingEthTx: goerli.starknet.address.timedFundingRoundEthTxAuthStrategy,
      },
      fossil: {
        factRegistry: goerli.starknet.address.fossil.factRegistry,
        l1HeadersStore: goerli.starknet.address.fossil.l1HeadersStore,
      },
      classHashes: {
        timedFunding: goerli.starknet.classHash.timedFundingRound,
      },
    },
  },
};

/**
 * Get addresses of contracts that have been deployed to a supported chain.
 * Throws if there are no known contracts deployed on the corresponding chain.
 * @param chainId The desired chainId
 */
export const getContractAddressesForChainOrThrow = (chainId: number) => {
  if (!contracts[chainId]) {
    throw new Error(
      `Unknown chain id (${chainId}). No known contracts have been deployed on this chain.`,
    );
  }
  return contracts[chainId];
};
