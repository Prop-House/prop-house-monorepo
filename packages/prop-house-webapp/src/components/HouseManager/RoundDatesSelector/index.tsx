import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '../../../hooks';
import { NewRound, checkStepCriteria, updateRound } from '../../../state/slices/round';
import Divider from '../../Divider';
import DualSectionSelector from '../DualSectionSelector';
import Group from '../Group';
import Section from '../Section';
import Text from '../Text';
import TimedRound from '../TimedRound';
import { getDayDifference } from '../utils/getDayDifference';

const RoundDatesSelector = () => {
  const [activeSection, setActiveSection] = useState(0);

  const dispatch = useDispatch();
  const round = useAppSelector(state => state.round.round);

  const handleChange = (property: keyof NewRound, value: NewRound[keyof NewRound]) => {
    dispatch(updateRound({ ...round, [property]: value }));
    dispatch(checkStepCriteria());
  };

  const dataToBeCleared = {
    startTime: null,
    proposalEndTime: null,
    votingEndTime: null,
  };

  const proposalPeriods = [5, 7, 14];
  const votingPeriods = [5, 7, 14];

  const calculateCustomPeriodState = (
    periodEnd: Date,
    previousPeriodEnd: Date,
    availablePeriods: number[],
  ) => {
    return !availablePeriods.includes(getDayDifference(periodEnd, previousPeriodEnd));
  };
  const [isCustomProposalPeriod, setIsCustomProposalPeriod] = useState(
    round.startTime && round.proposalEndTime
      ? calculateCustomPeriodState(round.proposalEndTime, round.startTime, proposalPeriods)
      : false,
  );
  const [isCustomVotingPeriod, setIsCustomVotingPeriod] = useState(
    round.votingEndTime && round.proposalEndTime
      ? calculateCustomPeriodState(round.votingEndTime, round.proposalEndTime, votingPeriods)
      : false,
  );
  const handlePeriodLengthChange = (length: number, isProposingPeriod: boolean) => {
    if (isProposingPeriod) {
      setIsCustomProposalPeriod(false);
      setProposingPeriodLength(length);
    } else {
      setIsCustomVotingPeriod(false);
      setVotingPeriodLength(length);
    }
  };
  const handleSelectCustomPeriod = (isProposingPeriod: boolean) => {
    if (isProposingPeriod) {
      setIsCustomProposalPeriod(true);
      setProposingPeriodLength(15);
    } else {
      setIsCustomVotingPeriod(true);
      setVotingPeriodLength(15);
    }
  };

  const [roundTime, setRoundTime] = useState({
    start: round.startTime ? round.startTime : null,
    proposalEnd: round.proposalEndTime ? round.proposalEndTime : null,
    votingEnd: round.votingEndTime ? round.votingEndTime : null,
  });
  const [proposingStartTime, setProposingStartTime] = useState<Date | null>(
    round.startTime ? new Date(round.startTime) : null,
  );
  const [proposingPeriodLength, setProposingPeriodLength] = useState<number | null>(
    round.startTime && round.proposalEndTime
      ? getDayDifference(round.proposalEndTime, round.startTime)
      : null,
  );
  const [votingPeriodLength, setVotingPeriodLength] = useState<number | null>(
    round.votingEndTime && round.proposalEndTime
      ? getDayDifference(round.votingEndTime, round.proposalEndTime)
      : null,
  );

  const handleProposingStartTimeChange = (date: Date | null) => {
    if (date) {
      setProposingStartTime(date);
      setRoundTime(prevRound => ({ ...prevRound, start: date }));
      handleChange('startTime', date.toISOString());
    }
  };

  useEffect(() => {
    if (proposingStartTime && proposingPeriodLength !== null) {
      const proposingEndTime = new Date(proposingStartTime);
      proposingEndTime.setDate(proposingEndTime.getDate() + proposingPeriodLength);
      setRoundTime(prevRound => ({ ...prevRound, proposalEnd: proposingEndTime }));
      handleChange('proposalEndTime', proposingEndTime.toISOString());
      dispatch(checkStepCriteria());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposingStartTime, proposingPeriodLength]);

  useEffect(() => {
    if (proposingStartTime && proposingPeriodLength !== null && votingPeriodLength !== null) {
      const votingEndTime = new Date(proposingStartTime);
      votingEndTime.setDate(votingEndTime.getDate() + proposingPeriodLength + votingPeriodLength);
      setRoundTime(prevRound => ({ ...prevRound, votingEnd: votingEndTime }));
      handleChange('votingEndTime', votingEndTime.toISOString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposingStartTime, proposingPeriodLength, votingPeriodLength]);

  useEffect(() => {
    if (roundTime.start && roundTime.proposalEnd && roundTime.votingEnd) {
      dispatch(
        updateRound({
          ...round,
          startTime: roundTime.start,
          proposalEndTime: roundTime.proposalEnd,
          votingEndTime: roundTime.votingEnd,
        }),
      );
      dispatch(checkStepCriteria());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundTime]);

  const disableVotingPeriod =
    !round.startTime || !round.proposalEndTime || proposingPeriodLength === null;

  return (
    <>
      <Group gap={4}>
        <Text type="subtitle">Select a round type</Text>
        <DualSectionSelector dataToBeCleared={dataToBeCleared} setActiveSection={setActiveSection}>
          <Section
            id={0}
            title="A time round"
            text="Set a specific end date and time for your round."
            activeSection={activeSection}
          />
          <Section
            id={1}
            title="Infinite round"
            text="A round that never ends and acts as a permanent pool of rewards."
            activeSection={activeSection}
          />
        </DualSectionSelector>
      </Group>

      <Divider />

      {activeSection === 0 && (
        <TimedRound
          isCustomProposalPeriodDisabled={!round.startTime}
          roundTime={roundTime}
          proposalPeriods={proposalPeriods}
          votingPeriods={votingPeriods}
          proposingPeriodLength={proposingPeriodLength}
          proposingStartTime={proposingStartTime}
          votingPeriodLength={votingPeriodLength}
          isCustomProposalPeriod={isCustomProposalPeriod}
          isCustomVotingPeriod={isCustomVotingPeriod}
          disableVotingPeriod={disableVotingPeriod}
          setProposingPeriodLength={setProposingPeriodLength}
          setVotingPeriodLength={setVotingPeriodLength}
          handlePeriodLengthChange={handlePeriodLengthChange}
          handleSelectCustomPeriod={handleSelectCustomPeriod}
          handleProposingStartTimeChange={handleProposingStartTimeChange}
        />
      )}
      {activeSection === 1 && <div>infinite round</div>}
    </>
  );
};

export default RoundDatesSelector;
