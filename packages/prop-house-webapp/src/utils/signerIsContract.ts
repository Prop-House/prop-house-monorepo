import { Provider } from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';

export const signerIsContract = async (
  signer: Signer | undefined,
  provider: Provider,
  account: `0x${string}` | undefined,
) => {
  if (!signer || !provider || !account) return false;

  const code = await provider.getCode(account);
  const isContract = code !== '0x';
  return isContract;
};
