import { useCallback, useEffect, useRef, useState } from 'react';
import classes from './ProposalModal.module.css';
import clsx from 'clsx';
import Modal from 'react-modal';
import { useParams } from 'react-router';
import { useLocation, useNavigate } from 'react-router-dom';
import { PropHouseWrapper } from '@nouns/prop-house-wrapper';
import { useEthers } from '@usedapp/core';
import { useDispatch } from 'react-redux';
import {
  Direction,
  SignatureState,
  StoredProposalWithVotes,
  Vote,
} from '@nouns/prop-house-wrapper/dist/builders';
import { useAppSelector } from '../../hooks';
import { buildRoundPath } from '../../utils/buildRoundPath';
import {
  setActiveCommunity,
  setActiveProposal,
  setActiveProposals,
  setActiveRound,
  setModalActive,
} from '../../state/slices/propHouse';
import { dispatchSortProposals, SortType } from '../../utils/sortingProposals';
import LoadingIndicator from '../LoadingIndicator';
import NotFound from '../NotFound';
import ProposalHeaderAndBody from '../ProposalHeaderAndBody';
import ProposalModalFooter from '../ProposalModalFooter';
import ErrorModal from '../ErrorModal';
import VoteConfirmationModal from '../VoteConfirmationModal';
import SuccessModal from '../SuccessModal';
import refreshActiveProposal, { refreshActiveProposals } from '../../utils/refreshActiveProposal';
import { clearVoteAllotments } from '../../state/slices/voting';
import isWinner from '../../utils/isWinner';
import getWinningIds from '../../utils/getWinningIds';
import { AuctionStatus, auctionStatus } from '../../utils/auctionStatus';
import VoteAllotmentModal from '../VoteAllotmentModal';

