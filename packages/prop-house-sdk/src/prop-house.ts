import { PropHouseContract, PropHouse__factory } from '@prophouse/protocol';
import {
  Asset,
  AssetStruct,
  AssetType,
  Custom,
  EVM,
  HouseInfo,
  HouseType,
  PropHouseConfig,
  RoundConfigStruct,
  RoundInfo,
  RoundType,
} from './types';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { Signer } from '@ethersproject/abstract-signer';
import { Overrides } from '@ethersproject/contracts';
import { parseEther } from '@ethersproject/units';
import { ChainBase } from './chain-base';
import { QueryWrapper } from './gql';
import { encoding } from './utils';
import { GovPowerManager } from './gov-power';
import { HouseManager } from './houses';
import { RoundManager } from './rounds';

export class PropHouse<CS extends Custom | void = void> extends ChainBase {
  private readonly _query: QueryWrapper;
  private _contract: PropHouseContract;
  private _govPower: GovPowerManager<CS>;
  private _house: HouseManager;
  private _round: RoundManager<CS>;

  /**
   * The current internal cap for a L1 -> L2 round creation message.
   */
  private static readonly _MAX_STARKNET_MESSAGE_FEE_CAP = parseEther('0.0015');

  /**
   * The prop house contract instance
   */
  public get contract() {
    return this._contract;
  }

  /**
   * Prop house contract addresses
   */
  public get addresses() {
    return this._addresses;
  }

  /**
   * Governance power helper methods and utilities
   */
  public get govPower() {
    return this._govPower;
  }

  /**
   * House helper methods and utilities
   */
  public get house() {
    return this._house;
  }

  /**
   * Round helper methods and utilities
   */
  public get round() {
    return this._round;
  }

  /**
   * The GraphQL query wrapper
   */
  public get query() {
    return this._query;
  }

  constructor(config: PropHouseConfig<CS>) {
    super(config);

    this._contract = PropHouse__factory.connect(this.addresses.evm.prophouse, this._evm);
    this._query = QueryWrapper.for(config.evmChainId);
    this._govPower = GovPowerManager.for<CS>(config);
    this._house = HouseManager.for(config);
    this._round = RoundManager.for<CS>({
      ...config,
      govPower: this._govPower,
    });
  }

  /**
   * Attach the `PropHouse` instance to a new EVM provider or signer
   * @param evm EVM provider/connection information and optional signer
   */
  public attach(evm: EVM) {
    const config = {
      evm,
      evmChainId: this._evmChainId,
      starknet: this._starknet,
    };
    this._evm = this.toEVMSignerOrProvider(evm);
    this._contract = this.contract.connect(evm);
    this._govPower = GovPowerManager.for<CS>(config);
    this._house = HouseManager.for(config);
    this._round = RoundManager.for<CS>({
      ...config,
      govPower: this._govPower,
    });
    return this;
  }

  /**
   * Get a house contract instance
   * @param type The house type
   * @param address The house address
   */
  public getHouseContract(type: HouseType, address: string) {
    return this.house.getContract(type, address);
  }

  /**
   * Get a round contract instance
   * @param type The house type
   * @param address The house address
   */
  public getRoundContract(type: RoundType, address: string) {
    return this.round.getContract(type, address);
  }

  /**
   * Deposit an asset to the provided `round`
   * @param round The address of the round to deposit to
   * @param asset The asset to deposit
   * @param overrides Optional transaction overrides
   */
  public async depositTo(round: string, asset: Asset, overrides: Overrides = {}) {
    return this.contract.depositTo(round, encoding.getAssetStruct(asset), {
      ...overrides,
      value: asset.assetType === AssetType.ETH ? asset.amount : 0,
    });
  }

