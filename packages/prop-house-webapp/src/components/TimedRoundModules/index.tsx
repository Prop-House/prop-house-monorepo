import classes from './TimedRoundModules.module.css';
import { Col } from 'react-bootstrap';
import clsx from 'clsx';
import TimedRoundAcceptingPropsModule from '../TimedRoundAcceptingPropsModule';
import TimedRoundVotingModule from '../TimedRoundVotingModule';
import RoundOverModule from '../RoundOverModule';
import React, { Dispatch, SetStateAction } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/swiper.min.css';
import { isMobile } from 'web3modal';
import RoundModuleNotStarted from '../RoundModuleNotStarted';
import { Proposal, Round, Timed } from '@prophouse/sdk-react';
import RoundModuleCancelled from '../RoundModuleCancelled';
import RoundModuleUnknownState from '../RoundModuleUnknownState';

const TimedRoundModules: React.FC<{
  round: Round;
  proposals: Proposal[];
  setShowVotingModal: Dispatch<SetStateAction<boolean>>;
}> = props => {
  const { round, proposals, setShowVotingModal } = props;

  const totalVotesAcrossAllProps = proposals.reduce(
    (total, prop) => (total = total + Number(prop.votingPower)),
    0,
  );

  const roundStateUnknown = round.state === Timed.RoundState.UNKNOWN && <RoundModuleUnknownState />;

  const roundCancelled = round.state === Timed.RoundState.CANCELLED && <RoundModuleCancelled />;

  const notStartedModule = round.state === Timed.RoundState.NOT_STARTED && (
    <RoundModuleNotStarted round={round} />
  );

  const acceptingPropsModule = round.state === Timed.RoundState.IN_PROPOSING_PERIOD && (
    <TimedRoundAcceptingPropsModule round={round} />
  );

  const timedRoundVotingModule = round.state === Timed.RoundState.IN_VOTING_PERIOD && (
    <TimedRoundVotingModule
      round={round}
      setShowVotingModal={setShowVotingModal}
      totalVotes={totalVotesAcrossAllProps}
    />
  );

  const roundOverModule = round.state > Timed.RoundState.IN_VOTING_PERIOD && (
    <RoundOverModule numOfProposals={proposals.length} totalVotes={totalVotesAcrossAllProps} />
  );

  const modules = [
    roundStateUnknown,
    roundCancelled,
    notStartedModule,
    acceptingPropsModule,
    timedRoundVotingModule,
    roundOverModule,
  ];

  return (
    <Col xl={4} className={clsx(classes.sideCards, classes.breakOut)}>
      {isMobile() ? (
        <Swiper slidesPerView={1} className={classes.swiper}>
          {modules.map(
            (module, index) =>
              React.isValidElement(module) && (
                <SwiperSlide style={{ paddingLeft: '24px', paddingRight: '24px' }} key={index}>
                  {module}
                </SwiperSlide>
              ),
          )}
        </Swiper>
      ) : (
        modules.map(m => m)
      )}
    </Col>
  );
};
export default TimedRoundModules;