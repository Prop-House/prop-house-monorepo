import { RoundAward } from '@prophouse/sdk-react/node_modules/@prophouse/sdk/dist/gql/types';
import StatusPill, { StatusPillColor } from '../StatusPill';
import { useContractReads } from 'wagmi';
import { erc20ABI, erc721ABI } from '@wagmi/core';
import { formatEther } from 'viem';
import { useEffect, useState } from 'react';
import { formatUnits } from 'ethers/lib/utils';

interface FullRoundAward extends RoundAward {
  symbol: string;
  decimals: number | undefined;
  parsedAmount: number;
}

const AwardsDisplay: React.FC<{ awards: RoundAward[] }> = props => {
  const { awards } = props;

  const [fullRoundAwards, setFullRoundAwards] = useState<FullRoundAward[]>();
  const [oneCurrencyTotalAmount, setOneCurrencyTotalAmount] = useState<number>();

  const oneCurrencyForAllAwards =
    awards.length === 1 || awards.every(award => award.asset.token === awards[0].asset.token);

  const awardContracts = awards.map(award => {
    return {
      address: award.asset.token as `0x${string}`,
      abi: award.asset.assetType === 'ERC20' ? erc20ABI : erc721ABI,
    };
  });

  // fetch symbols
  const {
    data: symbols,
    isError: errorLoadingSymbols,
    isLoading: loadingSymbols,
  } = useContractReads({
    contracts: awardContracts.map(awardContract => {
      return { ...awardContract, functionName: 'symbol' };
    }),
  });

  // fetch decimals
  const {
    data: decimals,
    isError: errorLoadingDecimals,
    isLoading: loadingDecimals,
  } = useContractReads({
    contracts: awardContracts.map(awardContract => {
      return { ...awardContract, functionName: 'decimals' };
    }),
  });

  // parse symbols, decimals and amounts into awards as FullRoundAwards[]
  useEffect(() => {
    if (!symbols || fullRoundAwards || !decimals) return;

    const parsedAmounts = awards.map((award, index) => {
      switch (award.asset.assetType) {
        case 'NATIVE':
          return Number(formatEther(BigInt(award.amount)));
        case 'ERC20':
          return Number(formatUnits(BigInt(award.amount), decimals[index].result as number));
        case 'ERC721':
        case 'ERC1155':
          return 1;
      }
    });

    setFullRoundAwards(
      awards.map((award, index) => {
        return {
          ...award,
          symbol: award.asset.assetType === 'NATIVE' ? 'ETH' : (symbols[index].result as string),
          decimals: decimals[index].result as number | undefined,
          parsedAmount: parsedAmounts[index],
        };
      }),
    );

    if (oneCurrencyForAllAwards) setOneCurrencyTotalAmount(parsedAmounts.reduce((a, b) => a + b));
  });

  if (!oneCurrencyForAllAwards)
    return <StatusPill copy={`Multiple`} color={StatusPillColor.Green} size={18} />;

  if (fullRoundAwards)
    return (
      <StatusPill
        copy={`${oneCurrencyTotalAmount} ${fullRoundAwards[0].symbol}`}
        color={StatusPillColor.Green}
        size={18}
      />
    );

  return <>fucled</>;
};
export default AwardsDisplay;
