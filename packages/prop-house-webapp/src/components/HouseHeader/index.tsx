import classes from './HouseHeader.module.css';
import trimEthAddress from '../../utils/trimEthAddress';
import { Community } from '@nouns/prop-house-wrapper/dist/builders';
import { useState } from 'react';
import CommunityProfImg from '../CommunityProfImg';
import clsx from 'clsx';
import Tooltip from '../Tooltip';
// import { useTranslation } from 'react-i18next';
import sanitizeHtml from 'sanitize-html';
import Markdown from 'markdown-to-jsx';
import { isMobile } from 'web3modal';

const isLongName = (name: string) => name.length > 9;

interface OpenInNewTabProps {
  children: React.ReactNode;
}

// overrides an <a> tag that doesn't have target="_blank" and adds it
const OpenInNewTab = ({ children, ...props }: OpenInNewTabProps) => <a {...props}>{children}</a>;

const HouseHeader: React.FC<{
  community: Community;
}> = props => {
  const { community } = props;

  const [addressTooltipCopy, setAddressTooltipCopy] = useState('Click to copy');

  const communityDescription = (
    <div className={classes.communityDescriptionRow}>
      {/* support both markdown & html links in community's description.  */}
      <Markdown
        options={{
          overrides: {
            a: {
              component: OpenInNewTab,
              props: {
                target: '_blank',
                rel: 'noreferrer',
              },
            },
          },
        }}
      >
        {sanitizeHtml(community.description as any, {
          allowedAttributes: {
            a: ['href', 'target'],
          },
        })}
      </Markdown>
    </div>
  );

  return (
    <div className={classes.profileHeaderRow}>
      <div className={classes.profilePicCol}>
        <CommunityProfImg community={community} />
      </div>

      <div className={classes.communityInfoCol}>
        <div className={classes.houseTitleInfo}>
          <div className={clsx(classes.titleRow, isLongName(community.name) && classes.longName)}>
            <div className={classes.title}>{community.name} House</div>
            <Tooltip
              content={
                <div
                  className={classes.contractAddressPill}
                  onMouseEnter={() => setAddressTooltipCopy('Click to copy')}
                  onClick={() => {
                    setAddressTooltipCopy('Copied!');
                    navigator.clipboard.writeText(
                      community
                        ? community.contractAddress
                        : '0x0000000000000000000000000000000000000000',
                    );
                  }}
                >
                  {trimEthAddress(
                    community
                      ? community.contractAddress
                      : '0x0000000000000000000000000000000000000000',
                  )}{' '}
                </div>
              }
              tooltipContent={addressTooltipCopy}
            />
          </div>

          <div className={classes.propHouseDataRow}>
            <div className={classes.itemData}>{community.numAuctions}</div>
            <div className={classes.itemTitle}>
              {community?.numAuctions === 1 ? 'Round' : 'Rounds'}
            </div>
            <span className={classes.bullet}>{' • '}</span>

            <div className={classes.itemData}>{community.numProposals}</div>
            <div className={classes.itemTitle}>{'Proposals'}</div>
          </div>
        </div>
        {!isMobile() && communityDescription}
      </div>
      {isMobile() && communityDescription}
    </div>
  );
};

export default HouseHeader;
