import { graphql } from './evm';

export const HouseFields = graphql(`
  fragment HouseFields on House {
    id
    metadata {
      name
      description
      imageURI
    }
    createdAt
    roundCount
    owner {
      id
    }
    roundCreators {
      creator {
        id
      }
      passCount
    }
  }
`);

export const VotingStrategyFields = graphql(`
  fragment VotingStrategyFields on VotingStrategy {
    id
    type
    address
    params
  }
`);

export const TimedFundingRoundConfigFields = graphql(`
  fragment TimedFundingRoundConfigFields on TimedFundingRoundConfig {
    winnerCount
    proposalPeriodStartTimestamp
    proposalPeriodEndTimestamp
    proposalPeriodDuration
    votePeriodStartTimestamp
    votePeriodEndTimestamp
    votePeriodDuration
    claimPeriodEndTimestamp
    awards {
      asset {
        assetType
        token
        identifier
      }
      amount
    }
  }
`);

export const RoundFields = graphql(`
  fragment RoundFields on Round {
    id
    type
    title
    description
    createdAt
    eventState
    manager {
      id
    }
    votingStrategies {
      votingStrategy {
        ...VotingStrategyFields
      }
    }
    timedFundingConfig {
      ...TimedFundingRoundConfigFields
    }
  }
`);

export const ManyHousesQuery = graphql(`
  query manyHouses(
    $first: Int!
    $skip: Int!
    $orderBy: House_orderBy
    $orderDirection: OrderDirection
    $where: House_filter
  ) {
    houses(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      ...HouseFields
    }
  }
`);

export const HouseQuery = graphql(`
  query house($id: ID!) {
    house(id: $id) {
      ...HouseFields
    }
  }
`);

export const ManyRoundsQuery = graphql(`
  query manyRounds(
    $first: Int!
    $skip: Int!
    $orderBy: Round_orderBy
    $orderDirection: OrderDirection
    $where: Round_filter
  ) {
    rounds(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      ...RoundFields
    }
  }
`);

export const ManyRoundsWithHouseInfoQuery = graphql(`
  query manyRoundsWithHouseInfo(
    $first: Int!
    $skip: Int!
    $orderBy: Round_orderBy
    $orderDirection: OrderDirection
    $where: Round_filter
  ) {
    rounds(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      ...RoundFields
      house {
        ...HouseFields
      }
    }
  }
`);

export const RoundQuery = graphql(`
  query round($id: ID!) {
    round(id: $id) {
      ...RoundFields
    }
  }
`);

export const RoundWithHouseInfoQuery = graphql(`
  query roundWithHouseInfo($id: ID!) {
    round(id: $id) {
      ...RoundFields
      house {
        ...HouseFields
      }
    }
  }
`);

export const ManyBalancesQuery = graphql(`
  query manyBalances(
    $first: Int!
    $skip: Int!
    $orderBy: Balance_orderBy
    $orderDirection: OrderDirection
    $where: Balance_filter
  ) {
    balances(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      id
      asset {
        assetType
        token
        identifier
      }
      balance
      updatedAt
    }
  }
`);

export const ManyVotingStrategiesQuery = graphql(`
  query manyVotingStrategies(
    $first: Int!
    $skip: Int!
    $orderBy: VotingStrategy_orderBy
    $orderDirection: OrderDirection
    $where: VotingStrategy_filter
  ) {
    votingStrategies(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      ...VotingStrategyFields
    }
  }
`);

export const ManyDepositsQuery = graphql(`
  query manyDeposits(
    $first: Int!
    $skip: Int!
    $orderBy: Deposit_orderBy
    $orderDirection: OrderDirection
    $where: Deposit_filter
  ) {
    deposits(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      id
      depositedAt
      asset {
        assetType
        token
        identifier
      }
      amount
      round {
        id
      }
    }
  }
`);

export const ManyClaimsQuery = graphql(`
  query manyClaims(
    $first: Int!
    $skip: Int!
    $orderBy: Claim_orderBy
    $orderDirection: OrderDirection
    $where: Claim_filter
  ) {
    claims(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      id
      claimedAt
      recipient
      proposalId
      round {
        id
      }
      asset {
        assetType
        token
        identifier
      }
      amount
    }
  }
`);
