import classes from './HouseSelection.module.css';
import React, { useState, useEffect } from 'react';
import { PropHouse } from '@prophouse/sdk-react';
import Group from '../Group';
import clsx from 'clsx';
import Text from '../Text';
import { HiOutlineChevronRight as ArrowIcon } from 'react-icons/hi';
import Divider from '../../Divider';
import { v4 as uuidv4 } from 'uuid';
import { buildImageURL } from '../utils/buildImageURL';
import sanitizeHtml from 'sanitize-html';
import Markdown from 'markdown-to-jsx';
import { changeTagToParagraph, changeTagToSpan } from '../../RoundCard';

interface HouseSelectionProps {
  propHouse: PropHouse;
  onSelectHouse: (house: FetchedHouse) => void;
  handleCreateNewHouse: () => void;
}

export interface FetchedHouse {
  id: string;
  metadata?: {
    name?: string | null;
    description?: string | null;
    imageURI?: string | null;
  } | null;
  createdAt: string;
  roundCount: number;
}

const HouseSelection: React.FC<HouseSelectionProps> = ({
  propHouse,
  onSelectHouse,
  handleCreateNewHouse,
}) => {
  const [houses, setHouses] = useState<FetchedHouse[]>([]);

  useEffect(() => {
    async function fetchHouses() {
      try {
        propHouse.query.getHouses().then(data => setHouses(data.houses));
      } catch (error) {
        console.error('Error fetching houses:', error);
      }
    }
    fetchHouses();
  }, [propHouse.query]);

  return (
    <>
      <Group>
        {houses.length ? (
          <Group gap={8} mt={6}>
            {houses.map(house => (
              <button key={uuidv4()} onClick={() => onSelectHouse(house)} className={classes.row}>
                <Group row gap={8}>
                  <img
                    className={classes.img}
                    src={house.metadata?.imageURI ? buildImageURL(house.metadata.imageURI) : ''}
                    alt={house.metadata?.name ?? ''}
                  />
                  <Group classNames={classes.textContainer} gap={2}>
                    <Text type="subtitle" classNames={classes.houseName}>
                      {house.metadata?.name ?? 'Untitled House'} • {house.roundCount} round
                      {house.roundCount === 1 ? '' : 's'}
                    </Text>
                    <Text type="body" classNames={classes.houseInfo}>
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
                        {sanitizeHtml(house.metadata.description as any, {
                          allowedAttributes: {
                            a: ['href', 'target'],
                          },
                        })}
                      </Markdown>
                    </Text>
                  </Group>
                </Group>

                <ArrowIcon className={classes.icon} />
              </button>
            ))}
            <Group>
              <span className={classes.message}>
                Not seeing a house? You need to have a{' '}
                <a href="https://prop.house/" target="_blank" rel="noopener noreferrer">
                  creator pass
                </a>{' '}
                or{' '}
                <a href="https://prop.house/" target="_blank" rel="noopener noreferrer">
                  house owner nft
                </a>
                .
              </span>

              <Divider />
            </Group>
          </Group>
        ) : (
          <></>
        )}

        <button onClick={handleCreateNewHouse} className={clsx(classes.row, classes.createNew)}>
          <Group row gap={8}>
            <img className={classes.img} src="/manager/addNew.png" alt="Create a new house" />
            <Text type="subtitle">Create a new house</Text>
          </Group>

          <ArrowIcon className={classes.icon} />
        </button>
      </Group>
    </>
  );
};

export default HouseSelection;
