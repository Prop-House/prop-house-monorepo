import { Row, Col, Tooltip, OverlayTrigger } from 'react-bootstrap';
import classes from './VotingControls.module.css';
import Button, { ButtonColor } from '../Button';
import clsx from 'clsx';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { allotVotes } from '../../state/slices/voting';
import { Direction } from '@nouns/prop-house-wrapper/dist/builders';
import React, { useCallback, useEffect, useState } from 'react';
import { countVotesAllottedToProp } from '../../utils/countVotesAllottedToProp';
import { countVotesRemainingForTimedRound } from '../../utils/countVotesRemainingForTimedRound';
import { useTranslation } from 'react-i18next';
import { isInfAuction } from '../../utils/auctionType';
import { countVotesRemainingForInfRound } from '../../utils/countVotesRemainingForInfRound';
import { Proposal } from '@prophouse/sdk-react';

const VotingControls: React.FC<{
  proposal: Proposal;
  showVoteAllotmentModal?: boolean;
}> = props => {
  const { proposal, showVoteAllotmentModal } = props;

  const voteAllotments = useAppSelector(state => state.voting.voteAllotments);
  const votingPower = useAppSelector(state => state.voting.votingPower);
  const round = useAppSelector(state => state.propHouse.activeRound);
  const votesByUserInActiveRound = useAppSelector(state => state.voting.votesByUserInActiveRound);
  const modalActive = useAppSelector(state => state.propHouse.modalActive);

  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const allottedVotesForProp = proposal && countVotesAllottedToProp(voteAllotments, proposal.id);

  const [voteCountDisplayed, setVoteCountDisplayed] = useState(0);
  const [inputIsInFocus, setInputIsInFocus] = useState(false);
  const [displayWarningTooltip, setDisplayWarningTooltip] = useState(false);
  const [attemptedInputVotes, setAttemptedInputVotes] = useState(0);

  const votesRemaining =
    round && isInfAuction(round)
      ? countVotesRemainingForInfRound(
          proposal.id,
          votingPower,
          votesByUserInActiveRound,
          voteAllotments,
        )
      : countVotesRemainingForTimedRound(votingPower, votesByUserInActiveRound, voteAllotments);
  const canAllotVotes = votesRemaining > 0;

  const isAllotting = () => (allottedVotesForProp && allottedVotesForProp > 0) || inputIsInFocus;

  useEffect(() => {
    if (allottedVotesForProp === undefined) return;
    setVoteCountDisplayed(allottedVotesForProp);
  }, [allottedVotesForProp]);

  // handles votes by clicking up/down arrows
  const handleClickVote = (e: any, direction: Direction) => {
    if (!proposal) return;
    e.stopPropagation();
    setVoteCountDisplayed(prev => (direction === Direction.Up ? prev + 1 : prev - 1));
    dispatch(
      allotVotes({
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        direction: direction,
        weight: 1,
      }),
    );
  };

  // handle votes by text input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!proposal) return;
    const value = e.currentTarget.value;
    const inputVotes = Number(value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1'));

    if (inputVotes > 100000) return; // prevent overflow

    // if attempting to input more than allowed total votes
    if (inputVotes > votesRemaining + allottedVotesForProp) {
      setAttemptedInputVotes(inputVotes);
      setDisplayWarningTooltip(true);
      setTimeout(() => {
        setDisplayWarningTooltip(false);
      }, 1500);
      return;
    }

    // reset prev allotment (reduce to 0)
    dispatch(
      allotVotes({
        proposalTitle: proposal.title,
        proposalId: proposal.id,
        direction: Direction.Down,
        weight: voteCountDisplayed,
      }),
    );

    // handle allottment
    dispatch(
      allotVotes({
        proposalTitle: proposal.title,
        proposalId: proposal.id,
        direction: Direction.Up,
        weight: inputVotes,
      }),
    );

    setVoteCountDisplayed(inputVotes);
  };

  // handle votes by up/down keyboard press
  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (!modalActive || showVoteAllotmentModal) return; // only use keyboard voting in modal

      const direction =
        event.key === 'ArrowUp'
          ? Direction.Up
          : event.key === 'ArrowDown'
          ? Direction.Down
          : undefined;

      if (direction === undefined || !proposal) return;
      if (direction === Direction.Up && !canAllotVotes) return;
      if (direction === Direction.Down && allottedVotesForProp === 0) return;

      event.preventDefault();
      setVoteCountDisplayed(prev => (direction === Direction.Up ? prev + 1 : prev - 1));

      dispatch(
        allotVotes({
          proposalId: proposal.id,
          proposalTitle: proposal.title,
          direction: direction,
          weight: 1,
        }),
      );
    },
    [modalActive, showVoteAllotmentModal, proposal, canAllotVotes, allottedVotesForProp, dispatch],
  );

  useEffect(() => {
    if (!modalActive) return;

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress, modalActive]);

  return (
    <Row>
      <Col xs={12} className={classes.bottomContainer} onClick={(e: any) => e.stopPropagation()}>
        <div className={clsx(isAllotting() && classes.activelyAllotting)}>
          <OverlayTrigger
            show={displayWarningTooltip}
            placement="top"
            overlay={
              <Tooltip className={classes.tooltip}>
                <span className={classes.tooltipTitle}>
                  {t('youDontHave')} {attemptedInputVotes} {t('votesAvailable')}
                </span>
              </Tooltip>
            }
          >
            <input
              type="text"
              value={displayWarningTooltip ? attemptedInputVotes : voteCountDisplayed}
              className={clsx(classes.votesAllottedInput, 'voteInput')}
              onChange={e => handleInputChange(e)}
              onFocus={() => setInputIsInFocus(true)}
            />
          </OverlayTrigger>
        </div>

        <div className={clsx(classes.voteBtns, 'votingBtns')}>
          <Button
            text="↓"
            bgColor={isAllotting() ? ButtonColor.PurpleLight : ButtonColor.Gray}
            classNames={classes.voteBtn}
            onClick={e => handleClickVote(e, Direction.Down)}
            disabled={allottedVotesForProp === 0}
          />
          <Button
            text="↑"
            bgColor={isAllotting() ? ButtonColor.PurpleLight : ButtonColor.Gray}
            classNames={classes.voteBtn}
            onClick={e => handleClickVote(e, Direction.Up)}
            disabled={!canAllotVotes}
          />
        </div>
      </Col>
    </Row>
  );
};

export default VotingControls;
