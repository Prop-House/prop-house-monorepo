import classes from './Dashboard.module.css';
import { House, RoundWithHouse, usePropHouse } from '@prophouse/sdk-react';
import { useEffect, useState } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { useAccount } from 'wagmi';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import ConnectToContinue from '../../components/ConnectToContinue';
import { NounImage } from '../../utils/getNounImage';
import Button, { ButtonColor } from '../../components/Button';
import LoadingIndicator from '../../components/LoadingIndicator';
import HouseCard from '../../components/HouseCard';
import JumboRoundCard from '../../components/JumboRoundCard';
import { ROUND_OVERRIDES } from '../../utils/roundOverrides';

const Dashboard = () => {
  const [rounds, setRounds] = useState<RoundWithHouse[]>();
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [houses, setHouses] = useState<House[]>();
  const [loadingHouses, setLoadingHouses] = useState(false);

  const propHouse = usePropHouse();
  const navigate = useNavigate();
  const { address: account } = useAccount();

  useEffect(() => {
    if (!account || houses) return;

    const fetchHouses = async () => {
      try {
        setLoadingHouses(true);
        const houses = await propHouse.query.getHousesWhereAccountIsOwner(account);
        setLoadingHouses(false);
        setHouses(houses);
      } catch (e) {
        setLoadingHouses(false);
        console.log(e);
      }
    };
    fetchHouses();
  });

  useEffect(() => {
    if (!account || rounds) return;

    const fetchRounds = async () => {
      try {
        setLoadingRounds(true);
        const rounds = (await propHouse.query.getRoundsWithHouseInfoManagedByAccount(account)).map(
          round => {
            if (ROUND_OVERRIDES[round.address]) {
              round.state = ROUND_OVERRIDES[round.address].state;
            }
            return round;
          },
        );
        setLoadingRounds(false);
        setRounds(rounds);
      } catch (e) {
        setLoadingRounds(false);
        console.log(e);
      }
    };
    fetchRounds();
  });

  const emptyIndicatorContent = (type: 'rounds' | 'houses') => (
    <div className={classes.noRoundsDiv}>
      <img
        src={type === 'rounds' ? NounImage.Hardhat.src : NounImage.House.src}
        alt={type === 'rounds' ? NounImage.Hardhat.alt : NounImage.House.alt}
      />

      <p>
        {type === 'rounds'
          ? 'Your account does not manage any rounds.'
          : 'Your account does not manage any houses.'}
      </p>
      {type === 'rounds' ? (
        <Button
          text="Create a round"
          bgColor={ButtonColor.PurpleLight}
          onClick={() => navigate('/create-round')}
        />
      ) : (
        <Button
          text="Create a house"
          bgColor={ButtonColor.PurpleLight}
          onClick={() => navigate('/create-round')}
        />
      )}
    </div>
  );
  return (
    <Container>
      <PageHeader title="Dashboard" subtitle="Manage your houses and rounds" />

      {!account ? (
        <ConnectToContinue />
      ) : (
        <>
          <Row className={classes.row}>
            <Col xl={12}>
              <div className={classes.subheading}>Houses</div>
            </Col>
            {loadingHouses ? (
              <LoadingIndicator />
            ) : houses && houses.length === 0 ? (
              emptyIndicatorContent('houses')
            ) : (
              houses &&
              houses.map(house => (
                <Col xs={6} lg={3}>
                  <HouseCard house={house} pathTo="manager" />
                </Col>
              ))
            )}
          </Row>
          <Row className={classes.row}>
            <Col xl={12}>
              <div className={classes.subheading}>Rounds</div>
            </Col>
            {loadingRounds ? (
              <LoadingIndicator />
            ) : (
              rounds &&
              (rounds.length === 0 ? (
                emptyIndicatorContent('rounds')
              ) : (
                <>
                  {rounds.map((r, i) => (
                    <Col key={i} lg={6}>
                      <JumboRoundCard
                        round={r}
                        house={r.house}
                        onClick={() =>
                          navigate(`/manage/round/${r.address}`, { state: { round: r } })
                        }
                      />
                    </Col>
                  ))}
                </>
              ))
            )}
          </Row>
        </>
      )}
    </Container>
  );
};

export default Dashboard;
