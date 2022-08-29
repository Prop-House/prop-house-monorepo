import classes from './FullAuction.module.css';
import Card, { CardBgColor, CardBorderRadius } from '../Card';
import AuctionHeader from '../AuctionHeader';
import ProposalCards from '../ProposalCards';
import { Row } from 'react-bootstrap';
import { StoredAuction, Vote } from '@nouns/prop-house-wrapper/dist/builders';
import { auctionStatus, AuctionStatus } from '../../utils/auctionStatus';
import { useEthers } from '@usedapp/core';
import { useEffect, useState, useRef } from 'react';
import useWeb3Modal from '../../hooks/useWeb3Modal';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '../../hooks';
import { VoteAllotment, updateVoteAllotment } from '../../utils/voteAllotment';
import { PropHouseWrapper } from '@nouns/prop-house-wrapper';
import { refreshActiveProposals } from '../../utils/refreshActiveProposal';
import Modal, { ModalData } from '../Modal';
import { aggVoteWeightForProps } from '../../utils/aggVoteWeight';
import { setDelegatedVotes, setActiveProposals } from '../../state/slices/propHouse';
import { dispatchSortProposals, SortType } from '../../utils/sortingProposals';
import {
  AuctionEmptyContent,
  AuctionNotStartedContent,
  ConnectedCopy,
  DisconnectedCopy,
} from './content';

import { getNumVotes } from 'prop-house-communities';
import SortToggles from '../SortToggles';
import { useTranslation } from 'react-i18next';

