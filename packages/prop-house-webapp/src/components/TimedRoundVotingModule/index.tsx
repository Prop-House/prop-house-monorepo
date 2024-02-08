import clsx from 'clsx';
import classes from './TimedRoundVotingModule.module.css';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { ProgressBar } from 'react-bootstrap';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { countVotesRemainingForTimedRound } from '../../utils/countVotesRemainingForTimedRound';
import { countTotalVotesAlloted } from '../../utils/countTotalVotesAlloted';
import Button, { ButtonColor } from '../Button';
import RoundModuleCard from '../RoundModuleCard';
import { countNumVotes } from '../../utils/countNumVotes';
import ConnectButton from '../ConnectButton';
import { useTranslation } from 'react-i18next';
import { useAccount } from 'wagmi';
import { BsPersonFill } from 'react-icons/bs';
import useVotingPower from '../../hooks/useVotingPower';
import { GiDeadHead } from 'react-icons/gi';
import LoadingIndicator from '../LoadingIndicator';
import { Round } from '@prophouse/sdk-react';
import { setVotingPower } from '../../state/slices/voting';
import VotingStrategiesDisplay from '../VotingStrategiesDisplay';
import { truncateThousands } from '../../utils/truncateThousands';

export interface TimedRoundVotingModuleProps {
  round: Round;
  totalVotes: number | undefined;
  setShowVotingModal: Dispatch<SetStateAction<boolean>>;
}
const TimedRoundVotingModule: React.FC<TimedRoundVotingModuleProps> = (
  props: TimedRoundVotingModuleProps,
) => {
  const { round, totalVotes, setShowVotingModal } = props;
  const { address: account } = useAccount();

  const voteAllotments = useAppSelector(state => state.voting.voteAllotments);
  const votesByUserInActiveRound = useAppSelector(state => state.voting.votesByUserInActiveRound);
  const numVotesByUserInActiveRound = countNumVotes(votesByUserInActiveRound, round.address);

  const [loadingVotingPower, errorLoadingVotingPower, votingPower] = useVotingPower(round, account);
  const hasVotingPower = votingPower && votingPower > 0;
  const dispatch = useAppDispatch();

  const [votesLeftToAllot, setVotesLeftToAllot] = useState(0);
  const [numAllotedVotes, setNumAllotedVotes] = useState(0);

  const { t } = useTranslation();

  useEffect(() => {
    if (!votingPower) return;
    setVotesLeftToAllot(
      countVotesRemainingForTimedRound(
        votingPower,
        votesByUserInActiveRound,
        voteAllotments,
        round.address,
      ),
    );
    setNumAllotedVotes(countTotalVotesAlloted(voteAllotments));

    dispatch(setVotingPower(votingPower));
  }, [votesByUserInActiveRound, voteAllotments, votingPower, dispatch, round.address]);

  const content = (
    <>
      {account ? (
        errorLoadingVotingPower ? (
          <>Error loading voting power.</>
        ) : loadingVotingPower ? (
          <LoadingIndicator height={50} width={50} />
        ) : hasVotingPower ? (
          <>
            <h1 className={clsx(classes.sideCardTitle, classes.votingInfo)}>
              <span>{t('castYourVotes')}</span>
              <span className={classes.totalVotes}>{`${
                votesLeftToAllot > 0
                  ? `${votingPower - numVotesByUserInActiveRound - numAllotedVotes} ${t('left')}`
                  : t('noVotesLeft')
              }`}</span>
            </h1>

            <ProgressBar
              className={clsx(
                classes.votingBar,
                numVotesByUserInActiveRound > 0 &&
                  votingPower !== numVotesByUserInActiveRound &&
                  'roundAllotmentBar',
              )}
            >
              <ProgressBar
                variant="success"
                now={(numVotesByUserInActiveRound / votingPower) * 100}
              />

              <ProgressBar variant="warning" now={(numAllotedVotes / votingPower) * 100} key={2} />
            </ProgressBar>
            <Button
              text={t('submitVotes')}
              bgColor={ButtonColor.Purple}
              onClick={() => setShowVotingModal(true)}
              disabled={
                countTotalVotesAlloted(voteAllotments) === 0 ||
                numVotesByUserInActiveRound === votingPower
              }
            />
          </>
        ) : (
          <div className={classes.list}>
            <div className={classes.listItem}>
              <VotingStrategiesDisplay votingStrategies={round.votingStrategies} />
            </div>

            <div className={classes.listItem}>
              <div className={classes.icon}>
                <GiDeadHead />
              </div>
              <p>
                Your account is <b>not eligible</b> to vote in this round.
              </p>
            </div>
          </div>
        )
      ) : (
        <>
          <div className={classes.list}>
            <div className={classes.listItem}>
              <div className={classes.icon}>
                <BsPersonFill color="" />
              </div>
              <p>Proposers can connect their wallet to view the status of their proposal.</p>
            </div>

            <div className={classes.listItem}>
              <VotingStrategiesDisplay votingStrategies={round.votingStrategies} />
            </div>
          </div>
          <ConnectButton text={t('connectToVote')} color={ButtonColor.Pink} />
        </>
      )}
    </>
  );

  return (
    <RoundModuleCard
      title={t('votingInProgress')}
      subtitle={
        <>
          <span className={classes.purpleText}>
            {totalVotes && totalVotes > 1000 ? truncateThousands(totalVotes) : totalVotes}
          </span>{' '}
          {totalVotes === 1 ? t('vote') : t('votes')} {t('castSoFar')}!
        </>
      }
      content={content}
      type="voting"
    />
  );
};

export default TimedRoundVotingModule;
