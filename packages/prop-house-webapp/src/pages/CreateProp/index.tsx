import classes from './CreateProp.module.css';
import { Row, Col, Container } from 'react-bootstrap';
import Button, { ButtonColor } from '../../components/Button';
import { useState, useRef } from 'react';
import ProposalEditor from '../../components/ProposalEditor';
import { clearProposal, patchProposal } from '../../state/slices/editor';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { setOnChainActiveProposals } from '../../state/slices/propHouse';
import { PropHouseWrapper } from '@nouns/prop-house-wrapper';
import { ProposalFields } from '../../utils/proposalFields';
import { useTranslation } from 'react-i18next';
import DragAndDrop from '../../components/DragAndDrop';
import getDuplicateFileMessage from '../../utils/getDuplicateFileMessage';
import validFileType from '../../utils/validFileType';
import getInvalidFileTypeMessage from '../../utils/getInvalidFileTypeMessage';
import changeFileExtension from '../../utils/changeFileExtension';
import LoadingIndicator from '../../components/LoadingIndicator';
import ProposalSuccessModal from '../../components/ProposalSuccessModal';
import { isValidPropData } from '../../utils/isValidPropData';
import ConnectButton from '../../components/ConnectButton';
import { useAccount } from 'wagmi';
import { RoundType, Timed, usePropHouse } from '@prophouse/sdk-react';
import { NounImage } from '../../utils/getNounImage';
import Modal from '../../components/Modal';
import { useLocation } from 'react-router-dom';

