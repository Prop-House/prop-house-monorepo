import HomeHeader from '../../HomeHeader';
import classes from './Home.module.css';
import { Container } from 'react-bootstrap';
import CommunityCardGrid from '../../CommunityCardGrid';
import { useEffect, useState, useRef } from 'react';
import { Community } from '@nouns/prop-house-wrapper/dist/builders';
import { PropHouseWrapper } from '@nouns/prop-house-wrapper';
import { useEthers } from '@usedapp/core';
import { useAppSelector } from '../../../hooks';
import NavBar from '../../NavBar';

export interface StatsProps {
  accEthFunded: number;
  accRounds: number;
  accProps: number;
}

const Home = () => {
  const [input, setInput] = useState('');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<StatsProps>({
    accEthFunded: 0,
    accRounds: 0,
    accProps: 0,
  });

  const handleSeachInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const { library } = useEthers();
  const host = useAppSelector(state => state.configuration.backendHost);
  const client = useRef(new PropHouseWrapper(host));

  useEffect(() => {
    client.current = new PropHouseWrapper(host, library?.getSigner());
  }, [library, host]);

  // fetch communities
  useEffect(() => {
    const getCommunities = async () => {
      setIsLoading(true);
      const communities = await client.current.getCommunities();

      setCommunities(communities.sort((a, b) => (a.ethFunded < b.ethFunded ? 1 : -1)));

      const accEthFunded = communities
        // filter out Meebits/APE
        .filter((c: any) => c.contractAddress !== '0x7Bd29408f11D2bFC23c34f18275bBf23bB716Bc7')
        // filter out UMA
        .filter((c: any) => c.contractAddress !== '0x2381b67c6f1cb732fdf8b3b29d3260ec6f7420bc')
        // filter out USDC
        .filter((c: any) => c.contractAddress !== '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
        .reduce((prev, current) => prev + current.ethFunded, 0);
      const accRounds = communities.reduce((prev, current) => prev + current.numAuctions, 0);
      const accProps = communities.reduce((prev, current) => prev + current.numProposals, 0);
      setStats({
        accEthFunded,
        accRounds,
        accProps,
      });

      setIsLoading(false);
    };
    getCommunities();
  }, []);

  return (
    <>
      <div className="homeGradientBg">
        <NavBar />
        <HomeHeader input={input} handleSeachInputChange={handleSeachInputChange} stats={stats} />
      </div>

      <Container className={classes.homeCardsContainer}>
        <CommunityCardGrid input={input} communities={communities} isLoading={isLoading} />
      </Container>
    </>
  );
};

export default Home;
