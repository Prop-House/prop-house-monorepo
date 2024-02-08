import classes from '../ProposingStrategiesDisplay/ProposingStrategiesDisplay.module.css';
import { ProposingStrategy, GovPowerStrategyType, VotingStrategy } from '@prophouse/sdk-react';
import trimEthAddress from '../../utils/trimEthAddress';
import { useState } from 'react';
import Modal from '../Modal';
import buildEtherscanPath from '../../utils/buildEtherscanPath';
import { MdHowToVote } from 'react-icons/md';
import useTokenNames from '../../hooks/useTokenNames';

const VotingStrategiesDisplay: React.FC<{
  votingStrategies: VotingStrategy[];
}> = props => {
  const { votingStrategies } = props;

  const [showModal, setShowModal] = useState(false);
  const [loadingTokenNames, tokenNames] = useTokenNames(votingStrategies);

  const display = (address: string) => {
    return !loadingTokenNames && tokenNames && tokenNames[address]
      ? tokenNames[address]
      : trimEthAddress(address);
  };

  const oneStrat = votingStrategies.length === 1;
  const oneStratAndNotAllowList =
    oneStrat && votingStrategies[0].strategyType !== GovPowerStrategyType.ALLOWLIST;
  const oneStratAndAllowListHasOneMember =
    oneStrat &&
    votingStrategies[0].strategyType === GovPowerStrategyType.ALLOWLIST &&
    votingStrategies[0].members.length === 1;

  const formattedContent = (content: JSX.Element) => (
    <div className={classes.singleStratDisplayContainer}>
      <div className={classes.icon}>
        <MdHowToVote />
      </div>
      <p>{content}</p>
    </div>
  );

  const singleStratCopy = (strat: ProposingStrategy, memberIndex?: number) => {
    let copy = <></>;
    const stratType = strat.strategyType;

    if (stratType === GovPowerStrategyType.ALLOWLIST && memberIndex !== undefined) {
      const govPower = strat.members[memberIndex].govPower;
      copy = (
        <>
          <a
            href={buildEtherscanPath(strat.members[memberIndex].address)}
            target="_blank"
            rel="noreferrer"
          >
            {trimEthAddress(strat.members[memberIndex].address)}
          </a>{' '}
          can vote with {govPower} vote{Number(govPower) > 1 && 's'}.
        </>
      );
    }

    if (stratType === GovPowerStrategyType.BALANCE_OF || stratType === GovPowerStrategyType.BALANCE_OF_ERC20)
      copy = (
        <>
          Owners of the{' '}
          <a href={buildEtherscanPath(strat.tokenAddress)} target="_blank" rel="noreferrer">
            {display(strat.tokenAddress)}
          </a>{' '}
          token can vote. {strat.multiplier ? strat.multiplier : 1} vote per token.
        </>
      );

    if (stratType === GovPowerStrategyType.BALANCE_OF_ERC1155)
      copy = (
        <>
          Owners of the{' '}
          <a href={buildEtherscanPath(strat.tokenAddress)} target="_blank" rel="noreferrer">
            {display(strat.tokenAddress)}
          </a>{' '}
          token with id {strat.tokenId} can vote. {strat.multiplier ? strat.multiplier : 1} vote
          {strat.multiplier && 's'} per token.
        </>
      );

    if (stratType === GovPowerStrategyType.CHECKPOINTABLE_ERC721)
      copy = (
        <>
          Owners or delegates of the{' '}
          <a href={buildEtherscanPath(strat.tokenAddress)} target="_blank" rel="noreferrer">
            {display(strat.tokenAddress)}
          </a>{' '}
          token can vote. {strat.multiplier ? strat.multiplier : 1} vote per token.
        </>
      );

    if (stratType === GovPowerStrategyType.UNKNOWN) copy = <>Error reading voting strategy</>;

    return formattedContent(copy);
  };

  const multiStratContent = (strats: ProposingStrategy[]) => {
    return (
      <div className={classes.modalBody}>
        {strats.map((strat, key) => {
          if (strat.strategyType === GovPowerStrategyType.ALLOWLIST)
            // iterate through ea member on the allowlist
            return strat.members.map((_, index) => (
              <div key={`${key}${index}`}>{singleStratCopy(strat, index)}</div>
            ));
          return <div key={key}>{singleStratCopy(strat)}</div>;
        })}
      </div>
    );
  };

  return showModal ? (
    <Modal
      modalProps={{
        title: 'Voting eligibility',
        subtitle: 'Below is the criteria required to vote',
        body: multiStratContent(votingStrategies),
        setShowModal: setShowModal,
      }}
    />
  ) : oneStratAndAllowListHasOneMember || oneStratAndNotAllowList ? (
    singleStratCopy(votingStrategies[0], 0)
  ) : (
    <div onClick={() => setShowModal(true)}>
      {formattedContent(
        <>
          <span>See who can vote ↗</span>
        </>,
      )}
    </div>
  );
};

export default VotingStrategiesDisplay;
