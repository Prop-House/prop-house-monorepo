import classes from './PrimaryCard.module.css';
import Card, { CardBgColor, CardBorderRadius } from '../../Card';
import { useAppSelector } from '../../../hooks';
import HouseInfoConfig from '../HouseInfoConfig';
import RoundInfoConfig from '../RoundInfoConfig';
import VotersConfig from '../VotersConfig';
import AwardsConfig from '../AwardsConfig';
import DatesConfig from '../DatesConfig';
import CreateRound from '../CreateRound';

const PrimaryCard: React.FC = () => {
  const activeStep = useAppSelector(state => state.round.activeStep);

  // This sets the content of the primary card based on the active step
  const renderStep = () => {
    switch (activeStep) {
      case 1:
        return <HouseInfoConfig />;
      case 2:
        return <RoundInfoConfig />;
      case 3:
        return <VotersConfig />;
      case 4:
        return <AwardsConfig />;
      case 5:
        return <DatesConfig />;
      case 6:
        return <CreateRound />;
      default:
        return null;
    }
  };

  return (
    <>
      <Card
        bgColor={CardBgColor.White}
        classNames={classes.primaryCard}
        borderRadius={CardBorderRadius.thirty}
      >
        {renderStep()}
      </Card>
    </>
  );
};

export default PrimaryCard;
