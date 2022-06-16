import classes from './Create.module.css';
import { Row, Col } from 'react-bootstrap';
import Button, { ButtonColor } from '../../Button';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import ProposalEditor from '../../ProposalEditor';
import Preview from '../Preview';
import { clearProposal, patchProposal } from '../../../state/slices/editor';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import {
  Proposal,
  StoredAuction,
} from '@nouns/prop-house-wrapper/dist/builders';
import { appendProposal } from '../../../state/slices/propHouse';
import { useEthers } from '@usedapp/core';
import { PropHouseWrapper } from '@nouns/prop-house-wrapper';
import isAuctionActive from '../../../utils/isAuctionActive';
import { ProposalFields } from '../../../utils/proposalFields';
import InspirationCard from '../../InspirationCard';
import useWeb3Modal from '../../../hooks/useWeb3Modal';
import Modal from '../../Modal';
import Card, { CardBgColor, CardBorderRadius } from '../../Card';

const isValidPropData = (data: ProposalFields) => {
  return (
    data.title.length > 5 &&
    data.what.length > 50 &&
    data.tldr.length > 10 &&
    data.tldr.length < 120
  );
};

const Create: React.FC<{}> = () => {
  const { library: provider, account } = useEthers();

  const [parentAuction, setParentAuction] = useState<undefined | StoredAuction>(
    undefined
  );
  const [currentAuction, setCurrentAuction] = useState<
    undefined | CommunityWithAuctions
  >(undefined);
  const [showPreview, setShowPreview] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const proposalEditorData = useAppSelector((state) => state.editor.proposal);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const connect = useWeb3Modal();

  const backendHost = useAppSelector(
    (state) => state.configuration.backendHost
  );
  const auctions = useAppSelector((state) => state.propHouse.auctions);
  const activeCommunity = useAppSelector(
    (state) => state.propHouse.activeCommunity
  );
  const activeAuction = useAppSelector(
    (state) => state.propHouse.activeAuction
  );

  const backendClient = useRef(
    new PropHouseWrapper(backendHost, provider?.getSigner())
  );

  useEffect(() => {
    if (parentAuction !== undefined) return;
    const openAuctions = auctions.filter(isAuctionActive);
    // Set to the first open Auction
    if (openAuctions.length > 0) setParentAuction(openAuctions[0]);
    activeCommunity && setCurrentAuction(activeCommunity);
  }, [activeCommunity, auctions, parentAuction]);

  useEffect(() => {
    backendClient.current = new PropHouseWrapper(
      backendHost,
      provider?.getSigner()
    );
  }, [provider, backendHost]);

  const onDataChange = (data: Partial<ProposalFields>) => {
    dispatch(patchProposal(data));
  };

  const submitProposal = async () => {
    if (!parentAuction) return;

    const proposal = await backendClient.current.createProposal(
      new Proposal(
        proposalEditorData.title,
        proposalEditorData.who,
        proposalEditorData.what,
        proposalEditorData.tldr,
        proposalEditorData.links,
        parentAuction.id
      )
    );
    dispatch(appendProposal({ proposal, auctionId: parentAuction.id }));
    dispatch(clearProposal());
    setShowModal(true);
  };

  const successfulSubmissionModalContent = {
    title: "Congrats!",
    content: (
      <>
        <p>{`You've successfully submitted your proposal for \n ${
          currentAuction && currentAuction.name
        } ${`(${activeAuction && activeAuction.title})`}`}</p>
        <Button
          text="View house"
          bgColor={ButtonColor.White}
          onClick={() =>
            navigate(`/${currentAuction && currentAuction.contractAddress}`)
          }
        />
      </>
    ),
    onDismiss: () =>
      navigate(`/${currentAuction && currentAuction.contractAddress}`),
  };

  return parentAuction ? (
    <>
      {showModal && <Modal data={successfulSubmissionModalContent} />}

      <InspirationCard />
      <Row>
        <Col xl={12} className={classes.proposalHelperWrapper}>
          <h1 className={classes.proposalHelper}>
            Creating proposal for{' '}
            <span>
              funding round{' '}
              {`${parentAuction.id} (${parentAuction.amountEth} ETH)`}{' '}
            </span>
          </h1>
        </Col>
      </Row>

      <Row>
        <Card
          bgColor={CardBgColor.LightPurple}
          borderRadius={CardBorderRadius.twenty}
          classNames={classes.tipCard}
        >
          <b>Tip:</b> Use markdown to style your proposal properly!{' '}
          <a
            href="https://www.markdownguide.org/basic-syntax/"
            target="_blank"
            rel="noreferrer"
          >
            Explore the syntax →
          </a>
        </Card>
        <Col xl={12}>
          {showPreview ? (
            <Preview />
          ) : (
            <ProposalEditor onDataChange={onDataChange} />
          )}
        </Col>
      </Row>

      <Row>
        <Col xl={12} className={classes.btnContainer}>
          <Button
            text={showPreview ? 'Back to editor' : 'Preview'}
            bgColor={ButtonColor.Pink}
            onClick={() =>
              setShowPreview((prev) => {
                return !prev;
              })
            }
            disabled={!isValidPropData(proposalEditorData)}
          />

          {showPreview &&
            (account ? (
              <Button
                classNames={classes.actionBtn}
                text="Sign and Submit"
                bgColor={ButtonColor.Pink}
                onClick={submitProposal}
                disabled={!isValidPropData(proposalEditorData)}
              />
            ) : (
              <Button
                classNames={classes.actionBtn}
                bgColor={ButtonColor.Pink}
                text="Connect Wallet To Submit"
                onClick={connect}
              />
            ))}
        </Col>
      </Row>
    </>
  ) : (
    <>Loading...</>
  );
};

export default Create;