  /**
   * Deposit one or more assets to the provided `round`
   * @param round The address of the round to deposit to
   * @param assets The assets to deposit
   * @param overrides Optional transaction overrides
   */
  public async batchDepositTo(round: string, assets: Asset[], overrides: Overrides = {}) {
    if (!assets.length) {
      throw new Error('Must provide at least one asset to deposit');
    }
    if (assets.length > 1) {
      const { assets: _assets, value } = this.mergeAssetsAndGetTotalETHValue(assets);
      return this.contract.batchDepositTo(round, _assets, {
        ...overrides,
        value,
      });
    }
    return this.depositTo(round, assets[0], overrides);
  }

  /**
   * Create a new round on an existing house
   * @param houseAddress The house address
   * @param round The round type, title, description, and config
   * @param overrides Optional transaction overrides
   */
  public async createRoundOnExistingHouse<RT extends RoundType>(
    houseAddress: string,
    round: RoundInfo<RT, CS>,
    overrides: Overrides = {},
  ) {
    const struct = await this.round.getConfigStruct(round);

    const starknetFeeEstimate = await this.round.estimateMessageFee(round.roundType, struct);
    const cappedStarknetFee = this.min(starknetFeeEstimate, PropHouse._MAX_STARKNET_MESSAGE_FEE_CAP);

    const inputs = [
      houseAddress,
      {
        title: round.title,
        description: round.description,
        impl: this.round.getImpl(round.roundType),
        config: this.round.encode(round.roundType, struct as RoundConfigStruct[RT]),
      },
    ] as const;
    const overridesWithValue = {
      ...overrides,
      from: (this._evm as Signer).getAddress(),
      value: cappedStarknetFee.add(struct.metaTx.deposit),
    };
    const gasLimit = await this.contract.estimateGas.createRoundOnExistingHouse(...inputs, overridesWithValue);
    return this.contract.createRoundOnExistingHouse(...inputs, {
      ...overridesWithValue,
      gasLimit: gasLimit.add(30_000), // A 30,000 gas pad is used to avoid 'Out of gas' errors
    });
  }

  /**
   * Create and fully or partially fund a new round on an existing house
   * @param houseAddress The house address
   * @param round The round type, title, description, and config
   * @param funding The assets to fund up-front
   * @param overrides Optional transaction overrides
   */
  public async createAndFundRoundOnExistingHouse<RT extends RoundType>(
    houseAddress: string,
    round: RoundInfo<RT, CS>,
    funding: Asset[],
    overrides: Overrides = {},
  ) {
    const struct = await this.round.getConfigStruct(round);
    const { assets, value } = this.mergeAssetsAndGetTotalETHValue(funding);

    const starknetFeeEstimate = await this.round.estimateMessageFee(round.roundType, struct);
    const cappedStarknetFee = this.min(starknetFeeEstimate, PropHouse._MAX_STARKNET_MESSAGE_FEE_CAP);

    const inputs = [
      houseAddress,
      {
        title: round.title,
        description: round.description,
        impl: this.round.getImpl(round.roundType),
        config: this.round.encode(round.roundType, struct as RoundConfigStruct[RT]),
      },
      assets,
    ] as const;
    const overridesWithValue = {
      ...overrides,
      from: (this._evm as Signer).getAddress(),
      value: BigNumber.from(value).add(cappedStarknetFee).add(struct.metaTx.deposit),
    };
    const gasLimit = await this.contract.estimateGas.createAndFundRoundOnExistingHouse(...inputs, overridesWithValue);
    return this.contract.createAndFundRoundOnExistingHouse(...inputs, {
      ...overridesWithValue,
      gasLimit: gasLimit.add(30_000), // A 30,000 gas pad is used to avoid 'Out of gas' errors
    });
  }

