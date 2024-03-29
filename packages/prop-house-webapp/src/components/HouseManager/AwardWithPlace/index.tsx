import classes from './AwardWithPlace.module.css';
import Text from '../Text';
import getNumberWithOrdinal from '../../../utils/getNumberWithOrdinal';
import { getAwardEmoji } from '../../../utils/getAwardEmoji';

const AwardWithPlace: React.FC<{ place: number }> = props => {
  const { place } = props;

  return (
    <div className={classes.award}>
      {/* top 3 places get a medal emoji, the rest get a circle with the place number */}
      {place <= 3 && <Text type="subtitle">{getAwardEmoji(place)}</Text>}
      <Text type="subtitle">{getNumberWithOrdinal(place)} place</Text>
    </div>
  );
};

export default AwardWithPlace;
