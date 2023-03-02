/**
 * Voting strategy registry contract address on Starknet
 */
// prettier-ignore
export const VOTING_STRATEGY_REGISTRY_ADDRESS = '0x139d7b4e50b182303bf7a7c185b766f569e2c82df70a372518f7792c97ab242';

/**
 * EIP712 domain
 */
export const DOMAIN = {
  name: 'prop-house',
  version: '1',
  chainId: '5', // Goerli
};

/**
 * EIP712 timed funding round propose types
 */
export const TIMED_FUNDING_ROUND_PROPOSE_TYPES = {
  Propose: [
    { name: 'authStrategy', type: 'bytes32' },
    { name: 'round', type: 'bytes32' },
    { name: 'proposerAddress', type: 'address' },
    { name: 'metadataUri', type: 'string' },
    { name: 'salt', type: 'uint256' },
  ],
};

/**
 * EIP712 timed funding round vote types
 */
export const TIMED_FUNDING_ROUND_VOTE_TYPES = {
  Vote: [
    { name: 'authStrategy', type: 'bytes32' },
    { name: 'round', type: 'bytes32' },
    { name: 'voterAddress', type: 'address' },
    { name: 'proposalVotesHash', type: 'bytes32' },
    { name: 'votingStrategiesHash', type: 'bytes32' },
    { name: 'votingStrategyParamsHash', type: 'bytes32' },
    { name: 'salt', type: 'uint256' },
  ],
};