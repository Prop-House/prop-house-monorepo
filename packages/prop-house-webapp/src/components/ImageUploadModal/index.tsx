import React, { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import Button, { ButtonColor } from '../Button';
import { useEthers } from '@usedapp/core';
import { useAppSelector } from '../../hooks';
import { PropHouseWrapper } from '@nouns/prop-house-wrapper';
import { NounImage } from '../../utils/getNounImage';
import { useTranslation } from 'react-i18next';
import DragDropFileInput from '../DragDropFileInput';
import buildIpfsPath from '../../utils/buildIpfsPath';

const ImageUploadModal: React.FC<{
  files: File[];
  setFiles: Dispatch<SetStateAction<File[]>>;
  onFileDrop: any;
  quill: any;
  Quill: any;
  invalidFileError: boolean;
  setInvalidFileError: Dispatch<SetStateAction<boolean>>;
  invalidFileMessage: string;
  setInvalidFileMessage: Dispatch<SetStateAction<string>>;
  duplicateFile: { error: boolean; name: string };
  setDuplicateFile: Dispatch<SetStateAction<{ error: boolean; name: string }>>;
  setShowImageUploadModal: Dispatch<SetStateAction<boolean>>;
}> = props => {
  const {
    files,
    setFiles,
    onFileDrop,
    quill,
    Quill,
    invalidFileError,
    setInvalidFileError,
    invalidFileMessage,
    setInvalidFileMessage,
    duplicateFile,
    setDuplicateFile,
    setShowImageUploadModal,
  } = props;
  const { t } = useTranslation();

  const [successfulUpload, setSuccessfulUpload] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const { library } = useEthers();
  const host = useAppSelector(state => state.configuration.backendHost);
  const client = useRef(new PropHouseWrapper(host));

  useEffect(() => {
    client.current = new PropHouseWrapper(host, library?.getSigner());
  }, [library, host]);
  const signerless = new PropHouseWrapper('https://prod.backend.prop.house');

  const handleImageUpload = async () => {
    if (!quill) return;
    setLoading(true);
    setUploadError(false);
    setInvalidFileMessage('');

    try {
      setSuccessfulUpload(false);

      const res = await Promise.all(
        files.map(async (file: File) => {
          return await signerless.postFile(file, file.name);
        }),
      );

      res.map((r, i) => {
        quill.setSelection(quill.getLength(), 0);
        quill.insertEmbed(
          quill.getSelection()!.index,
          'image',
          buildIpfsPath(r.data.ipfsHash),
          Quill.sources.USER,
        );

        return null;
      });
      setSuccessfulUpload(true);
    } catch (e) {
      setUploadError(true);
      console.log(e);
    }
    setLoading(false);
  };

  const fileRemove = (file: File) => {
    setInvalidFileError(false);

    const updatedList = [...files];

    // remove the file from the list
    updatedList.splice(files.indexOf(file), 1);
    setFiles(updatedList);
    setDuplicateFile({ error: false, name: '' });
  };

  // image upload state reset
  const resetImageUploadModal = () => {
    setSuccessfulUpload(false);
    setUploadError(false);
    setFiles([]);
    setInvalidFileMessage('');
    setInvalidFileError(false);
    setDuplicateFile({ error: false, name: '' });
  };
  // when you click outside the modal, reset state & close modal
  const handleDismiss = () => {
    resetImageUploadModal();
    setShowImageUploadModal(false);
  };
  // reset state but keep modal open to upload more
  const handleUploadMore = () => {
    resetImageUploadModal();
    setShowImageUploadModal(true);
  };

  return (
    <Modal
      title={
        uploadError
          ? t('errorUploading')
          : loading
          ? t('uploading')
          : successfulUpload
          ? t('uploadSuccessful')
          : files.length > 0
          ? t('readyToUpload')
          : t('uploadFiles')
      }
      subtitle={
        uploadError
          ? `Your ${files.length === 1 ? 'file' : 'files'} could not be uploaded. Please try again.`
          : loading
          ? t('pleaseWaitWhileYourFilesAreUploaded')
          : successfulUpload
          ? `You have uploaded ${files.length}  ${files.length === 1 ? 'file' : 'files'}!`
          : t('imageFileFormats')
      }
      image={
        uploadError ? NounImage.Cone : loading ? null : successfulUpload ? NounImage.Camera : null
      }
      loading={loading}
      setShowModal={setShowImageUploadModal}
      onRequestClose={handleDismiss}
      body={
        uploadError ? null : loading ? null : successfulUpload ? null : (
          <DragDropFileInput
            files={files}
            onFileDrop={onFileDrop}
            fileRemove={fileRemove}
            duplicateFile={duplicateFile}
            invalidFileMessage={invalidFileMessage}
            invalidFileError={invalidFileError}
          />
        )
      }
      button={
        <Button
          text={t('close')}
          disabled={loading}
          bgColor={ButtonColor.White}
          onClick={handleDismiss}
        />
      }
      secondButton={
        uploadError ? (
          <Button
            text={t('retry')}
            disabled={loading}
            bgColor={ButtonColor.Purple}
            onClick={handleImageUpload}
          />
        ) : successfulUpload ? (
          <Button
            disabled={loading || files.length === 0}
            text={t('uploadMore')}
            bgColor={ButtonColor.Green}
            onClick={handleUploadMore}
          />
        ) : (
          <Button
            disabled={loading || files.length === 0}
            text={t('upload')}
            bgColor={ButtonColor.Green}
            onClick={handleImageUpload}
          />
        )
      }
    />
  );
};

export default ImageUploadModal;
