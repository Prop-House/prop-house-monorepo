import classes from './JumboRoundCard.module.css';
import { House, Proposal, Round, Timed, usePropHouse } from '@prophouse/sdk-react';
import { OrderByProposalFields } from '@prophouse/sdk-react/node_modules/@prophouse/sdk/dist/gql/starknet/graphql';
import Card, { CardBgColor, CardBorderRadius } from '../Card';
import EthAddress from '../EthAddress';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Modal from '../Modal';
import useAssetsWithMetadata from '../../hooks/useAssetsWithMetadata';
import LoadingIndicator from '../LoadingIndicator';
import { Col, Row } from 'react-bootstrap';
import { timeFromNow } from '../../utils/timeFromNow';
import Button, { ButtonColor } from '../Button';
import { IoTime } from 'react-icons/io5';
import { HiDocument } from 'react-icons/hi';
import { FaClipboardCheck } from 'react-icons/fa';
import { HiTrophy } from 'react-icons/hi2';
import RoundStatusPill from '../RoundStatusPill';
import ProposalRankings from '../ProposalRankings';
import ProposedSummary from '../ProposedSummary';
import { trophyColors } from '../../utils/trophyColors';
import { isMobile } from 'web3modal';
import RoundAwardsDisplay from '../RoundAwardsDisplay';

const JumboRoundCard: React.FC<{ round: Round; house: House }> = props => {
  const { round, house } = props;

  let navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [loading, assetsWithMetadata] = useAssetsWithMetadata(round.config.awards);
  const propHouse = usePropHouse();
  const [numProps, setNumProps] = useState<number | undefined>();
  const [topThreeProps, setTopThreeProps] = useState<Proposal[]>();
  const [proposals, setProposals] = useState<Proposal[]>();
  const [fetchingTop3Props, setFetchingTop3Props] = useState(false);

  const showAwards =
    round.state === Timed.RoundState.NOT_STARTED ||
    round.state === Timed.RoundState.IN_PROPOSING_PERIOD;
  const showProposed = round.state === Timed.RoundState.IN_PROPOSING_PERIOD;
  const showRankings = round.state >= Timed.RoundState.IN_VOTING_PERIOD;
  const roundEnded = round.state > Timed.RoundState.IN_VOTING_PERIOD;

  useEffect(() => {
    if (numProps) return;
    const fetchProps = async () => {
      try {
        setNumProps(await propHouse.query.getRoundProposalCount(round.address));
      } catch (e) {
        console.log(e);
      }
    };
    fetchProps();
  });

  useEffect(() => {
    if (topThreeProps || !showRankings) return;
    const fetchTopThreeProps = async () => {
      try {
        setFetchingTop3Props(true);
        const props = await propHouse.query.getProposalsForRound(round.address, {
          page: 1,
          perPage: 3,
          orderBy: OrderByProposalFields.VotingPower,
          where: { isCancelled: false },
        });
        setFetchingTop3Props(false);
        setTopThreeProps(props);
      } catch (e) {
        setFetchingTop3Props(false);
        console.log(e);
      }
    };
    fetchTopThreeProps();
  });

  useEffect(() => {
    if (proposals || !showProposed) return;
    const fetchProposals = async () => {
      try {
        const props = await propHouse.query.getProposalsForRound(round.address, {
          where: { isCancelled: false },
        });
        setProposals(props);
      } catch (e) {
        console.log(e);
      }
    };
    fetchProposals();
  });

  const awardsModalContent = (
    <div className={classes.awardsModalContentContainer}>
      {loading ? (
        <LoadingIndicator />
      ) : (
        assetsWithMetadata &&
        assetsWithMetadata.map((award, i) => {
          return (
            <div key={i}>
              <span className={classes.place}>
                {i + 1}
                {i < 2 ? 'st' : 'th'} place:
              </span>{' '}
              <span className={classes.amountAndSymbol}>
                {award.parsedAmount} {award.symbol}
              </span>
            </div>
          );
        })
      )}
    </div>
  );

  return showModal ? (
    <Modal
      modalProps={{
        title: 'Awards',
        subtitle: 'See all awards',
        setShowModal: setShowModal,
        body: awardsModalContent,
      }}
    />
  ) : (
    <div onClick={e => navigate(`/${round.address}`)}>
      <Card
        bgColor={CardBgColor.White}
        borderRadius={CardBorderRadius.twenty}
        classNames={classes.roundCard}
        onHoverEffect={false}
      >
        <Row className={classes.container}>
          <Col className={classes.leftCol} xs={12} md={6}>
            <div className={classes.headerContainer}>
              <div className={classes.roundCreatorAndTitle}>
                <div className={classes.roundCreator}>
                  <EthAddress
                    address={house.address}
                    imgSrc={house.imageURI?.replace(
                      /prophouse.mypinata.cloud/g,
                      'cloudflare-ipfs.com',
                    )}
                    addAvatar={true}
                    className={classes.roundCreator}
                  />
                </div>
                <div className={classes.roundTitle}>
                  {round.title[0].toUpperCase() + round.title.slice(1)}
                </div>
              </div>
              {isMobile() && <RoundStatusPill round={round} />}
            </div>
            <div className={classes.statusItemContainer}>
              {!isMobile() && (
                <div className={classes.item}>
                  <div className={classes.title}>
                    <FaClipboardCheck /> Status
                  </div>
                  <div className={classes.content}>
                    <RoundStatusPill round={round} />
                  </div>
                </div>
              )}

              <div className={classes.item}>
                <div className={classes.title}>
                  <IoTime />
                  Deadline
                </div>
                <div className={classes.content}>
                  {timeFromNow(round.config.proposalPeriodEndTimestamp * 1000)}
                </div>
              </div>
              <div className={classes.item}>
                <div className={classes.title}>
                  <HiDocument /> Created
                </div>
                <div className={classes.content}>{numProps} props</div>
              </div>
            </div>
          </Col>

          <Col className={classes.rightCol} xs={12} md={6}>
            {showAwards && (
              <div className={classes.awardsContainer}>
                <div className={classes.title}>
                  <HiTrophy size={14} color={trophyColors('second')} />
                  Awards
                </div>
                <RoundAwardsDisplay
                  round={round}
                  breakout={false}
                  hidePlace={true}
                  slidesOffsetAfter={0}
                  slidesOffsetBefore={0}
                  showNav={!isMobile()}
                />
              </div>
            )}

            {proposals && showProposed && (
              <ProposedSummary proposers={proposals.map(p => p.proposer)} />
            )}

            {showRankings && (
              <>
                {fetchingTop3Props ? (
                  <LoadingIndicator />
                ) : (
                  topThreeProps && (
                    <ProposalRankings proposals={topThreeProps} areWinners={roundEnded} />
                  )
                )}
              </>
            )}
            <Button
              text="View round"
              bgColor={ButtonColor.Purple}
              classNames={classes.rightColBtn}
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default JumboRoundCard;