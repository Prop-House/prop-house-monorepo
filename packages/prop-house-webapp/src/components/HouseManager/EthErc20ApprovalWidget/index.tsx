import classes from './EthErc20ApprovalWidget.module.css';
import { useEffect, useState } from 'react';
import {
  usePrepareContractWrite,
  useContractWrite,
  useWaitForTransaction,
  useContractRead,
  useAccount,
} from 'wagmi';
import { AssetType, ChainId, usePropHouse } from '@prophouse/sdk-react';
import Group from '../Group';
import Text from '../Text';
import Button, { ButtonColor } from '../../Button';
import { ProgressBar } from 'react-bootstrap';
import { Token } from '../../../state/slices/round';
import TokenApprovalModal from '../TokenApprovalModal';
import {
  erc20AllowanceInterface,
  erc20ApproveInterface,
  erc20BalanceOfInterface,
} from '../../../utils/contractABIs';
import { BigNumber, BigNumberish, ethers } from 'ethers';

const EthErc20ApprovalWidget: React.FC<{
  award: Token;
  total: number;
  handleAllocation: (allocated: number, award: Token) => void;
}> = props => {
  const { award, total, handleAllocation } = props;

  const [showTokenApprovalModal, setShowTokenApprovalModal] = useState(false);
  const isNFT = award.type === AssetType.ERC721 || award.type === AssetType.ERC1155;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isNFT) return;

    let value = e.target.value;

    // if it's not a number or a decimal, don't change the input
    if (isNaN(Number(value)) && !value.match(/^\d*\.?\d*$/)) return;

    let allocated = parseFloat(value) || 0.0;

    // if the allocated amount is greater than the total, set it to the total
    if (allocated > total) allocated = total;

    setApprovedAmount(allocated);

    handleAllocation!(allocated, award);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (isNFT) return;

    handleSwitch();

    let value = parseFloat(e.target.value);

    if (isNaN(value)) value = 0.0;

    if (total && value > total) value = total;
    else if (value < 0) value = 0;

    setApprovedAmount(value);
    handleAllocation!(value, award);
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const clipboardData = e.clipboardData.getData('text');
    let value = parseFloat(clipboardData);

    if (isNaN(value)) value = 0;

    if (value < 0) {
      // If value is negative, set to 0
      setApprovedAmount(0);
      return;
    }
    setApprovedAmount(value);
  };

  //  -------- ------- ------- ------- ------- ------- --------
  //  -------- ------- ------- BALANCE OF ------- ------- -----
  //  -------- ------- ------- ------- ------- ------- --------
  const { address: ownerAddress } = useAccount();
  const { data: tokenBalanceData, isLoading: balanceLoading } = useContractRead({
    address: (award.address as `0x${string}`) ?? '', // The address of the ERC20 token
    abi: erc20BalanceOfInterface,
    functionName: 'balanceOf',
    chainId: ChainId.EthereumGoerli,
    args: [ownerAddress],
  });
  const tokenBalance: BigNumber | undefined =
    !balanceLoading && tokenBalanceData
      ? BigNumber.from(tokenBalanceData as any as BigNumberish)
      : undefined;

  //  -------- ------- ------- ------- ------- ------- --------
  //  -------- ------- ------- APPROVAL ------- ------- -------
  //  -------- ------- ------- ------- ------- ------- --------
  const propHouse = usePropHouse();
  const spenderAddress = propHouse.contract.address;
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [approvedAmount, setApprovedAmount] = useState(0.0);
  const { config } = usePrepareContractWrite({
    address: (award.address as `0x${string}`) ?? '', // The address of the ERC20 token
    abi: erc20ApproveInterface,
    functionName: 'approve',
    chainId: ChainId.EthereumGoerli,
    args: [spenderAddress, ethers.constants.MaxUint256], // unlimited approval
  });

  const { data, isLoading, write } = useContractWrite(config);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const waitForTransaction = useWaitForTransaction({ hash: transactionHash as `0x${string}` });

  //  -------- ------- ------- ------- ------- ------- --------
  //  ------- ------- ------- ALLOWANCE ------- ------- -------
  //  -------- ------- ------- ------- ------- ------- --------
  const { data: allowance } = useContractRead({
    address: (award.address as `0x${string}`) ?? '', // The address of the ERC20 token
    abi: erc20AllowanceInterface,
    functionName: 'allowance',
    chainId: ChainId.EthereumGoerli,
    args: [ownerAddress, spenderAddress],
  });

  useEffect(() => {
    if (award.type === AssetType.ERC20 && tokenBalance?.gt(BigNumber.from('0'))) {
      let allowanceString = allowance && BigNumber.from(allowance).toString();
      let allowanceBN = BigNumber.from(allowanceString);
      // checks if allowance is greater than 0 and therefore approved
      setIsApproved(allowanceBN.gt(BigNumber.from('0')));
    }
  }, [allowance, award.type, tokenBalance]);

  useEffect(() => {
    if (data) setTransactionHash(data.hash as `0x${string}`);
  }, [data]);

  const handleClose = () => {
    setIsApproved(isApproved);
    setShowTokenApprovalModal(false);
  };

  // toggle between the input and the "button" input
  const [hasBeenClicked, setHasBeenClicked] = useState(false);
  const handleSwitch = () => setHasBeenClicked(!hasBeenClicked);

  return (
    <>
      {showTokenApprovalModal && (
        <TokenApprovalModal
          isNFT={isNFT}
          award={award}
          setShowTokenApprovalModal={setShowTokenApprovalModal}
          status={{
            isLoading: waitForTransaction.isLoading,
            isSuccess: waitForTransaction.isSuccess,
            isError: waitForTransaction.isError,
            error: waitForTransaction.error,
          }}
          handleClose={handleClose}
          setIsApproved={setIsApproved}
        />
      )}

      {tokenBalance ? (
        <div className={classes.container}>
          <Group classNames={classes.row}>
            <Group row classNames={classes.row}>
              <Group row gap={4} classNames={classes.awardNameImg}>
                <div className={classes.imageContainer}>
                  <img
                    className={classes.image}
                    src={award.image ? award.image : '/manager/fallback.png'}
                    alt="avatar"
                  />
                </div>

                <Text type="subtitle">{award.name}</Text>
              </Group>

              <Group row gap={4} classNames={classes.awardNameImg}>
                <Text type="body" classNames={classes.amount}>
                  {isNFT
                    ? `#${award.tokenId}`
                    : `${approvedAmount} of ${total} ${award.symbol || award.name}`}
                </Text>
              </Group>
            </Group>

            {total && (award.type === AssetType.ETH || isApproved) ? (
              <Group classNames={classes.progressBar}>
                <ProgressBar>
                  <ProgressBar now={(approvedAmount / total) * 100} />
                  <ProgressBar now={100 - (approvedAmount / total) * 100} variant="warning" />
                </ProgressBar>
              </Group>
            ) : (
              <></>
            )}
          </Group>

          <Group classNames={classes.row}>
            {total && (award.type === AssetType.ETH || isApproved) ? (
              <>
                <Group row classNames={classes.addFunds}>
                  <Text type="body" classNames={classes.addFundsText}>
                    Add funds:{' '}
                  </Text>
                  <Text
                    type="link"
                    onClick={() => {
                      setApprovedAmount(total);
                      handleAllocation!(total, award);
                    }}
                    disabled={approvedAmount === total}
                    classNames={classes.maxText}
                  >
                    Max
                  </Text>
                </Group>

                {hasBeenClicked ? (
                  <button className={classes.addressSuccess} onClick={handleSwitch}>
                    <p className={classes.amountText}>Amount</p>

                    <p className={classes.approvedAmount}>{approvedAmount}</p>
                  </button>
                ) : (
                  <input
                    className={classes.input}
                    type="text"
                    placeholder="0.0"
                    value={approvedAmount.toString()}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onPaste={handleInputPaste}
                  />
                )}
              </>
            ) : award.type === AssetType.ERC20 ? (
              <Button
                classNames={classes.button}
                text={`Approve ${award.symbol}`}
                bgColor={ButtonColor.Pink}
                disabled={!write || isLoading}
                onClick={() => {
                  write!();
                  setShowTokenApprovalModal(true);
                }}
              />
            ) : (
              <Button
                classNames={classes.button}
                text={'Select NFT'}
                bgColor={ButtonColor.Pink}
                onClick={() => setShowTokenApprovalModal(true)}
              />
            )}
          </Group>
        </div>
      ) : (
        <div className={classes.container} style={{ justifyContent: 'center' }}>
          <Text type="subtitle">{`No ${award.symbol} ${isNFT ? award.tokenId : ''} found`}</Text>
        </div>
      )}
    </>
  );
};

export default EthErc20ApprovalWidget;
