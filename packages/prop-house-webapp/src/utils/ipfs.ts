import { CID } from 'multiformats/src/cid';
import { base32 } from 'multiformats/src/bases/base32';

interface IpfsImageSrcRegexMatch {
  fullIpfsPath: string;
  cid: string;
  innerIpfsPath?: string;
}

export const ipfsImageSrcRegex =
  /(ipfs:\/\/|https:\/\/prophouse.mypinata.cloud\/ipfs\/)(?<fullIpfsPath>(?<cid>[^/"'\s]*)((?<innerIpfsPath>[^"'\s]*))?)/g;

export const replaceIpfsGateway = (text: string) => {
  for (let match of text.matchAll(ipfsImageSrcRegex)) {
    if (!match.groups?.cid) continue;
    const newImgBody = buildHostedPinataIpfsUrl(match.groups as unknown as IpfsImageSrcRegexMatch);
    text = text.replace(match[0], newImgBody);
  }
  return text;
};

export const buildPhIpfsUrl = (matchGroups: IpfsImageSrcRegexMatch) =>
  `https://ipfs.backend.prop.house/ipfs/${matchGroups.fullIpfsPath}`;

export const buildNftStorageUrl = (matchGroups: IpfsImageSrcRegexMatch) =>
  `https://${ipfsIdtoV1(matchGroups.cid)}.ipfs.nftstorage.link/${matchGroups.innerIpfsPath || ''}`;

export const buildDwebUrl = (matchGroups: IpfsImageSrcRegexMatch) =>
  `https://${ipfsIdtoV1(matchGroups.cid)}.ipfs.dweb.link/${matchGroups.innerIpfsPath || ''}`;

export const buildCloudflareIpfsUrl = (matchGroups: IpfsImageSrcRegexMatch) =>
  `https://cloudflare-ipfs.com/ipfs/${matchGroups.fullIpfsPath}`;

export const buildHostedPinataIpfsUrl = (matchGroups: IpfsImageSrcRegexMatch) =>
  `https://phpinatasupport.mypinata.cloud/ipfs/${matchGroups.fullIpfsPath}`;

export const cidToV1 = (cid: string) => CID.parse(cid).toV1().toString(base32.encoder);

/**
 * Resolve an IPFS ID into a V1 CID. Supports both CIDv0 and CIDv1,
 * and returns the original string if it is not a valid IPFS ID.
 */
export const ipfsIdtoV1 = (ipfsId: string) => (ipfsId[0] === 'Q' ? cidToV1(ipfsId) : ipfsId);