const FullAuction: React.FC<{
  auction: StoredAuction;
  isFirstOrLastAuction: () => [boolean, boolean];
  handleAuctionChange: (next: boolean) => void;
}> = props => {
  const { auction, isFirstOrLastAuction, handleAuctionChange } = props;

  const { account, library } = useEthers();
  const [voteAllotments, setVoteAllotments] = useState<VoteAllotment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData>();

  const connect = useWeb3Modal();
  const dispatch = useDispatch();
  const community = useAppSelector((state) => state.propHouse.activeCommunity);
  const proposals = useAppSelector((state) => state.propHouse.activeProposals);
  const delegatedVotes = useAppSelector(
    (state) => state.propHouse.delegatedVotes
  );
  const host = useAppSelector((state) => state.configuration.backendHost);
  const client = useRef(new PropHouseWrapper(host));
  const { t } = useTranslation();

  const auctionNotStartedContent = AuctionNotStartedContent();
  const auctionEmptyContent = AuctionEmptyContent();
  const disconnectedCopy = DisconnectedCopy(connect);
  const connectedCopy = ConnectedCopy();

  // aggregate vote weight of already stored votes
  const userVotesWeight = () => {
    if (!account || !proposals) return 0;
    return aggVoteWeightForProps(proposals, account);
  };

  // total votes allotted (these are pre-submitted votes)
  const numAllottedVotes = voteAllotments.reduce(
    (counter, allotment) => Number(counter) + Number(allotment.votes),
    0,
  );

  // check vote allotment against vote user is allowed to use
  const canAllotVotes = () => {
    if (!delegatedVotes) return false;
    return numAllottedVotes < delegatedVotes - userVotesWeight();
  };

  useEffect(() => {
    client.current = new PropHouseWrapper(host, library?.getSigner());
  }, [library, host]);

  // fetch votes/delegated votes allowed for user to use
  useEffect(() => {
    if (!account || !library || !community) return;

    const fetchVotes = async () => {
      try {
        const votes = await getNumVotes(
          account,
          community.contractAddress,
          library,
          auction.balanceBlockTag?.toString(),
        );
        dispatch(setDelegatedVotes(votes));
      } catch (e) {
        console.log("error fetching votes: ", e);
      }
    };
    fetchVotes();
  }, [account, library, dispatch, community]);

  // fetch proposals
  useEffect(() => {
    const fetchAuctionProposals = async () => {
      const proposals = await client.current.getAuctionProposals(auction.id);
      dispatch(setActiveProposals(proposals));

      // default sorting method is random, unless the auction is over, in which case its by votes
      dispatchSortProposals(
        dispatch,
        auctionStatus(auction) === AuctionStatus.AuctionEnded ? SortType.Score : SortType.Random,
        false,
      );
    };
    fetchAuctionProposals();
    return () => {
      dispatch(setActiveProposals([]));
    };
  }, [auction.id, dispatch, account, auction]);

  // manage vote alloting
  const handleVoteAllotment = (proposalId: number, support: boolean) => {
    setVoteAllotments((prev) => {
      // if no votes have been allotted yet, add new
      if (prev.length === 0) return [{ proposalId, votes: 1 }];

      const preexistingVoteAllotment = prev.find(
        (allotment) => allotment.proposalId === proposalId
      );

      // if not already alloted to specific proposal,  add new allotment
      if (!preexistingVoteAllotment) return [...prev, { proposalId, votes: 1 }];

      // if already allotted to a specific proposal, add one vote to allotment
      const updated = prev.map((a) =>
        a.proposalId === preexistingVoteAllotment.proposalId
          ? updateVoteAllotment(a, support)
          : a
      );

      return updated;
    });
  };

  // handle voting
  const handleVote = async () => {
    if (!delegatedVotes || !community) return;

    const propCopy = voteAllotments
      .sort((a, b) => a.proposalId - b.proposalId)
      .filter((a) => a.votes > 0)
      .reduce(
        (agg, current) =>
          agg +
          `\n${current.votes} vote${current.votes > 1 ? "s" : ""} for prop ${
            current.proposalId
          }`,
        ""
      );

    setShowModal(true);

    try {
      setModalData({
        title: t("voting"),
        content: `${t("pleaseSign")}:\n${propCopy}`,
        onDismiss: () => setShowModal(false),
      });

      const votes = voteAllotments
        .map(
          (a) => new Vote(1, a.proposalId, a.votes, community.contractAddress)
        )
        .filter((v) => v.weight > 0);
      await client.current.logVotes(votes);

      setModalData({
        title: t("success"),
        content: `${t("successfullyVoted")}\n${propCopy}`,
        onDismiss: () => setShowModal(false),
      });

      refreshActiveProposals(client.current, auction.id, dispatch);
      setVoteAllotments([]);
    } catch (e) {
      setModalData({
        title: t("error"),
        content: `${t("failedSubmit")}\n\n${t("errorMessage")}: ${e}`,
        onDismiss: () => setShowModal(false),
      });
    }
  };

  return (
    <>
      {showModal && modalData && <Modal data={modalData} />}
      {auctionStatus(auction) === AuctionStatus.AuctionVoting &&
        ((delegatedVotes && delegatedVotes > 0) || account === undefined) && (
          <Card bgColor={CardBgColor.White} borderRadius={CardBorderRadius.twenty}>
            <div>{delegatedVotes && delegatedVotes > 0 ? connectedCopy : disconnectedCopy}</div>
          </Card>
        )}
      {community && (
        <AuctionHeader
          auction={auction}
          clickable={false}
          classNames={classes.auctionHeader}
          totalVotes={delegatedVotes}
          voteBtnEnabled={
            delegatedVotes && delegatedVotes - userVotesWeight() > 0 && numAllottedVotes > 0
              ? true
              : false
          }
          votesLeft={delegatedVotes && delegatedVotes - userVotesWeight()}
          handleVote={handleVote}
          isFirstOrLastAuction={isFirstOrLastAuction}
          handleAuctionChange={handleAuctionChange}
        />
      )}

      <Card
        bgColor={CardBgColor.LightPurple}
        borderRadius={CardBorderRadius.thirty}
        classNames={classes.customCardHeader}
      >
        <Row>
          <div className={classes.dividerSection}>
            <div className={classes.proposalTitle}>{`${
              proposals
                ? `${proposals.length} ${proposals.length === 1 ? t('proposal') : t('proposals')}`
                : ''
            }`}</div>

            {proposals && proposals.length > 1 && <SortToggles auction={auction} />}
          </div>
        </Row>

        {auctionStatus(auction) === AuctionStatus.AuctionNotStarted ? (
          auctionNotStartedContent
        ) : auction.proposals.length === 0 ? (
          auctionEmptyContent
        ) : (
          <>
            <ProposalCards
              auction={auction}
              voteAllotments={voteAllotments}
              canAllotVotes={canAllotVotes}
              handleVoteAllotment={handleVoteAllotment}
            />
          </>
        )}
      </Card>
    </>
  );
};

export default FullAuction;
