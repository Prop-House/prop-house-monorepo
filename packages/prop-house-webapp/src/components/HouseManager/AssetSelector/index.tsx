import { FC, useState } from 'react';
import { useAppSelector } from '../../../hooks';
import { AssetType } from '@prophouse/sdk-react';
import IndividualAwards from '../IndividualAwards';
import { v4 as uuidv4 } from 'uuid';
import { NewRound } from '../../../state/slices/round';

interface EditableAssetMetadata {
  id: string;
  state: 'dummy' | 'editing' | 'valid' | 'saved' | 'error' | 'input';
  error?: string;
  allocated: number;
}
type AssetProps = {
  assetType: AssetType;
  address: string;
  tokenId: string;
  amount: string;
};

export type EditableAsset = EditableAssetMetadata & AssetProps;

export const newAward: EditableAsset = {
  id: uuidv4(),
  state: 'dummy',
  error: '',
  allocated: 0,
  assetType: AssetType.ETH,
  amount: '0',
  tokenId: '',
  address: '',
};

export enum DefaultERC20s {
  USDC = 'USDC',
  APE = 'APE',
  OTHER = 'Other',
}

export const erc20TokenAddresses: { [key in DefaultERC20s]: string } = {
  [DefaultERC20s.USDC]: '0xd35cceead182dcee0f148ebac9447da2c4d449c4',
  [DefaultERC20s.APE]: '0xA68AbBb4e36b18A16732CF6d42E826AAA27F52Fc',
  [DefaultERC20s.OTHER]: '',
};

export const erc20img = (tokenAddress: string) => {
  switch (tokenAddress) {
    case '0xd35cceead182dcee0f148ebac9447da2c4d449c4': // goerli
      return '/manager/usdc.svg';
    case '0xA68AbBb4e36b18A16732CF6d42E826AAA27F52Fc': // goerli
      return '/manager/ape.png';
    case '0xdac17f958d2ee523a2206206994597c13d831ec7': // goerli
      return '/manager/usdt.svg';
    default:
      return '/manager/token.svg';
  }
};

const AssetSelector: FC<{
  editMode?: boolean;
  editedRound?: NewRound;
  setEditedRound?: React.Dispatch<React.SetStateAction<NewRound>>;
}> = props => {
  const { editMode, editedRound, setEditedRound } = props;

  const round = useAppSelector(state => state.round.round);

  // Set the individual awards to 3 dummy awards if no awards set
  const initialIndividualAwards: EditableAsset[] = [
    { ...newAward, id: uuidv4(), state: 'dummy' },
    { ...newAward, id: uuidv4(), state: 'dummy' },
    { ...newAward, id: uuidv4(), state: 'dummy' },
  ];

  const [individualAwards, setIndividualAwards] = useState<EditableAsset[]>(
    round.awards[0] && round.awards[0].id !== newAward.id ? round.awards : initialIndividualAwards,
  );

  return (
    <IndividualAwards
      editMode={editMode}
      awards={editMode ? editedRound!.awards : individualAwards}
      setAwards={setIndividualAwards}
      setEditedRound={setEditedRound}
      editedRound={editedRound}
    />
  );
};

export default AssetSelector;
