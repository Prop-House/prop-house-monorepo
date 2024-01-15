import classes from './ActivityFeed.module.css';
import {
  OrderDirection,
  Proposal,
  Vote,
  usePropHouse,
  Vote_Order_By,
  Proposal_Order_By,
} from '@prophouse/sdk-react';
import { useEffect, useState } from 'react';
import { Col, Row } from 'react-bootstrap';
import EthAddress from '../EthAddress';
import { timeFromNow } from '../../utils/timeFromNow';
import { useNavigate } from 'react-router-dom';
import Button, { ButtonColor } from '../Button';
import { lumpVotes } from '../../utils/lumpVotes';
import { parsedVotingPower } from '../../utils/parsedVotingPower';
import { truncateThousands } from '../../utils/truncateThousands';

type ActivityItem = Proposal | Vote;

const ActivityFeed: React.FC<{}> = () => {
  const propHouse = usePropHouse();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<ActivityItem[]>();
  const [fetchMoreActivity, setFetchMoreActivity] = useState(true);
  const [votesPageIndex, setVotesPageIndex] = useState(1);
  const [propsPageIndex, setPropsPageIndex] = useState(1);
  const [endOfVotes, setEndOfVotes] = useState(false);
  const [endOfProps, setEndOfProps] = useState(false);

  useEffect(() => {
    if (!fetchMoreActivity) return;

    const fetchVotes = async () => {
      try {
        setFetchMoreActivity(false);

        const votes = lumpVotes(
          await propHouse.query.getVotes({
            page: votesPageIndex,
            orderBy: Vote_Order_By.ReceivedAt,
            orderDirection: OrderDirection.Desc,
          }),
        );

        votes.length === 0 ? setEndOfVotes(true) : setVotesPageIndex(prev => prev + 1);

        setActivity(prev => {
          const prevActivity = prev || [];
          return [...prevActivity, ...votes].sort((a, b) => (a.receivedAt > b.receivedAt ? -1 : 1));
        });
      } catch (e) {
        setFetchMoreActivity(false);
        console.log(e);
      }
    };
    fetchVotes();
  });

  useEffect(() => {
    if (!fetchMoreActivity) return;

    const fetchProps = async () => {
      try {
        setFetchMoreActivity(false);

        const props = await propHouse.query.getProposals({
          page: propsPageIndex,
          orderBy: Proposal_Order_By.ReceivedAt,
          orderDirection: OrderDirection.Desc,
        });

        props.length === 0 ? setEndOfProps(true) : setPropsPageIndex(prev => prev + 1);

        setActivity(prev => {
          const prevActivity = prev || [];
          return [...prevActivity, ...props].sort((a, b) => (a.receivedAt > b.receivedAt ? -1 : 1));
        });
      } catch (e) {
        setFetchMoreActivity(false);
        console.log(e);
      }
    };
    fetchProps();
  });

  const activityContent = (item: Proposal | Vote) => {
    let votes = parsedVotingPower(item.votingPower, item.round);
    return 'proposer' in item ? (
      <>
        proposed&nbsp;
        <span onClick={() => navigate(`/${item.round}/${item.id}`)}>{item.title}</span>
      </>
    ) : (
      <>
        cast&nbsp;
        {votes.gte(1000) ? truncateThousands(votes.toNumber()) : votes.toString()}
        &nbsp;vote{votes.eq(1) ? '' : 's'}
      </>
    );
  };

  return (
    <Row>
      <Col>
        <div className={classes.activityContainer}>
          {activity &&
            activity.map((item, i) => {
              return (
                <div className={classes.activityItem} key={i}>
                  <div>
                    <EthAddress
                      address={'proposer' in item ? item.proposer : item.voter}
                      addAvatar={true}
                      avatarSize={12}
                      className={classes.address}
                    />
                    <div className={classes.activityContent}>{activityContent(item)}</div>
                  </div>
                  <div className={classes.timestamp}>{timeFromNow(item.receivedAt * 1000)}</div>
                </div>
              );
            })}
          <Button
            text={endOfProps && endOfVotes ? 'End of activity' : 'Load more'}
            onClick={() => setFetchMoreActivity(true)}
            bgColor={ButtonColor.Purple}
            disabled={endOfProps && endOfVotes}
          />
        </div>
      </Col>
    </Row>
  );
};
export default ActivityFeed;
