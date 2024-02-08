import classes from './Houses.module.css';
import { House, usePropHouse } from '@prophouse/sdk-react';
import React, { useEffect, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import Button, { ButtonColor } from '../../components/Button';
import PageHeader from '../../components/PageHeader';
import { useFavoriteCommunities } from '../../hooks/useFavoriteCommunities';
import { sortHousesForFavs } from '../../utils/sortHousesForFavs';
import HouseCard from '../../components/HouseCard';
import Skeleton from 'react-loading-skeleton';
import { House_OrderBy } from '@prophouse/sdk-react';

const Houses: React.FC = () => {
  const [houses, setHouses] = useState<House[]>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fetchMore, setFetchMore] = useState(true);
  const [noMoreAvail, setNoMoreAvail] = useState(false);

  const propHouse = usePropHouse();

  const { favoriteCommunities, isFavoriteCommunity } = useFavoriteCommunities();

  useEffect(() => {
    const fetchHouses = async () => {
      if (!fetchMore) return;
      try {
        setLoading(true);
        setFetchMore(false);

        const fetchedHouses = await propHouse.query.getHouses({
          page: page,
          perPage: 12,
          orderBy: House_OrderBy.RoundCount,
        });

        setLoading(false);

        if (fetchedHouses.length === 0) {
          setNoMoreAvail(true);
          return;
        }

        setPage(prev => prev + 1);
        setHouses(prev => {
          const houses = prev ? [...prev, ...fetchedHouses] : fetchedHouses;
          return sortHousesForFavs(houses, favoriteCommunities);
        });
      } catch (error) {
        setFetchMore(false);
        setLoading(false);
        console.error('Error fetching houses:', error);
      }
    };
    fetchHouses();
  }, [fetchMore, page, propHouse.query, isFavoriteCommunity, favoriteCommunities]);

  return (
    <Container>
      <PageHeader title="Houses" subtitle="Discover all the houses running on Prop House" />
      <Row>
        {loading ? (
          <>
            {Array.from(Array(8).keys()).map(i => (
              <Col key={i} xs={6} lg={3}>
                <Skeleton height={280} inline style={{ marginBottom: '20px' }} />
              </Col>
            ))}
          </>
        ) : (
          houses &&
          houses.map((house, i) => (
            <Col key={i} xs={6} lg={3}>
              <HouseCard house={house} favHandling={true} pathTo="page" />
            </Col>
          ))
        )}
      </Row>
      <Row className={classes.loadMoreRow}>
        <Button
          text={
            noMoreAvail
              ? 'No more communities available'
              : loading
              ? 'Loading...'
              : 'Load more communities'
          }
          bgColor={ButtonColor.PurpleLight}
          classNames={classes.loadMoreBtn}
          onClick={() => setFetchMore(true)}
          disabled={noMoreAvail || loading}
        />
      </Row>
    </Container>
  );
};

export default Houses;
