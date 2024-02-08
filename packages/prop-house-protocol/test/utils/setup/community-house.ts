import { starknet } from 'hardhat';
import { Account, SequencerProvider } from 'starknet';
import { commonL1Setup } from './common';
import {
  CommunityHouse__factory,
  TimedRound__factory,
  InfiniteRound__factory,
} from '../../../typechain';
import { asciiToHex } from '../utils';
import { EIP_712_DOMAIN_SEPARATOR_GOERLI, STARKNET_MAX_FEE } from '../constants';
import { RoundType } from '@prophouse/sdk';
import { constants } from 'ethers';
import { ChainId } from '../../../src';

const DependencyKey = {
  EXECUTION_STRATEGY: asciiToHex('EXECUTION_STRATEGY'),
  AUTH_STRATEGIES: asciiToHex('AUTH_STRATEGIES'),
};

export const communityHouseSetup = async () => {
  const config = await commonL1Setup();

  const [{ address, private_key }] = await starknet.devnet.getPredeployedAccounts();
  const starknetSigner = await starknet.OpenZeppelinAccount.getAccountFromAddress(
    address,
    private_key,
  );
  const starknetProvider = new SequencerProvider({
    baseUrl: 'http://127.0.0.1:5050',
  });
  const starknetAccount = new Account(starknetProvider, address, private_key);

  const roundDeployerFactory = await starknet.getContractFactory('prop_house_EthereumRoundFactory');
  const ethExecutionStrategyFactory = await starknet.getContractFactory(
    'prop_house_EthereumExecutionStrategy',
  );
  const strategyRegistryFactory = await starknet.getContractFactory('prop_house_StrategyRegistry');
  const roundDependencyRegistryFactory = await starknet.getContractFactory(
    'prop_house_RoundDependencyRegistry',
  );

  await starknetSigner.declare(roundDeployerFactory, {
    maxFee: STARKNET_MAX_FEE,
  });
  await starknetSigner.declare(ethExecutionStrategyFactory, {
    maxFee: STARKNET_MAX_FEE,
  });
  await starknetSigner.declare(strategyRegistryFactory, {
    maxFee: STARKNET_MAX_FEE,
  });
  await starknetSigner.declare(roundDependencyRegistryFactory, {
    maxFee: STARKNET_MAX_FEE,
  });

  const communityHouseFactory = new CommunityHouse__factory(config.deployer);

  const roundFactory = await starknetSigner.deploy(roundDeployerFactory, {
    origin_chain_id: ChainId.EthereumHardhat,
    origin_messenger: config.messenger.address,
  });
  const ethExecutionStrategy = await starknetSigner.deploy(ethExecutionStrategyFactory, {
    round_factory: roundFactory.address,
  });
  const strategyRegistry = await starknetSigner.deploy(strategyRegistryFactory);
  const roundDependencyRegistry = await starknetSigner.deploy(roundDependencyRegistryFactory, {
    initial_owner: starknetSigner.address,
  });

  const communityHouseImpl = await communityHouseFactory.deploy(
    config.propHouse.address,
    config.manager.address,
    config.creatorPassIssuer.address,
  );

  await config.manager.registerHouse(communityHouseImpl.address);

  return {
    ...config,
    starknetSigner,
    starknetProvider,
    starknetAccount,
    communityHouseImpl,
    roundFactory,
    strategyRegistry,
    ethExecutionStrategy,
    roundDependencyRegistry,
  };
};

export const infiniteRoundSetup = async () => {
  const config = await communityHouseSetup();

  const infiniteRoundFactory = new InfiniteRound__factory(config.deployer);

  const infiniteRoundL2Factory = await starknet.getContractFactory('prop_house_InfiniteRound');
  const infiniteRoundEthTxAuthStrategyFactory = await starknet.getContractFactory(
    'prop_house_InfiniteRoundEthereumTxAuthStrategy',
  );
  const infiniteRoundEthSigAuthStrategyFactory = await starknet.getContractFactory(
    'prop_house_InfiniteRoundEthereumSigAuthStrategy',
  );

  await config.starknetSigner.declare(infiniteRoundEthTxAuthStrategyFactory, {
    maxFee: STARKNET_MAX_FEE,
  });
  await config.starknetSigner.declare(infiniteRoundEthSigAuthStrategyFactory, {
    maxFee: STARKNET_MAX_FEE,
  });

  const infiniteRoundEthTxAuthStrategy = await config.starknetSigner.deploy(
    infiniteRoundEthTxAuthStrategyFactory,
    {
      commit_address: config.starknetCommit.address,
    },
  );
  // prettier-ignore
  const infiniteRoundEthSigAuthStrategy = await config.starknetSigner.deploy(
    infiniteRoundEthSigAuthStrategyFactory,
    {
      domain_separator: EIP_712_DOMAIN_SEPARATOR_GOERLI,
    },
  );

  // Add Ethereum auth strategies
  await config.starknetSigner.invoke(
    config.roundDependencyRegistry,
    'update_dependencies_if_not_locked',
    [
      ChainId.EthereumHardhat,
      asciiToHex(RoundType.INFINITE),
      DependencyKey.AUTH_STRATEGIES,
      2,
      infiniteRoundEthTxAuthStrategy.address,
      infiniteRoundEthSigAuthStrategy.address,
    ],
    {
      rawInput: true,
    },
  );

  // Add Ethereum execution strategy
  await config.starknetSigner.invoke(
    config.roundDependencyRegistry,
    'update_dependency_if_not_locked',
    {
      origin_chain_id: ChainId.EthereumHardhat,
      round_type: asciiToHex(RoundType.INFINITE),
      key: DependencyKey.EXECUTION_STRATEGY,
      dependency: config.ethExecutionStrategy.address,
    },
  );

  for (const key of Object.values(DependencyKey)) {
    await config.starknetSigner.invoke(config.roundDependencyRegistry, 'lock_key', {
      origin_chain_id: ChainId.EthereumHardhat,
      round_type: asciiToHex(RoundType.INFINITE),
      key,
    });
  }

  // Write auth and execution strategies to the round dependency registry
  const STRATEGY_REGISTRY_ADDRESS_KEY = asciiToHex('STRATEGY_REGISTRY_ADDRESS');
  const ROUND_DEP_REGISTRY_ADDRESS_KEY = asciiToHex('ROUND_DEP_REGISTRY_ADDRESS');
  await config.starknetSigner.declare(infiniteRoundL2Factory, {
    constants: {
      [STRATEGY_REGISTRY_ADDRESS_KEY]: config.strategyRegistry.address,
      [ROUND_DEP_REGISTRY_ADDRESS_KEY]: config.roundDependencyRegistry.address,
    },
    maxFee: STARKNET_MAX_FEE,
  });
  const infiniteRoundClassHash = await infiniteRoundL2Factory.getClassHash();

  const infiniteRoundImpl = await infiniteRoundFactory.deploy(
    infiniteRoundClassHash,
    config.propHouse.address,
    config.mockStarknetMessaging.address,
    config.messenger.address,
    config.roundFactory.address,
    config.ethExecutionStrategy.address,
    config.manager.address,
  );

  await config.manager.registerRound(config.communityHouseImpl.address, infiniteRoundImpl.address);
  return {
    ...config,
    infiniteRoundImpl,
    infiniteRoundL2Factory,
    infiniteRoundClassHash,
    infiniteRoundEthTxAuthStrategy,
    infiniteRoundEthSigAuthStrategy,
  };
};

