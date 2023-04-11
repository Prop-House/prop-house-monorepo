import classes from './Rounds.module.css';
import Card, { CardBgColor, CardBorderRadius } from '../../Card';
import { Col, Container, Row } from 'react-bootstrap';
import { usePropHouse } from '@prophouse/sdk-react';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import Text from '../Text';
import Markdown from 'markdown-to-jsx';
import { changeTagToParagraph, changeTagToSpan } from '../../RoundCard';
import sanitizeHtml from 'sanitize-html';
import Group from '../Group';
import StatusLabel from '../../StatusLabel';
import Divider from '../../Divider';
import Button, { ButtonColor } from '../../Button';

export enum RoundState {
  AwaitingRegistration = 'AWAITING_REGISTRATION',
  Cancelled = 'CANCELLED',
  Finalized = 'FINALIZED',
  Registered = 'REGISTERED',
}

type Round = {
  __typename?: 'Round';
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt: any;
  state: RoundState;
};

type ManyRoundsSimpleManagedByAccountQuery = {
  __typename?: 'Query';
  rounds: Round[];
};

const Rounds: React.FC = () => {
  const propHouse = usePropHouse();
  const { address: account } = useAccount();
  const [rounds, setRounds] = useState<Round[]>([]);

  useEffect(() => {
    async function fetchRounds() {
      try {
        const data: ManyRoundsSimpleManagedByAccountQuery =
          await propHouse.query.getRoundsManagedByAccount(account as string, {
            page: 1,
            perPage: 10,
          });
        propHouse.query.getHouses().then(data => console.log(data.houses));

        const roundDetailsPromises = data.rounds.map(round => propHouse.query.getRound(round.id));

        const roundDetailsArray = await Promise.all(roundDetailsPromises);

        const combinedRounds: Round[] = data.rounds.map((round, index) => ({
          ...round,
          ...roundDetailsArray[index].round,
        }));

        setRounds(combinedRounds);
      } catch (error) {
        console.error('Error fetching rounds:', error);
      }
    }
    fetchRounds();
  }, [account, propHouse.query]);

  return (
    <>
      <Container>
        <Row>
          <Col xl={8} className={classes.cardsContainer}>
            {rounds.map((round, idx) => (
              <Card
                key={idx}
                bgColor={CardBgColor.White}
                classNames={classes.primaryCard}
                borderRadius={CardBorderRadius.thirty}
              >
                <Group gap={12}>
                  <Group row classNames={classes.house}>
                    <Group gap={6} row classNames={classes.house}>
                      <img src={'/manager/fallback.png'} alt={'fallback'} />
                      <Text type="subtitle">{`House title`}</Text>
                    </Group>

                    <StatusLabel state={round.state} />
                  </Group>

                  <Group gap={12}>
                    <Text type="title" classNames={classes.title}>
                      {round.title}
                    </Text>
                    <Text type="body" classNames={classes.description}>
                      <Markdown
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
                        {sanitizeHtml(round.description as any, {
                          allowedAttributes: { a: ['href', 'target'] },
                        })}
                      </Markdown>{' '}
                    </Text>{' '}
                  </Group>

                  <Group>
                    <Divider />

                    <Button
                      text={'Fund'}
                      classNames={classes.button}
                      onClick={() => {}}
                      bgColor={ButtonColor.Green}
                    />
                  </Group>
                </Group>
              </Card>
            ))}
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default Rounds;