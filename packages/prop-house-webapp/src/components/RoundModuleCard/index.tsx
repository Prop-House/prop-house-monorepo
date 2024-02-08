import classes from './RoundModuleCard.module.css';
import Card, { CardBgColor, CardBorderRadius } from '../Card';
import { ReactElement } from 'react-markdown/lib/react-markdown';
import { MdOutlineLightbulb as BulbIcon } from 'react-icons/md';
import { MdHowToVote as VoteIcon } from 'react-icons/md';
import { FiAward } from 'react-icons/fi';
import { GiDeadHead } from 'react-icons/gi';
import { AiOutlineClockCircle } from 'react-icons/ai';
import { IoGameControllerOutline } from 'react-icons/io5';
import clsx from 'clsx';

const RoundModuleCard: React.FC<{
  title: string | ReactElement;
  subtitle?: string | ReactElement;
  content: ReactElement;
  type:
    | 'unknown'
    | 'cancelled'
    | 'proposing'
    | 'voting'
    | 'ended'
    | 'winner'
    | 'rejected'
    | 'stale'
    | 'not started';
}> = props => {
  const { title, subtitle, content, type } = props;
  return (
    <Card
      bgColor={CardBgColor.White}
      borderRadius={CardBorderRadius.thirty}
      classNames={classes.sidebarContainerCard}
    >
      <>
        <div className={classes.sideCardHeader}>
          <div
            className={clsx(
              classes.icon,
              type === 'proposing' || type === 'winner' || type === 'not started'
                ? classes.greenIcon
                : type === 'voting'
                ? classes.purpleIcon
                : type === 'stale' ||
                  type === 'rejected' ||
                  type === 'cancelled' ||
                  type === 'unknown'
                ? classes.grayIcon
                : classes.blackIcon,
            )}
          >
            {type === 'proposing' ? (
              <BulbIcon />
            ) : type === 'winner' ? (
              <FiAward />
            ) : type === 'rejected' || type === 'cancelled' || type === 'unknown' ? (
              <GiDeadHead />
            ) : type === 'stale' ? (
              <AiOutlineClockCircle />
            ) : type === 'not started' ? (
              <IoGameControllerOutline />
            ) : (
              <VoteIcon />
            )}
          </div>
          <div className={classes.textContainer}>
            <div className={classes.title}>{title}</div>
            <div className={classes.subtitle}>{subtitle}</div>
          </div>
        </div>
        <hr className={classes.divider} />
      </>
      <div className={classes.sideCardBody}>{content}</div>
    </Card>
  );
};
export default RoundModuleCard;
