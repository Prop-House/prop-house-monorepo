import classes from './CreateRoundModal.module.css';
import React, { Dispatch, SetStateAction } from 'react';
import Modal from '../../Modal';
import { NounImage } from '../../../utils/getNounImage';
import Button, { ButtonColor } from '../../Button';
import LoadingIndicator from '../../LoadingIndicator';
import EthAddress from '../../EthAddress';
import { useAccount } from 'wagmi';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  checkStepCriteria,
  initialRound,
  setActiveStep,
  updateRound,
} from '../../../state/slices/round';

export type TransactionStatus = {
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error?: Error | null;
};

const CreateRoundModal: React.FC<{
  status: TransactionStatus;
  roundName: string;
  roundAddress: string | undefined;
  setShowCreateRoundModal: Dispatch<SetStateAction<boolean>>;
}> = props => {
  const { status, roundName, roundAddress, setShowCreateRoundModal } = props;

  const dipsatch = useDispatch();
  const { address: account } = useAccount();
  const { t } = useTranslation();
  let navigate = useNavigate();

  const titleText = status.isError ? (
    'Transaction Error'
  ) : status.isLoading ? (
    'Sending Transaction'
  ) : status.isSuccess && !roundAddress ? (
    'Confirming Round Creation'
  ) : status.isSuccess && roundAddress ? (
    <>
      {t('congrats')} {account && <EthAddress className={classes.address} address={account} />}!
    </>
  ) : (
    'Sign Transaction'
  );

  const subtitleText = status.isError ? (
    'There was a problem creating your round. Please try again.'
  ) : status.isLoading || (status.isSuccess && !roundAddress) ? (
    ''
  ) : status.isSuccess && roundAddress ? (
    <>
      Your round <b>{roundName}</b> has been successfully created.
      <br /> <b>Now deposit the award assets to get the round started.</b>
    </>
  ) : (
    <>
      Please sign the transaction to create your round.
      <br />
      <span style={{ fontStyle: 'italic', fontSize: '12px' }}>
        Note: 0.01 ETH is added in the tx to cover gas for proposers and voters.
      </span>
    </>
  );

  const image = status.isError
    ? NounImage.Hardhat
    : status.isLoading || (status.isSuccess && !roundAddress)
    ? null
    : status.isSuccess && roundAddress
    ? NounImage.Crown
    : NounImage.Pencil;

  const handleClick = () => {
    navigate(`/manage/round/${roundAddress}`);
    setShowCreateRoundModal(false);
    dipsatch(setActiveStep(1));
    dipsatch(updateRound(initialRound));
    dipsatch(checkStepCriteria());
  };

  const handleClose = () => {
    return status.isLoading
      ? undefined
      : status.isSuccess
      ? handleClick
      : setShowCreateRoundModal(false);
  };

  return (
    <Modal
      modalProps={{
        title: titleText,
        subtitle: subtitleText,
        handleClose: handleClose,
        body: (status.isSuccess && !roundAddress) || status.isLoading ? <LoadingIndicator /> : '',
        image: image,
        setShowModal: setShowCreateRoundModal,
        button: status.isSuccess && roundAddress && (
          <Button text="Deposit awards" bgColor={ButtonColor.Pink} onClick={handleClick} />
        ),
      }}
    />
  );
};

export default CreateRoundModal;
