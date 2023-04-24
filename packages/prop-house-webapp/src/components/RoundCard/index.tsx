import classes from './RoundCard.module.css';
import Card, { CardBgColor, CardBorderRadius } from '../Card';
import { StoredAuctionBase } from '@nouns/prop-house-wrapper/dist/builders';
import clsx from 'clsx';
import { deadlineCopy, deadlineTime } from '../../utils/auctionStatus';
import { useNavigate } from 'react-router-dom';
import StatusPill from '../StatusPill';
import { nameToSlug } from '../../utils/communitySlugs';
import diffTime from '../../utils/diffTime';
import { useTranslation } from 'react-i18next';
import Tooltip from '../Tooltip';
import dayjs from 'dayjs';
import { cmdPlusClicked } from '../../utils/cmdPlusClicked';
import { openInNewTab } from '../../utils/openInNewTab';
import { useAppDispatch } from '../../hooks';
import { setActiveRound } from '../../state/slices/propHouse';
import TruncateThousands from '../TruncateThousands';
import Markdown from 'markdown-to-jsx';
import sanitizeHtml from 'sanitize-html';
import { isInfAuction, isTimedAuction } from '../../utils/auctionType';
import { countDecimals } from '../../utils/countDecimals';
import { Round, RoundState, TimedFunding, usePropHouse } from '@prophouse/sdk-react';

export interface changeTagProps {
  children: React.ReactNode;
}

// overrides any tag to become a <p> tag
export const changeTagToParagraph = ({ children }: changeTagProps) => <p>{children}</p>;

// overrides any tag to become a <span> tag
export const changeTagToSpan = ({ children }: changeTagProps) => <span>{children}</span>;

const RoundCard: React.FC<{
  round: Round;
}> = props => {
  const { round } = props;
  const propHouse = usePropHouse();

  const { t } = useTranslation();
  let navigate = useNavigate();
  const dispatch = useAppDispatch();

  return (
    <>
      <div
        onClick={e => {
          dispatch(setActiveRound(round));
          if (cmdPlusClicked(e)) {
            openInNewTab(`${window.location.href}/${round.address}`);
            return;
          }
          navigate(round.address);
        }}
      >
        <Card
          bgColor={CardBgColor.White}
          borderRadius={CardBorderRadius.twenty}
          classNames={clsx(
            round.state === RoundState.COMPLETE && classes.roundEnded,
            classes.roundCard,
          )}
        >
          <div className={classes.textContainer}>
            <div className={classes.titleContainer}>
              <div className={classes.authorContainer}>{round.title}</div>
              <StatusPill status={round.state} />
            </div>

            {/* support both markdown & html in round's description.  */}
            <Markdown
              className={classes.truncatedTldr}
              options={{
                overrides: {
                  h1: changeTagToParagraph,
                  h2: changeTagToParagraph,
                  h3: changeTagToParagraph,
                  a: changeTagToSpan,
                  br: changeTagToSpan,
                },
              }}
            >
              {sanitizeHtml(round.description)}
            </Markdown>
          </div>

          <div className={classes.roundInfo}>
            <div className={clsx(classes.section, classes.funding)}>
              <p className={classes.title}>{t('funding')}</p>
              <p className={classes.info}>
                {/* TODO: It's a little more complex now */}
                {/* <span className="">
                  <TruncateThousands
                    amount={round.fundingAmount}
                    decimals={countDecimals(round.fundingAmount) === 3 ? 3 : 2}
                  />
                  {` ${round.currencyType}`}
                </span>*/}
                {isTimedAuction(round) && (
                  <>
                    <span className={classes.xDivide}>{' × '}</span>
                    <span className="">{round.config.winnerCount}</span>
                  </>
                )}
              </p>
            </div>

            <div className={classes.divider}></div>

            <div className={classes.section}>
              {/* TODO: Not yet implemented */}
              {/* <Tooltip
                content={
                  <>
                    <p className={classes.title}>
                      {isInfAuction(round) ? 'Quorum' : deadlineCopy(round)}
                    </p>
                    <p className={classes.info}>
                      {isInfAuction(round)
                        ? round.quorum
                        : diffTime(deadlineTime(round)).replace('months', 'mos')}{' '}
                    </p>
                  </>
                }
                tooltipContent={
                  isInfAuction(round)
                    ? `The number of votes required for a prop to be funded`
                    : `${dayjs(deadlineTime(round)).tz().format('MMMM D, YYYY h:mm A z')}`
                }
              /> */}
            </div>

            <div className={clsx(classes.divider, classes.propSection)}></div>

            {/* TODO: Display proposal count */}
            {/* <div className={clsx(classes.section, classes.propSection)}>
              <p className={classes.title}> {t('proposalsCap')}</p>
              <p className={classes.info}>{round.numProposals}</p>
            </div> */}
          </div>
        </Card>
      </div>
    </>
  );
};

export default RoundCard;
