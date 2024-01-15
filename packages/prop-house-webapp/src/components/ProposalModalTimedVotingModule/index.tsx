import { ProgressBar } from 'react-bootstrap';
import classes from './ProposalModalVotingModule.module.css';
import clsx from 'clsx';
import Button, { ButtonColor } from '../Button';
import { countTotalVotesAlloted } from '../../utils/countTotalVotesAlloted';
import { Dispatch, SetStateAction, useEffect } from 'react';
import { useAppSelector } from '../../hooks';
import { countVotesRemainingForTimedRound } from '../../utils/countVotesRemainingForTimedRound';
import { useDispatch } from 'react-redux';
import { setVotingPower } from '../../state/slices/voting';
import VoteAllotmentTooltip from '../VoteAllotmentTooltip';
import VotesDisplay from '../VotesDisplay';
import { countNumVotes } from '../../utils/countNumVotes';
import { useAccount } from 'wagmi';
import TimedRoundVotingControls from '../TimedRoundVotingControls';
import { Proposal, usePropHouse } from '@prophouse/sdk-react';
import { parsedVotingPower } from '../../utils/parsedVotingPower';

const ProposalModalTimedVotingModule: React.FC<{
  proposal: Proposal;
  setShowVotingModal: Dispatch<SetStateAction<boolean>>;
  setShowVoteAllotmentModal?: Dispatch<SetStateAction<boolean>>;
}> = props => {
  const { proposal, setShowVotingModal, setShowVoteAllotmentModal } = props;

  const dispatch = useDispatch();

  const round = useAppSelector(state => state.propHouse.activeRound);
  const votingPower = useAppSelector(state => state.voting.votingPower);
  const voteAllotments = useAppSelector(state => state.voting.voteAllotments);
  const votesByUserInActiveRound = useAppSelector(state => state.voting.votesByUserInActiveRound);

  const { address: account } = useAccount();
  const propHouse = usePropHouse();

  const numVotesCasted = countNumVotes(votesByUserInActiveRound, round!.address);

  const votesRemaining = countVotesRemainingForTimedRound(
    votingPower,
    votesByUserInActiveRound,
    voteAllotments,
    round!.address,
  );

  const votesAlloted = countTotalVotesAlloted(voteAllotments);

  useEffect(() => {
    if (!account || !round) return;

    const fetchVotes = async () => {
      try {
        const votes = await propHouse.govPower.getTotalPower(
          account,
          round.config.proposalPeriodStartTimestamp,
          round.votingStrategiesRaw,
        );
        dispatch(setVotingPower(parsedVotingPower(votes.toString(), round.address).toNumber()));
      } catch (e) {
        console.log('error fetching votes: ', e);
      }
    };
    fetchVotes();
  }, [account, dispatch, round, propHouse.govPower]);

  return (
    <>
      <div className={classes.votingContainer}>
        <div className={classes.votingBarAndTooltip}>
          <div className={classes.votingProgressBar}>
            <div className={classes.votingInfo}>
              <span>
                <b>Cast your votes</b>
              </span>

              <span className={classes.totalVotes}>
                {setShowVoteAllotmentModal && (
                  <VoteAllotmentTooltip setShowVoteAllotmentModal={setShowVoteAllotmentModal} />
                )}

                {`${votesRemaining > 0 ? `${votesRemaining} left` : 'no votes left'}`}
              </span>
            </div>

            <ProgressBar
              className={clsx(
                classes.votingBar,
                numVotesCasted > 0 && votingPower !== numVotesCasted && 'roundAllotmentBar',
              )}
            >
              <ProgressBar variant="success" now={(numVotesCasted / votingPower) * 100} />

              <ProgressBar variant="warning" now={(votesAlloted / votingPower) * 100} key={2} />
            </ProgressBar>
          </div>
        </div>

        <div className={classes.voteAllotmentSection}>
          {proposal.isWinner && (
            <div className={classes.crownNoun}>
              <img src="/heads/crown.png" alt="crown" />
            </div>
          )}

          <div className={classes.icon}>
            <VotesDisplay proposal={proposal} /> <span>+</span>
          </div>

          <div className={classes.mobileTooltipContainer}>
            {/* {round && isInfAuction(round) ? (
              <InfRoundVotingControls proposal={proposal} />
            ) : (
              <TimedRoundVotingControls proposal={proposal} />
            )} */}
            <TimedRoundVotingControls proposal={proposal} />

            <div className={classes.votesLeftMobile}>
              {votesRemaining} vote{votesRemaining !== 1 ? 's' : ''} left
            </div>
          </div>

          <Button
            classNames={classes.submitVotesButton}
            text={'Submit votes'}
            bgColor={ButtonColor.Purple}
            disabled={
              countTotalVotesAlloted(voteAllotments) === 0 || numVotesCasted === votingPower
            }
            onClick={() => setShowVotingModal(true)}
          />
        </div>
      </div>
    </>
  );
};

export default ProposalModalTimedVotingModule;