  /**
   * Create a new round on a new house
   * @param house The house type and config
   * @param round The round type, title, description, and config
   * @param overrides Optional transaction overrides
   */
  public async createRoundOnNewHouse<HT extends HouseType, RT extends RoundType>(
    house: HouseInfo<HT>,
    round: RoundInfo<RT, CS>,
    overrides: Overrides = {},
  ) {
    const struct = await this.round.getConfigStruct(round);

    const starknetFeeEstimate = await this.round.estimateMessageFee(round.roundType, struct);
    const cappedStarknetFee = this.min(starknetFeeEstimate, PropHouse._MAX_STARKNET_MESSAGE_FEE_CAP);

    const inputs = [
      {
        impl: this.house.getImpl(house.houseType),
        config: this.house.encode(house),
      },
      {
        title: round.title,
        description: round.description,
        impl: this.round.getImpl(round.roundType),
        config: this.round.encode(round.roundType, struct as RoundConfigStruct[RT]),
      },
    ] as const;
    const overridesWithValue = {
      ...overrides,
      from: (this._evm as Signer).getAddress(),
      value: cappedStarknetFee.add(struct.metaTx.deposit),
    };
    const gasLimit = await this.contract.estimateGas.createRoundOnNewHouse(...inputs, overridesWithValue);
    return this.contract.createRoundOnNewHouse(...inputs, {
      ...overridesWithValue,
      gasLimit: gasLimit.add(30_000), // A 30,000 gas pad is used to avoid 'Out of gas' errors
    });
  }

  /**
   * Create and fully or partially fund a new round on a new house
   * @param house The house type and config
   * @param round The round type, title, description, and config
   * @param funding The assets to fund up-front
   * @param overrides Optional transaction overrides
   */
  public async createAndFundRoundOnNewHouse<HT extends HouseType, RT extends RoundType>(
    house: HouseInfo<HT>,
    round: RoundInfo<RT, CS>,
    funding: Asset[],
    overrides: Overrides = {},
  ) {
    const struct = await this.round.getConfigStruct(round);
    const { assets, value } = this.mergeAssetsAndGetTotalETHValue(funding);

    const starknetFeeEstimate = await this.round.estimateMessageFee(round.roundType, struct);
    const cappedStarknetFee = this.min(starknetFeeEstimate, PropHouse._MAX_STARKNET_MESSAGE_FEE_CAP);

    const inputs = [
      {
        impl: this.house.getImpl(house.houseType),
        config: this.house.encode(house),
      },
      {
        title: round.title,
        description: round.description,
        impl: this.round.getImpl(round.roundType),
        config: this.round.encode(round.roundType, struct as RoundConfigStruct[RT]),
      },
      assets,
    ] as const;
    const overridesWithValue = {
      ...overrides,
      from: (this._evm as Signer).getAddress(),
      value: BigNumber.from(value).add(cappedStarknetFee).add(struct.metaTx.deposit),
    };
    const gasLimit = await this.contract.estimateGas.createAndFundRoundOnNewHouse(...inputs, overridesWithValue);
    return this.contract.createAndFundRoundOnNewHouse(...inputs, {
      ...overridesWithValue,
      gasLimit: gasLimit.add(30_000), // A 30,000 gas pad is used to avoid 'Out of gas' errors
    });
  }

  /**
   * Convert an array of assets to asset structs, merge duplicate
   * assets, and calculate the total ETH value.
   * @param assets The assets to convert and merge
   */
  private mergeAssetsAndGetTotalETHValue(assets: Asset[]) {
    const accumulator: Record<string, AssetStruct> = {};
    for (const asset of assets) {
      const assetID = encoding.getAssetID(asset);
      const struct = encoding.getAssetStruct(asset);

      const prevAmount = accumulator[assetID]?.amount;
      if (prevAmount) {
        struct.amount = BigNumber.from(struct.amount).add(prevAmount);
      }
      accumulator[assetID] = struct;
    }
    return {
      assets: Object.values(accumulator),
      value: accumulator[encoding.getETHAssetID()]?.amount ?? 0,
    };
  }

  /**
   * Returns the smaller of two numbers
   * @param a The first number
   * @param b The second number
   */
  private min(a: BigNumberish, b: BigNumberish) {
    return BigNumber.from(a).lt(b) ? BigNumber.from(a) : BigNumber.from(b);
  }
}
