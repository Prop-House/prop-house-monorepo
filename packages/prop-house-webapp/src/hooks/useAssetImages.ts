import { Asset, AssetType, ERC1155, ERC721 } from '@prophouse/sdk-react';
import { erc721ABI } from '@wagmi/core';
import { useEffect, useState } from 'react';
import { useContractReads } from 'wagmi';
import { resolveUri } from '../utils/resolveUri';
import { erc1155ABI } from '../abi/ERC1155ABI';
import { filterAssetsForType } from '../utils/filterAssetsForType';
import { erc20img } from '../components/HouseManager/AssetSelector';
import { erc1155TokenUriMods } from '../utils/modifyErc1155TokenUris';

/**
 * Fetches symbols, decimals and token imgs for each award and returns a FullRoundAward
 */
const useAssetImages = (assets: Asset[]): string[] | undefined => {
  const [awardImages, setAwardImages] = useState<string[] | undefined>();

  const [erc721imgUris, setErc721imgUris] = useState<{ [key: string]: string } | undefined>();
  const erc721Assets = filterAssetsForType<ERC721>(assets, AssetType.ERC721);
  const hasErc721s = erc721Assets.length > 0;

  const [erc1155imgUris, setErc1155imgUris] = useState<{ [key: string]: string } | undefined>();
  const erc1155Assets = filterAssetsForType<ERC1155>(assets, AssetType.ERC1155);
  const hasErc1155s = erc1155Assets.length > 0;

  // fetch erc1155 tokenURIs
  const { data: erc1155TokenUriFetch, isLoading: loadingErc1155TokenUris } = useContractReads({
    contracts: erc1155Assets.map(asset => {
      return {
        address: asset.address as `0x${string}`,
        abi: erc1155ABI,
        functionName: 'uri',
        args: [asset.tokenId],
      };
    }),
  });

  // fetch erc721 tokenURIs
  const { data: erc721TokenUriFetch, isLoading: loadingErc721TokenUri } = useContractReads({
    contracts: erc721Assets.map(asset => {
      return {
        address: asset.address as `0x${string}`,
        abi: erc721ABI,
        functionName: 'tokenURI',
        args: [asset.tokenId],
      };
    }),
  });

  // parse erc1155 tokenURIs into image URIs
  useEffect(() => {
    if (!erc1155TokenUriFetch) return;

    const finalErc1155TokenUrisToFetch = erc1155TokenUriFetch.map((uri, index) => {
      return erc1155TokenUriMods(uri.result as string, erc1155Assets[index]);
    });

    const resolveImageUris = async () => {
      let updatedImgUris: { [key: string]: string } = {};

      const imageUrisPromises = finalErc1155TokenUrisToFetch.map(uri => {
        if (!uri) return '/manager/nft.svg';
        return resolveUri(uri);
      });
      const imageUris = await Promise.all(imageUrisPromises);

      // map them to their corresponding token address + identifier
      erc1155Assets.forEach((a, index) => {
        if (!imageUris[index]) return;
        updatedImgUris[`${a.address}-${a.tokenId}`] = imageUris[index];
      });

      const updatedKeys = Object.keys(updatedImgUris);
      const updatedValues = Object.values(updatedImgUris);
      const storedKeys = Object.keys(erc1155imgUris || {});
      const storedValues = Object.values(erc1155imgUris || {});

      const shouldUpdate =
        updatedKeys.some((key, index) => key !== storedKeys[index]) ||
        updatedValues.some((value, index) => value !== storedValues[index]);

      if (shouldUpdate) setErc1155imgUris(updatedImgUris);
    };

    resolveImageUris();
  }, [erc1155TokenUriFetch, hasErc1155s, erc1155Assets, loadingErc1155TokenUris, erc1155imgUris]);

  // parse erc721 tokenURIs into image URIs
  useEffect(() => {
    if (!erc721TokenUriFetch) return;

    const resolveImageUris = async () => {
      let updatedImgUris: { [key: string]: string } = {};

      const imageUrisPromises = erc721TokenUriFetch.map(uri => {
        if (!uri.result) return '/manager/nft.svg';
        return resolveUri(uri.result as string);
      });
      const imageUris = await Promise.all(imageUrisPromises);

      // map them to their corresponding token address + identifier
      erc721Assets.forEach((a, index) => {
        if (!imageUris[index]) return;
        updatedImgUris[`${a.address}-${a.tokenId}`] = imageUris[index];
      });

      const updatedKeys = Object.keys(updatedImgUris);
      const updatedValues = Object.values(updatedImgUris);
      const storedKeys = Object.keys(erc721imgUris || {});
      const storedValues = Object.values(erc721imgUris || {});

      const shouldUpdate =
        updatedKeys.some((key, index) => key !== storedKeys[index]) ||
        updatedValues.some((value, index) => value !== storedValues[index]);

      if (shouldUpdate) setErc721imgUris(updatedImgUris);
    };

    resolveImageUris();
  }, [erc721TokenUriFetch, hasErc721s, erc721Assets, loadingErc721TokenUri, erc721imgUris]);

  useEffect(() => {
    if (assets.length === 0 || (hasErc721s && !erc721imgUris) || (hasErc1155s && !erc1155imgUris))
      return;

    const mappedAssets = assets.map(asset => {
      switch (asset.assetType) {
        case AssetType.ETH:
          return '/manager/eth.png';
        case AssetType.ERC721:
          const uri721 = erc721imgUris && erc721imgUris[`${asset.address}-${asset.tokenId}`];
          return uri721 ? uri721 : '/manager/nft.svg';
        case AssetType.ERC20:
          return erc20img(asset.address);
        case AssetType.ERC1155:
          const eri1155 = erc1155imgUris && erc1155imgUris[`${asset.address}-${asset.tokenId}`];
          return eri1155 ? eri1155 : '/manager/token.svg';
        default:
          return '/manager/fallback.png';
      }
    });

    const shouldUpdate =
      !awardImages || awardImages.some((uri, index) => uri !== mappedAssets[index]);

    if (shouldUpdate) setAwardImages(mappedAssets);
  }, [assets, erc721imgUris, erc1155imgUris, hasErc721s, hasErc1155s, awardImages]);

  return awardImages;
};

export default useAssetImages;
