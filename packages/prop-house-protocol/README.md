<p align="center">
  <img src="https://i.imgur.com/XXbv8r6.jpg">
</p>
<h1 align="center">
  @prophouse/protocol
</h1>
<p align="center">
  A multichain protocol that helps internet communities & creators allocate resources
</p>
<p align="center">
  <a href="https://prop.house/">
    <img src="https://img.shields.io/badge/website-prop.house-blue?style=flat-square">
  </a>
</p>

## Overview

Prop House consists of two key concepts: [Houses](#Houses) and [Rounds](#Rounds)

### Houses
A **house** is a collection of rounds. Each house has an owner.

The responsibilities of a house owner include:
- Creating new rounds on the house.
- Inviting others to create rounds on the house.

#### Community House

Currently, only one type of house exists – the Community house. It operates based on the rules mentioned above. The house itself is an NFT and ownership of the house can be transferred at any point. 

Each round within the Community house is also an NFT, minted to the creator of the round. The holder of this NFT, referred to as the round manager, controls the round. Similar to house ownership, round management permissions can be transferred at will.

### Rounds

A **round** is a competition of sorts. Ethereum users compete by offering skills, ideas, or other services in an effort to win the competition.

The exact rules of the competition depend on the selections made by the creator of the round. However, certain principles remain constant:

- Users submit their offer as a proposal.
- Voters evaluate the proposals, determining whether each submitter should be declared a winner.
- If a proposal accumulates enough votes to be declared a winner, the proposer gets something for their efforts. This is likely to be an asset, like ETH, ERC20 tokens, or NFTs.

#### Timed Round

Timed rounds have two distinct periods:

1. A timed proposing period, in which users can submit proposals for consideration.
2. A timed voting period, in which voters cast votes for their favorite proposals.

Timed rounds have a pre-defined number of winners, selected by the round creator.

At the end of the voting period, proposals are sorted by voting power, and winners are automatically selected.

#### Infinite Round

Infinite rounds run until they are cancelled or finalized.

There are no periods specific to proposing or voting. Instead, users submit proposals for consideration, specifying an exact ask, and voters either vote "for" or "against" their proposal.

There is a vote quorum in both directions ("for" or "against"). If the "for" quorum is hit, the proposal ask will be paid to the proposer. If the "against" quorum is hit, the proposal will be marked as rejected.

If either quorum is not met, the proposal will be marked as "stale", and will be hidden in the UI.

Infinite round balances can be topped up at any time.

## Contracts

Every Prop House [round](#Rounds) interacts with two chains:

1. **Starknet**, which handles core round logic like proposing, voting, and winner determination.
2. An **origin chain**, where houses are deployed, assets are held, and execution (payouts) occur.

This approach utilizes the cheaper execution cost of Starknet to make proposing, voting, and winner calculations more affordable.

Currently, Ethereum is the only supported origin chain.

### Ethereum Contracts

![](https://1369598456-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FmBmOglaY02TEQ8yWLUbk%2Fuploads%2Fk7MjupfRa1sblorDLx48%2Fethereum.png?alt=media&token=63392099-b121-4c76-a20f-e57003abb4a3)

#### [Prop House](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/ethereum/PropHouse.sol)

The `PropHouse` contract serves as the primary entry point for house and round creation, while also handling all round deposits.

Supported asset types include: ETH, ERC20s, ERC721s, ERC1155s.

#### [Manager](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/ethereum/Manager.sol)

The `Manager` contract controls which house and round implementation contracts can be deployed using the `PropHouse` contract. This contract will be owned by the Prop House team multisig. This contract has no control over existing rounds.

#### [Messenger](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/ethereum/Messenger.sol)

The `Messenger` acts as a L1<>L2 message pass-through contract between rounds and the Starknet Core contract. It uses the `PropHouse` contract to authenticate rounds and inserts the `msg.sender` in the first index of the payload that's passed to Starknet to ensure that the manager can't register a malicious round implementation that acts as another round.

#### [Community House](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/ethereum/houses/CommunityHouse.sol)

Covered [above](#community-house)

#### [Creator Pass Issuer](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/ethereum/CreatorPassIssuer.sol)

The `CreatorPassRegistry` is an `ERC1155` token, which is used by the `CommunityHouse` to determine who is authorized to create rounds on the house. The `CommunityHouse` achieves this by issuing or revoking passes (mint, burn). The ID of the token is the calling house ID.

You can see the pass authorization in the `CommunityHouse` [here](https://github.com/Prop-House/prop-house-monorepo/blob/master/packages/prop-house-protocol/contracts/ethereum/houses/CommunityHouse.sol#L136-L138).

#### [Infinite Round](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/ethereum/rounds/InfiniteRound.sol)

Mostly covered [above](#infinite-round)

This contract handles continual asset deposits and payouts (claims) to winners, and enables the round manager, holder of the round NFT, to cancel or finalize the round.

In this round type, no awards are specified during round creation. Instead, proposers can request any assets that the round holds.

Winners are reported to this contract from Starknet in batches of one or more. The payload from Starknet includes the new winner count and the latest merkle root. If the new winner count is greater than the previous winner count, anyone can consume the new root and open up claiming for the latest batch of winners. For now, the incremental merkle tree is capped at 2^10 leaves.

#### [Timed Round](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/ethereum/rounds/TimedRound.sol)

Mostly covered [above](#timed-round)

This contract handles asset deposits and payouts (claims) to winners, enables the round manager, holder of the round NFT, to cancel the round, and allows anyone to finalize the round.

Unlike infinite rounds, this contract receives a list of all winners during finalization and allows 4 weeks for claiming before depositors can reclaim unclaimed assets.

In addition, this contract supports rounds that offer no assets. When no assets are offered, the utility of this contract is the `isWinner` function, which can be used by 3rd party contracts to enable new use-cases. For example, a contract that allows the winner of the timed round to receive a streamed payment.

### Starknet Contracts

![](https://1369598456-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FmBmOglaY02TEQ8yWLUbk%2Fuploads%2Fngz4Mq2RD3YpmNGrTFHK%2Fstarknet.png?alt=media&token=ce20e09c-e102-4279-a5b9-08bc99355c0b)

#### [EthereumRoundFactory](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/starknet/src/factories/ethereum.cairo)

The `EthereumRoundFactory` is the entrypoint for all rounds created on Ethereum. It deploys an accompanying Starknet round and creates a mapping to the Ethereum round address that was passed via `msg.sender` from `Messenger`.

In addition, it can route messages from an Ethereum round contract to a Starknet round contract.

#### [InfiniteRound](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/starknet/src/rounds/infinite/round.cairo)

`InfiniteRound` handles proposing, voting, and winner determination for the infinite rounds. If a FOR or AGAINST quorum is reached, the state change will occur inside the vote transaction. A rejection will move the proposal state to REJECTED, while an approval will change the state to APPROVED and append the winner's claim leaf to the merkle tree.

`process_winners` can be called to relay new winners to the origin chain. `finalize_round`, which is called from the origin chain contract, will process any remaining winners before finalizing the round.

#### [TimedRound](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/starknet/src/rounds/timed/round.cairo)

`TimedRound` handles proposing, voting, and winner determination for the timed rounds. It accepts proposals during the proposal submission period, accepts votes during the voting period, and allows finalization, which determines winners, following the voting period.

#### Auth Strategies

Both infinite and timed rounds have authentication strategies. These strategies are pass-through contracts, which are the actual callers of all propose and vote functions on Starknet. They enable meta-transactions in two different ways.

- The transaction auth strategy accepts a commit hash from Ethereum that contains the target round, selector, and calldata, and allows any Starknet account to consume the commit, relaying the function call.
- The signature auth strategy allows any EOA to sign a message to propose or vote, which can be relayed by any Starknet account.

Users can not choose their own auth strategies. They are forever bound to a round.

#### Governance Power Strategies

These strategies can be consumed to determine proposing or voting power. There are currently four governance power strategies in use:

- **Allowlist**: Enables a predefined list of accounts to have a specific governance power.
- **Ethereum Balance Of**: Uses storage proofs to determine governance power using ERC20/ERC721 balances on Ethereum.
- **Ethereum Balance Of ERC1155**: Uses storage proofs to determine governance power using ERC1155 balances on Ethereum.
- **Vanilla**: For testing only. Gives all users a power of 1.

#### [EthereumBlockRegistry](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/starknet/src/common/libraries/ethereum_block.cairo)

This contract maps timestamps to block numbers by reading from the storage proof headers store. It is used in the Ethereum balance of governance power strategies.

#### [RoundDependencyRegistry](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/starknet/src/common/libraries/round_dependency.cairo)

This contract stores immutable dependencies, like authentication or execution strategies, for rounds. It uses a combination of the origin chain ID and round type for the dependency key, which allows Starknet rounds to service many origin chains.

Rounds can only read dependencies from this contract if they have been permanently locked. This ensures that a malicious owner cannot add a backdoor to an existing strategy.

#### [StrategyRegistry](https://github.com/Prop-House/prop-house-monorepo/tree/master/packages/prop-house-protocol/contracts/starknet/src/common/libraries/strategy.cairo)

This contract registers governance strategies by inserting them in storage, keyed by their hash, and allowing anyone to query for them. The thought here is that governance strategies will be reused many times, so we can save users on storage costs by only inserting a strategy into storage if it has never been seen before.

## Development

### Current Versions

* Scarb: [0.6.2](https://github.com/software-mansion/scarb/releases/tag/v0.6.2)
* Cairo: [2.1.1](https://github.com/starkware-libs/cairo/releases/tag/v2.1.1)

### Installing Dependencies

#### Step 1: Install Foundry

Follow the installation guide in [the Foundry Book](https://book.getfoundry.sh/getting-started/installation).

#### Step 2: Install the Scarb + Cairo

**NOTE: By installing Scarb, you already have an accompanying Cairo version which can be viewed by running `$ scarb --version`.**

Follow the installation guide on [Scarb's website](https://docs.swmansion.com/scarb/download.html).

If on Mac or Linux, you can run the following script to download the required version:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh -s -- -v 0.6.2
```

Scarb is distributed with the `scarb cairo-language-server` extension which is a compilation of the official [Cairo 1.0 Language Server](https://github.com/starkware-libs/cairo/tree/master/crates/cairo-lang-language-server), that is matching the version of Cairo compiler used in Scarb itself. Scarb's version of the language server is just a launcher for the original code, unmodified.

### Testing

#### Solidity

If it's your first time running the Solidity tests, you'll need to run `yarn test:setup` to generate the test users.

```sh
yarn test:l1
```

#### Cairo

```sh
yarn test:l2
```

#### Cross-Chain

1. Install [starknet-devnet](https://0xspaceshard.github.io/starknet-devnet/docs/intro/)
2. Run local chains:
    ```sh
    yarn chain
    ```
3. Run tests
    ```sh
    yarn test:crosschain
    ```

#### Troubleshooting

If on an M1 mac, you may receive the following error when running `starknet-devnet`:


```
+[__NSCFConstantString initialize] may have been in progress in another thread when fork() was called.
```

If so, please add the following to `~/.bash_profile`:

```
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
```

### Format Code

```sh
yarn format
```