const ProposalModal = () => {
  const [showProposalModal, setShowProposalModal] = useState(true);

  const params = useParams();
  const { id } = params;
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { account, library: provider } = useEthers();

  const dispatch = useDispatch();
  const community = useAppSelector(state => state.propHouse.activeCommunity);
  const round = useAppSelector(state => state.propHouse.activeRound);
  const activeProposal = useAppSelector(state => state.propHouse.activeProposal);
  const proposals = useAppSelector(state => state.propHouse.activeProposals);
  const voteAllotments = useAppSelector(state => state.voting.voteAllotments);

  const backendHost = useAppSelector(state => state.configuration.backendHost);
  const backendClient = useRef(new PropHouseWrapper(backendHost, provider?.getSigner()));

  const [failedFetch, setFailedFetch] = useState(false);
  const [currentPropIndex, setCurrentPropIndex] = useState<number | undefined>();

  const [signerIsContract, setSignerIsContract] = useState(false);
  const [showVoteConfirmationModal, setShowVoteConfirmationModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showVoteAllotmentModal, setShowVoteAllotmentModal] = useState(false);
  const [numPropsVotedFor, setNumPropsVotedFor] = useState(0);

  const [errorModalMessage, setErrorModalMessage] = useState({
    title: '',
    message: '',
    image: '',
  });
  const [hideScrollButton, setHideScrollButton] = useState(false);

  const isRoundOver = round && auctionStatus(round) === AuctionStatus.AuctionEnded;
  const isVotingWindow = round && auctionStatus(round) === AuctionStatus.AuctionVoting;
  const winningIds = round && getWinningIds(proposals, round);

  const handleClosePropModal = () => {
    if (!community || !round) return;
    setShowProposalModal(false);
    navigate(buildRoundPath(community, round), { replace: false });
  };

  // provider
  useEffect(() => {
    backendClient.current = new PropHouseWrapper(backendHost, provider?.getSigner());
  }, [provider, backendHost]);

  useEffect(() => {
    if (activeProposal) document.title = `${activeProposal.title}`;
    dispatch(setModalActive(true));

    return () => {
      document.title = `Prop House`;
      dispatch(setModalActive(false));
    };
  }, [activeProposal, dispatch]);

  useEffect(() => {
    if (!proposals) return;

    const index = proposals.findIndex((p: StoredProposalWithVotes) => p.id === Number(id));
    setCurrentPropIndex(index + 1);
    dispatch(setActiveProposal(proposals[index]));
  }, [proposals, id, dispatch]);

  // when prop modal is entry point to app, all state needs to be fetched
  useEffect(() => {
    if (activeProposal) return; // active prop in store already
    if (!id) return; // id in url param not found

    const fetchAll = async () => {
      try {
        const proposal = await backendClient.current.getProposal(Number(id));
        const proposals = await backendClient.current.getAuctionProposals(proposal.auctionId);
        const round = await backendClient.current.getAuction(proposal.auctionId);
        const community = await backendClient.current.getCommunityWithId(round.community);

        dispatch(setActiveProposal(proposal));
        dispatch(setActiveProposals(proposals));
        dispatch(setActiveCommunity(community));
        dispatch(setActiveRound(round));

        isVotingWindow || isRoundOver
          ? dispatchSortProposals(dispatch, SortType.VoteCount, false)
          : dispatchSortProposals(dispatch, SortType.CreatedAt, false);
      } catch {
        setFailedFetch(true);
      }
    };

    fetchAll();
  }, [id, dispatch, failedFetch, activeProposal, isVotingWindow, isRoundOver]);

  // calculate if modal content is scrollable in order to show 'More' button
  const modal = document.querySelector('#propModal');

  const handleScroll = useCallback(event => {
    setHideScrollButton(true);
  }, []);

  useEffect(() => {
    if (modal) {
      if (modal.scrollTop !== 0 && !hideScrollButton) setHideScrollButton(true);

      modal.addEventListener('scroll', handleScroll, false);
    }
  }, [handleScroll, hideScrollButton, modal]);

  const handleKeyPress = useCallback(event => {
    if (event.key === 'ArrowDown') {
      setHideScrollButton(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  const handleDirectionalArrowClick = (direction: Direction) => {
    if (!activeProposal || !proposals || proposals.length === 0) return;

    const newPropIndex =
      proposals.findIndex((p: StoredProposalWithVotes) => p.id === activeProposal.id) + direction;
    dispatch(setActiveProposal(proposals[newPropIndex]));
    navigate(`${pathname.replace(/[^/]*$/, proposals[newPropIndex].id.toString())}`);
  };

  const _signerIsContract = async () => {
    if (!provider || !account) {
      return false;
    }
    const code = await provider?.getCode(account);
    const isContract = code !== '0x';
    setSignerIsContract(isContract);
    return isContract;
  };

  const handleSubmitVote = async () => {
    if (!provider || !activeProposal) return;

    try {
      const blockHeight = await provider.getBlockNumber();

      const votes = voteAllotments
        .map(
          a =>
            new Vote(
              1,
              a.proposalId,
              a.votes,
              community!.contractAddress,
              SignatureState.PENDING_VALIDATION,
              blockHeight,
            ),
        )
        .filter(v => v.weight > 0);
      const isContract = await _signerIsContract();

      await backendClient.current.logVotes(votes, isContract);

      setNumPropsVotedFor(voteAllotments.length);
      setShowSuccessModal(true);
      refreshActiveProposals(backendClient.current, round!.id, dispatch);
      refreshActiveProposal(backendClient.current, activeProposal, dispatch);
      dispatch(clearVoteAllotments());
      setShowVoteConfirmationModal(false);
    } catch (e) {
      setErrorModalMessage({
        title: 'Failed to submit votes',
        message: 'Please go back and try again.',
        image: 'banana.png',
      });
      setShowErrorModal(true);
    }
  };

  return (
    <>
      {showVoteConfirmationModal && round && (
        <VoteConfirmationModal
          showNewModal={showVoteConfirmationModal}
          setShowNewModal={setShowVoteConfirmationModal}
          submitVote={handleSubmitVote}
          secondBtn
        />
      )}

      {showSuccessModal && (
        <SuccessModal
          showSuccessModal={showSuccessModal}
          setShowSuccessModal={setShowSuccessModal}
          numPropsVotedFor={numPropsVotedFor}
          signerIsContract={signerIsContract}
        />
      )}

      {showErrorModal && (
        <ErrorModal
          showErrorModal={showErrorModal}
          setShowErrorModal={setShowErrorModal}
          title={errorModalMessage.title}
          message={errorModalMessage.message}
          image={errorModalMessage.image}
        />
      )}

      {showVoteAllotmentModal && (
        <VoteAllotmentModal
          showModal={showVoteAllotmentModal}
          setShowModal={setShowVoteAllotmentModal}
        />
      )}

      <Modal
        isOpen={showProposalModal}
        onRequestClose={() => handleClosePropModal()}
        className={clsx(classes.modal, 'proposalModalContainer')}
        id="propModal"
      >
        {activeProposal && proposals && proposals.length > 0 && currentPropIndex ? (
          <>
            <ProposalHeaderAndBody
              currentProposal={activeProposal}
              currentPropIndex={currentPropIndex}
              handleDirectionalArrowClick={handleDirectionalArrowClick}
              handleClosePropModal={handleClosePropModal}
              hideScrollButton={hideScrollButton}
              setHideScrollButton={setHideScrollButton}
              showVoteAllotmentModal={showVoteAllotmentModal}
            />

            <ProposalModalFooter
              setShowVotingModal={setShowVoteConfirmationModal}
              showVoteAllotmentModal={showVoteAllotmentModal}
              setShowVoteAllotmentModal={setShowVoteAllotmentModal}
              propIndex={currentPropIndex}
              numberOfProps={proposals.length}
              handleDirectionalArrowClick={handleDirectionalArrowClick}
              isWinner={winningIds && isWinner(winningIds, activeProposal.id)}
            />
          </>
        ) : failedFetch ? (
          <NotFound />
        ) : (
          <LoadingIndicator />
        )}
      </Modal>
    </>
  );
};

export default ProposalModal;
