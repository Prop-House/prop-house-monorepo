import { log } from '@graphprotocol/graph-ts';
import { BatchDepositToRound, DepositToRound, HouseCreated, RoundCreated, Transfer } from '../generated/PropHouse/PropHouse';
import { Account, Asset, Award, Balance, Deposit, House, Round } from '../generated/schema';
import { BIGINT_ZERO, MAX_TIMED_ROUND_WINNER_COUNT, RoundEventState, RoundType, ZERO_ADDRESS } from './lib/constants';
import {
  CommunityHouse as CommunityHouseTemplate,
  TimedRound as TimedRoundTemplate,
} from '../generated/templates';
import { AssetStruct, computeAssetID, getAssetTypeString } from './lib/utils';

export function handleHouseCreated(event: HouseCreated): void {
  const house = new House(event.params.house.toHex());

  let creator = Account.load(event.params.creator.toHex());
  if (!creator) {
    creator = new Account(event.params.creator.toHex());
    creator.save();
  }

  house.type = event.params.kind.toString();
  house.creator = creator.id;
  house.owner = creator.id;
  house.createdAt = event.block.timestamp;
  house.creationTxHash = event.transaction.hash;
  house.roundCount = 0;

  CommunityHouseTemplate.create(event.params.house);

  house.save();
}

export function handleRoundCreated(event: RoundCreated): void {
  const house = House.load(event.params.house.toHex());
  if (!house) {
    log.error('[handleRoundCreated] House not found for round: {}. Creation Hash: {}', [
      event.params.round.toHex(),
      event.transaction.hash.toHex(),
    ]);
    return;
  }

  house.roundCount += 1;
  house.save();

  let creator = Account.load(event.params.creator.toHex());
  if (!creator) {
    creator = new Account(event.params.creator.toHex());
    creator.save();
  }

  const round = new Round(event.params.round.toHex());
  round.type = event.params.kind.toString();
  round.title = event.params.title;
  round.description = event.params.description;
  round.eventState = RoundEventState.CREATED;
  round.house = house.id;
  round.creator = creator.id;
  round.manager = creator.id;
  round.createdAt = event.block.timestamp;
  round.creationTxHash = event.transaction.hash;
  round.isFullyFunded = false;

  TimedRoundTemplate.create(event.params.round);

  round.save();
}

export function handleHouseTransfer(event: Transfer): void {
  if (event.params.from.toHex() == ZERO_ADDRESS) {
    return; // Handled by `handleHouseCreated`
  }

  const house = House.load(event.params.tokenId.toHex());
  if (!house) {
    log.error('[handleHouseTransfer] House not found: {}. Transfer Hash: {}', [
      event.params.tokenId.toHex(),
      event.transaction.hash.toHex(),
    ]);
    return;
  }

  const addr = event.params.to.toHex();
  let to = Account.load(addr);
  if (!to) {
    to = new Account(addr);
    to.save();
  }

  house.owner = to.id;
  house.save();
}

export function handleDepositToRound(event: DepositToRound): void {
  // Record the deposit
  const deposit = new Deposit(
    `${event.transaction.hash.toHex()}-${event.logIndex.toString()}`,
  );

  let depositor = Account.load(event.params.from.toHex());
  if (!depositor) {
    depositor = new Account(event.params.from.toHex());
    depositor.save();
  }

  const assetId = computeAssetID(changetype<AssetStruct>(event.params.asset));
  let asset = Asset.load(assetId);
  if (!asset) {
    asset = new Asset(assetId);
    asset.assetType = getAssetTypeString(event.params.asset.assetType);
    asset.token = event.params.asset.token;
    asset.identifier = event.params.asset.identifier;
    asset.save();
  }

  deposit.txHash = event.transaction.hash;
  deposit.depositor = depositor.id;
  deposit.depositedAt = event.block.timestamp;
  deposit.asset = asset.id;
  deposit.amount = event.params.asset.amount;
  deposit.round = event.params.round.toHex();
  deposit.save();

  // Update the round balance
  const balanceId = `${event.params.round.toHex()}-${assetId}`;
  let balance = Balance.load(balanceId);
  if (!balance) {
    balance = new Balance(balanceId);
    balance.asset = asset.id;
    balance.round = event.params.round.toHex();
    balance.balance = BIGINT_ZERO;
  }
  balance.balance = balance.balance.plus(event.params.asset.amount);
  balance.updatedAt = event.block.timestamp;
  balance.save();

  checkIfRoundIsFullyFunded(event.params.round.toHex());
}

export function handleBatchDepositToRound(event: BatchDepositToRound): void {
  // Record the deposit(s)
  const deposit = new Deposit(
    `${event.transaction.hash.toHex()}-${event.logIndex.toString()}`,
  );

  let depositor = Account.load(event.params.from.toHex());
  if (!depositor) {
    depositor = new Account(event.params.from.toHex());
    depositor.save();
  }

  for (let i = 0; i < event.params.assets.length; i++) {
    const assetStruct = event.params.assets[i];
    const assetId = computeAssetID(changetype<AssetStruct>(assetStruct));
    let asset = Asset.load(assetId);
    if (!asset) {
      asset = new Asset(assetId);
      asset.assetType = getAssetTypeString(assetStruct.assetType);
      asset.token = assetStruct.token;
      asset.identifier = assetStruct.identifier;
      asset.save();
    }
  
    deposit.txHash = event.transaction.hash;
    deposit.depositor = depositor.id;
    deposit.depositedAt = event.block.timestamp;
    deposit.asset = asset.id;
    deposit.amount = assetStruct.amount;
    deposit.round = event.params.round.toHex();
    deposit.save();
  
    // Update the round balance
    const balanceId = `${event.params.round.toHex()}-${assetId}`;
    let balance = Balance.load(balanceId);
    if (!balance) {
      balance = new Balance(balanceId);
      balance.asset = asset.id;
      balance.round = event.params.round.toHex();
      balance.balance = BIGINT_ZERO;
    }
    balance.balance = balance.balance.plus(assetStruct.amount);
    balance.updatedAt = event.block.timestamp;
    balance.save();
  }

  checkIfRoundIsFullyFunded(event.params.round.toHex());
}

function checkIfRoundIsFullyFunded(roundAddress: string): void {
  const round = Round.load(roundAddress)!;
  if (round.type == RoundType.TIMED) {
    if (!round.timedConfig) return; // The deposit is part of round creation.

    let i = 0;
    let isFullyFunded = true;
    while (isFullyFunded && i < MAX_TIMED_ROUND_WINNER_COUNT) {
      const award = Award.load(`${round.id}-${i}`);
      if (!award) break; // Exit loop if no more awards
  
      const balance = Balance.load(`${round.id}-${award.asset}`);
      if (!balance || balance.balance.lt(award.amount)) {
        isFullyFunded = false; // Set to false if balance is insufficient
      }
      i++;
    }
  
    round.isFullyFunded = isFullyFunded;
    round.save();
  }
}