const CreateProp: React.FC<{}> = () => {
  const { address: account } = useAccount();
  const { state } = useLocation();
  const { t } = useTranslation();

  // TODO: fix
  // const remainingBal = infRoundBalance(activeProps, activeAuction);
  const remainingBal = 10;

  const round = useAppSelector(state => state.propHouse.activeRound);
  const house = useAppSelector(state => state.propHouse.activeHouse);

  const [showProposalSuccessModal, setShowProposalSuccessModal] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [propSubmissionTxId, setPropSubmissionTxId] = useState<null | string>(null);

  const proposalEditorData = useAppSelector(state => state.editor.proposal);
  const dispatch = useAppDispatch();
  const host = useAppSelector(state => state.configuration.backendHost);
  const client = useRef(new PropHouseWrapper(host));
  const propHouse = usePropHouse();

  const onDataChange = (data: Partial<ProposalFields>) => {
    dispatch(patchProposal(data));
  };

  const submitProposal = async () => {
    if (!round || round.state !== Timed.RoundState.IN_PROPOSING_PERIOD) return;

    const { title, what, tldr } = proposalEditorData;

    try {
      setShowLoadingModal(true);
      const json = JSON.stringify({ title, what, tldr }, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], 'proposal.json', { type: 'application/json' });

      const result = await client.current.postFile(file, file.name);

      const propResult = await propHouse.round.timed.proposeViaSignature({
        round: round.address,
        metadataUri: `ipfs://${result.data.ipfsHash}`,
      });

      // todo: use propResult instead of `newProp` below when SDK returns new proposal
      const newProp = {
        id: 0,
        proposer: account as string,
        round: round.address,
        metadataURI: `ipfs://${result.data.ipfsHash}`,
        title: title,
        body: what,
        isCancelled: false,
        isWinner: false,
        receivedAt: new Date().getTime() / 1000,
        txHash: propResult.transaction_hash,
        votingPower: '0',
        tldr,
      };
      setShowLoadingModal(false);

      setPropSubmissionTxId(propResult.transaction_hash);
      dispatch(setOnChainActiveProposals([...state.proposals, newProp]));
      dispatch(clearProposal());
      setShowProposalSuccessModal(true);
    } catch (e) {
      setShowLoadingModal(false);
      setShowProposalSuccessModal(false);
      setShowErrorModal(true);
      console.log(`Error submitting proposal: `, e);
    }
  };

  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [invalidFileError, setInvalidFileError] = useState(false);
  const [invalidFileMessage, setInvalidFileMessage] = useState('');
  const [duplicateFile, setDuplicateFile] = useState<{ error: boolean; name: string }>({
    error: false,
    name: '',
  });

  // Drag and drop images in the editor or the upload image modal
  const onFileDrop = (
    event: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>,
  ) => {
    setInvalidFileError(false);
    setDuplicateFile({ error: false, name: '' });

    let selectedFiles: File[] = [];

    // check if the event is a drag event or a file input event:
    if ('dataTransfer' in event) {
      // default behavior is to open file in new browser tab, so we prevent that
      event.preventDefault();

      // event.dataTransfer: images were dragged directly on editor
      selectedFiles = Array.from(event.dataTransfer.files || []);
      setShowImageUploadModal(true);

      // clear the input value so that the same file can be uploaded again
      // only if the file is not already in the queue
      event.dataTransfer.clearData();
    } else if ('target' in event) {
      // event.target: images were dragged or uploaded via the input in the modal
      selectedFiles = Array.from(event.target.files || []);

      // clear the input value so that the same file can be uploaded again
      // only if the file is not already in the queue
      event.target.value = '';
    }

    // store the invalid file types and duplicate file names
    const invalidFileTypes: string[] = [];
    const duplicateFileNames: string[] = [];

    // check if any of the files are invalid
    if (Array.from(selectedFiles).some(file => !validFileType(file))) {
      setInvalidFileError(true);

      // get the invalid file types
      Array.from(selectedFiles).map((file, i) => {
        if (!validFileType(file)) {
          let fileExtension = file.type.split('/')[1];

          // save the invalid file type to show in error message
          invalidFileTypes.push(changeFileExtension(fileExtension));
        }
        return selectedFiles;
      });

      // generate invalid file type error message:
      //   • Array.from(new Set(invalidFileTypes)) remove duplicate file types before generating error message
      //   • getInvalidFileTypeMessage() is a function that generates the error message
      //   • setInvalidFileMessage saves the error message to state
      setInvalidFileMessage(getInvalidFileTypeMessage(Array.from(new Set(invalidFileTypes))));
    }

    // check if any of the files are duplicates
    selectedFiles.forEach(file => {
      // check if the file name is already in the list of files, if it is, add it to the list of duplicate file names
      if (files.find(f => f.name === file.name)) duplicateFileNames.push(file.name);
    });

    // generate duplicate file error message if there are any:
    //   • Array.from(new Set(duplicateFileNames)) remove duplicate file names before generating error message
    //   • getDuplicateFileMessage() is a function that generates the error message
    //   • setDuplicateFile saves the error message to state
    duplicateFileNames.length > 0 &&
      setDuplicateFile({
        error: true,
        name: getDuplicateFileMessage(Array.from(new Set(duplicateFileNames))),
      });

    // filter out invalid  & duplicate files
    const validFiles = Array.from(selectedFiles)
      // filter out invalid files extensions
      .filter(
        file =>
          validFileType(file) &&
          // filter out duplicates
          !files.find(f => f.name === file.name),
      );

    // add the valid files to the list
    if (validFiles) {
      const updatedList = [...files, ...validFiles];
      setFiles(updatedList);
    }
  };

  return (
    <>
      {round && house ? (
        <>
          <DragAndDrop
            onFileDrop={onFileDrop}
            showImageUploadModal={showImageUploadModal}
            setShowImageUploadModal={setShowImageUploadModal}
          >
            {showErrorModal && (
              <Modal
                modalProps={{
                  title: 'Error',
                  subtitle: 'Error submitting your proposal. Please try again.',
                  image: NounImage.Banana,
                  setShowModal: setShowErrorModal,
                }}
              />
            )}

            {showLoadingModal && (
              <Modal
                modalProps={{
                  title: 'Loading',
                  subtitle: 'Sending your prop through the Ether...',
                  body: <LoadingIndicator />,
                  setShowModal: setShowLoadingModal,
                }}
              />
            )}

            {showProposalSuccessModal && propSubmissionTxId && (
              <ProposalSuccessModal
                setShowProposalSuccessModal={setShowProposalSuccessModal}
                house={house}
                round={round}
              />
            )}

            <Container>
              <Row>
                <h1 className={classes.proposalTitle}>
                  Creating a proposal for <span>{round.title}</span> for <span>{house.name}</span>
                </h1>
              </Row>
              <Row>
                <Col xl={12}>
                  <ProposalEditor
                    onDataChange={onDataChange}
                    showImageUploadModal={showImageUploadModal}
                    setShowImageUploadModal={setShowImageUploadModal}
                    files={files}
                    setFiles={setFiles}
                    onFileDrop={onFileDrop}
                    invalidFileError={invalidFileError}
                    setInvalidFileError={setInvalidFileError}
                    invalidFileMessage={invalidFileMessage}
                    setInvalidFileMessage={setInvalidFileMessage}
                    duplicateFile={duplicateFile}
                    setDuplicateFile={setDuplicateFile}
                    remainingBal={remainingBal}
                    isInfRound={round.type !== RoundType.TIMED}
                  />
                </Col>
              </Row>
              <Row>
                <Col xl={12} className={classes.btnContainer}>
                  {account ? (
                    <Button
                      text={'Submit'}
                      bgColor={ButtonColor.Pink}
                      onClick={submitProposal}
                      disabled={
                        !isValidPropData(round.type !== RoundType.TIMED, proposalEditorData)
                      }
                    />
                  ) : (
                    <ConnectButton color={ButtonColor.Pink} text={t('connectWallet')} />
                  )}
                </Col>
              </Row>
            </Container>
          </DragAndDrop>
        </>
      ) : (
        <LoadingIndicator />
      )}
    </>
  );
};

export default CreateProp;