export const timedRoundSetup = async () => {
  const config = await communityHouseSetup();

  const timedRoundFactory = new TimedRound__factory(config.deployer);

  const timedRoundL2Factory = await starknet.getContractFactory('prop_house_TimedRound');
  const timedRoundEthTxAuthStrategyFactory = await starknet.getContractFactory(
    'prop_house_TimedRoundEthereumTxAuthStrategy',
  );
  const timedRoundEthSigAuthStrategyFactory = await starknet.getContractFactory(
    'prop_house_TimedRoundEthereumSigAuthStrategy',
  );

  await config.starknetSigner.declare(timedRoundEthTxAuthStrategyFactory, {
    maxFee: STARKNET_MAX_FEE,
  });
  await config.starknetSigner.declare(timedRoundEthSigAuthStrategyFactory, {
    maxFee: STARKNET_MAX_FEE,
  });

  const timedRoundEthTxAuthStrategy = await config.starknetSigner.deploy(
    timedRoundEthTxAuthStrategyFactory,
    {
      commit_address: config.starknetCommit.address,
    },
  );
  // prettier-ignore
  const timedRoundEthSigAuthStrategy = await config.starknetSigner.deploy(
    timedRoundEthSigAuthStrategyFactory,
    {
      domain_separator: EIP_712_DOMAIN_SEPARATOR_GOERLI,
    },
  );

  // Add Ethereum auth strategies
  await config.starknetSigner.invoke(
    config.roundDependencyRegistry,
    'update_dependencies_if_not_locked',
    [
      ChainId.EthereumHardhat,
      asciiToHex(RoundType.TIMED),
      DependencyKey.AUTH_STRATEGIES,
      2,
      timedRoundEthTxAuthStrategy.address,
      timedRoundEthSigAuthStrategy.address,
    ],
    {
      rawInput: true,
    },
  );

  // Add Ethereum execution strategy
  await config.starknetSigner.invoke(
    config.roundDependencyRegistry,
    'update_dependency_if_not_locked',
    {
      origin_chain_id: ChainId.EthereumHardhat,
      round_type: asciiToHex(RoundType.TIMED),
      key: DependencyKey.EXECUTION_STRATEGY,
      dependency: config.ethExecutionStrategy.address,
    },
  );

  for (const key of Object.values(DependencyKey)) {
    await config.starknetSigner.invoke(config.roundDependencyRegistry, 'lock_key', {
      origin_chain_id: ChainId.EthereumHardhat,
      round_type: asciiToHex(RoundType.TIMED),
      key,
    });
  }

  // Write auth and execution strategies to the round dependency registry
  const STRATEGY_REGISTRY_ADDRESS_KEY = asciiToHex('STRATEGY_REGISTRY_ADDRESS');
  const ROUND_DEP_REGISTRY_ADDRESS_KEY = asciiToHex('ROUND_DEP_REGISTRY_ADDRESS');
  await config.starknetSigner.declare(timedRoundL2Factory, {
    constants: {
      [STRATEGY_REGISTRY_ADDRESS_KEY]: config.strategyRegistry.address,
      [ROUND_DEP_REGISTRY_ADDRESS_KEY]: config.roundDependencyRegistry.address,
    },
    maxFee: STARKNET_MAX_FEE,
  });
  const timedRoundClassHash = await timedRoundL2Factory.getClassHash();

  const timedRoundImpl = await timedRoundFactory.deploy(
    timedRoundClassHash,
    config.propHouse.address,
    config.mockStarknetMessaging.address,
    config.messenger.address,
    config.roundFactory.address,
    config.ethExecutionStrategy.address,
    config.manager.address,
  );

  await config.manager.registerRound(config.communityHouseImpl.address, timedRoundImpl.address);
  return {
    ...config,
    timedRoundImpl,
    timedRoundL2Factory,
    timedRoundClassHash,
    timedRoundEthTxAuthStrategy,
    timedRoundEthSigAuthStrategy,
  };
};
