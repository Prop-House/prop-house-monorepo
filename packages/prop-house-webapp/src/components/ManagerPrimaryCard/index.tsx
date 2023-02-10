import classes from './ManagerPrimaryCard.module.css';
import Card, { CardBgColor, CardBorderRadius } from '../Card';
import NameTheRound from '../HouseManager/NameTheRound';
import WhoCanParticipate from '../HouseManager/WhoCanParticipate';
import SetTheAwards from '../HouseManager/SetTheAwards';

import { useAppSelector } from '../../hooks';
import RoundTiming from '../HouseManager/RoundTiming';

const ManagerPrimaryCard: React.FC<{}> = () => {
  const activeStep = useAppSelector(state => state.createRound.activeStep);

  return (
    <>
      <Card
        bgColor={CardBgColor.White}
        borderRadius={CardBorderRadius.thirty}
        classNames={classes.primaryCard}
      >
        {activeStep === 1 && <NameTheRound />}
        {activeStep === 2 && <WhoCanParticipate />}
        {activeStep === 3 && <SetTheAwards />}
        {activeStep === 4 && <RoundTiming />}
      </Card>
    </>
  );
};

export default ManagerPrimaryCard;