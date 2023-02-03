import { starknet } from 'hardhat';
import { commonL1Setup } from './common';
import { FundingHouse__factory, TimedFundingRound__factory } from '../../../typechain';

export const fundingHouseSetup = async () => {
  const config = await commonL1Setup();

  const starknetSigner = await starknet.deployAccount('OpenZeppelin');

  const houseStrategyDeployerFactory = await starknet.getContractFactory(
    './contracts/starknet/house_strategy_factory.cairo',
  );
  const ethExecutionStrategyFactory = await starknet.getContractFactory(
    './contracts/starknet/common/execution/eth_strategy.cairo',
  );
  const votingStrategyRegistryFactory = await starknet.getContractFactory(
    './contracts/starknet/common/registry/voting_strategy_registry.cairo',
  );

  const fundingHouseFactory = new FundingHouse__factory(config.registrar);

  const houseStrategyFactory = await houseStrategyDeployerFactory.deploy({
    starknet_messenger: config.starknetMessenger.address,
  });
  const ethExecutionStrategy = await ethExecutionStrategyFactory.deploy({
    house_strategy_factory_address: houseStrategyFactory.address,
  });
  const votingStrategyRegistry = await votingStrategyRegistryFactory.deploy({
    starknet_messenger: config.starknetMessenger.address,
  });

  const fundingHouseImpl = await fundingHouseFactory.deploy(
    config.awardRouter.address,
    config.houseApprovalManager.address,
    votingStrategyRegistry.address,
    config.upgradeManager.address,
    config.strategyManager.address,
    config.starknetMessenger.address,
  );

  await config.deploymentManager.registerDeployment(fundingHouseImpl.address);

  return {
    ...config,
    starknetSigner,
    fundingHouseImpl,
    houseStrategyFactory,
    votingStrategyRegistry,
    ethExecutionStrategy,
  };
};

export const fundingHouseTimedFundingRoundSetup = async () => {
  const config = await fundingHouseSetup();

  const timedFundingRoundFactory = new TimedFundingRound__factory(config.registrar);
  const timedFundingRoundStrategyL2Factory = await starknet.getContractFactory(
    './contracts/starknet/strategies/timed_funding_round/timed_funding_round.cairo',
  );

  const timedFundingRoundEthTxAuthStrategyFactory = await starknet.getContractFactory(
    './contracts/starknet/strategies/timed_funding_round/auth/eth_tx.cairo',
  );
  const timedFundingRoundEthSigAuthStrategyFactory = await starknet.getContractFactory(
    './contracts/starknet/strategies/timed_funding_round/auth/eth_sig.cairo',
  );

  const timedFundingRoundEthTxAuthStrategy = await timedFundingRoundEthTxAuthStrategyFactory.deploy(
    {
      starknet_commit_address: config.starknetCommit.address,
    },
  );
  const timedFundingRoundEthSigAuthStrategy =
    await timedFundingRoundEthSigAuthStrategyFactory.deploy();

  const timedFundingRoundStrategyClassHash = await config.starknetSigner.declare(
    timedFundingRoundStrategyL2Factory,
    {
      constants: {
        voting_strategy_registry: config.votingStrategyRegistry.address,
        eth_execution_strategy: config.ethExecutionStrategy.address,
        eth_tx_auth_strategy: timedFundingRoundEthTxAuthStrategy.address,
        eth_sig_auth_strategy: timedFundingRoundEthSigAuthStrategy.address,
      },
    },
  );
  const timedFundingRoundImpl = await timedFundingRoundFactory.deploy(
    timedFundingRoundStrategyClassHash,
    config.awardRouter.address,
    config.mockStarknetMessaging.address,
    config.houseStrategyFactory.address,
    config.ethExecutionStrategy.address,
  );

  await config.strategyManager['registerStrategy(bytes32,address)'](
    await config.fundingHouseImpl.id(),
    timedFundingRoundImpl.address,
  );

  return {
    ...config,
    timedFundingRoundImpl,
    timedFundingRoundStrategyL2Factory,
    timedFundingRoundStrategyClassHash,
    timedFundingRoundEthTxAuthStrategy,
    timedFundingRoundEthSigAuthStrategy,
  };
};