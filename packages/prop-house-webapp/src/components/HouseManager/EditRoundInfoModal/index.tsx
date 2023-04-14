import React, { Dispatch, SetStateAction, useState } from 'react';
import Button, { ButtonColor } from '../../Button';
import Modal from '../../Modal';
import { NewRound } from '../../../state/slices/round';
import { useAppSelector } from '../../../hooks';
import { useDispatch } from 'react-redux';
import RoundFields from '../RoundFields';
import { saveRound } from '../../../state/thunks';

const EditRoundInfoModal: React.FC<{
  setShowEditRoundInfoModal: Dispatch<SetStateAction<boolean>>;
}> = props => {
  const { setShowEditRoundInfoModal } = props;
  const dispatch = useDispatch();
  const round = useAppSelector(state => state.round.round);
  const [editedRound, setEditedRound] = useState<NewRound>(round);

  const handleSave = () => {
    dispatch(
      saveRound({
        ...editedRound,
        title: editedRound.title,
        description: editedRound.description,
      }),
    );
    setShowEditRoundInfoModal(false);
  };

  const handleCancel = () => {
    setEditedRound(round);
    setShowEditRoundInfoModal(false);
  };

  const isDisabled = () => {
    return !(
      5 <= editedRound.title.length &&
      editedRound.title.length <= 255 &&
      20 <= editedRound.description.length
    );
  };

  return (
    <Modal
      title="Edit round name and description"
      subtitle=""
      body={<RoundFields editMode round={editedRound} setEditedRound={setEditedRound} />}
      setShowModal={setShowEditRoundInfoModal}
      button={<Button text={'Cancel'} bgColor={ButtonColor.Black} onClick={handleCancel} />}
      secondButton={
        <Button
          text={'Save Changes'}
          bgColor={ButtonColor.Pink}
          onClick={handleSave}
          disabled={isDisabled()}
        />
      }
    />
  );
};

export default EditRoundInfoModal;
