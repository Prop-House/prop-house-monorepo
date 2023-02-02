import { Wallet } from '@ethersproject/wallet';
import axios from 'axios';
import {
  Auction,
  Proposal,
  StoredAuction,
  StoredFile,
  StoredVote,
  Vote,
  Community,
  CommunityWithAuctions,
  UpdatedProposal,
  DeleteProposal,
} from './builders';
import FormData from 'form-data';
import * as fs from 'fs';

import {
  DeleteProposalMessageTypes,
  EditProposalMessageTypes,
  ProposalMessageTypes,
  VoteMessageTypes,
} from './types/eip712Types';
import { multiVoteSignature } from './utils/multiVoteSignature';
import { multiVotePayload } from './utils/multiVotePayload';
import { Signer } from 'ethers';

export class PropHouseWrapper {
  constructor(
    private readonly host: string,
    private readonly signer: Signer | Wallet | null | undefined = undefined,
  ) {}

  async createAuction(auction: Auction): Promise<StoredAuction[]> {
    try {
      return (await axios.post(`${this.host}/auctions`, auction)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getAuction(id: number): Promise<StoredAuction> {
    try {
      const rawAuction = (await axios.get(`${this.host}/auctions/${id}`)).data;
      return StoredAuction.FromResponse(rawAuction);
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getAuctions(): Promise<StoredAuction[]> {
    try {
      const rawAuctions = (await axios.get(`${this.host}/auctions`)).data;
      return rawAuctions.map(StoredAuction.FromResponse);
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getAuctionsForCommunity(id: number): Promise<StoredAuction[]> {
    try {
      const rawAuctions = (await axios.get(`${this.host}/auctions/forCommunity/${id}`)).data;
      return rawAuctions.map(StoredAuction.FromResponse);
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getAuctionWithNameForCommunity(
    auctionName: string,
    communityId: number,
  ): Promise<StoredAuction> {
    try {
      const rawAuction = (
        await axios.get(`${this.host}/auctions/${auctionName}/community/${communityId}`)
      ).data;
      return StoredAuction.FromResponse(rawAuction);
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getProposals(limit = 20, skip = 0, order: 'ASC' | 'DESC' = 'DESC') {
    try {
      const { data } = await axios.get(`${this.host}/proposals`, {
        params: {
          limit,
          skip,
          order,
        },
      });
      return data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getProposal(id: number) {
    try {
      return (await axios.get(`${this.host}/proposals/${id}`)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getAuctionProposals(auctionId: number) {
    try {
      return (await axios.get(`${this.host}/auctions/${auctionId}/proposals`)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async createProposal(proposal: Proposal, isContract = false) {
    if (!this.signer) return;
    try {
      const signedPayload = await proposal.signedPayload(
        this.signer,
        isContract,
        ProposalMessageTypes,
      );
      return (await axios.post(`${this.host}/proposals`, signedPayload)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async updateProposal(updatedProposal: UpdatedProposal, isContract = false) {
    if (!this.signer) return;
    try {
      const signedPayload = await updatedProposal.signedPayload(
        this.signer,
        isContract,
        EditProposalMessageTypes,
      );
      return (await axios.patch(`${this.host}/proposals`, signedPayload)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async deleteProposal(deleteProposal: DeleteProposal, isContract = false) {
    if (!this.signer) return;
    try {
      const signedPayload = await deleteProposal.signedPayload(
        this.signer,
        isContract,
        DeleteProposalMessageTypes,
      );
      return (await axios.delete(`${this.host}/proposals`, { data: signedPayload })).data;
    } catch (e: any) {
      throw e;
    }
  }

  async logVotes(votes: Vote[], isContract = false) {
    if (!this.signer) return;

    try {
      // sign payload and use for all votes, awaiting if the signer is not a contract
      let signature = '0x';
      const payload = multiVotePayload(votes);

      const signaturePromise = multiVoteSignature(this.signer, isContract, payload);
      if (!isContract) {
        signature = await signaturePromise;
      }

      let responses = [];

      // POST each vote with the signature of the payload of all votes
      for (const vote of votes) {
        const signedPayload = await vote.presignedPayload(
          this.signer,
          signature,
          JSON.stringify(payload),
          VoteMessageTypes,
        );
        responses.push((await axios.post(`${this.host}/votes`, signedPayload)).data);
      }
      return responses;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getAddressFiles(address: string): Promise<StoredFile[]> {
    try {
      return (await axios.get(`${this.host}/file/${address}`)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async postFile(file: File, name: string) {
    try {
      const form = new FormData();
      form.append('file', file, name);
      form.append('name', name);
      const config = {
        headers: {
          'content-type': 'multipart/form-data',
        },
      };
      return await axios.post(`${this.host}/file`, form, config);
    } catch (e: any) {
      console.log('error', e);
      throw e.response.data.message;
    }
  }

  /**
   * POST a buffer for storage.
   * @param fileBuffer The buffer to store
   * @param name The filename to upload the buffer as
   * @param signBuffer Whether a signer (if provided during instantiation)
   * should be used to sign the payload.
   */
  async postFileBuffer(fileBuffer: Buffer, name: string, signBuffer: boolean = false) {
    try {
      const form = new FormData();
      form.append('file', fileBuffer, name);
      form.append('name', name);
      if (this.signer && signBuffer) {
        const signature = await this.signer.signMessage(fileBuffer);
        form.append('signature', signature);
      }
      return await axios.post(`${this.host}/file`, form, {
        headers: {
          ...form.getHeaders(),
        },
      });
    } catch (e: any) {
      throw e.response;
    }
  }

  /**
   * POST a file for storage from on disk data.
   * @param path Path to the file on disk
   * @param name The filename to upload as
   * @param signBuffer Whether a signer (if provided during instantiation)
   * should be used to sign the payload.
   */
  async postFileFromDisk(path: string, name: string, signBuffer: boolean = false) {
    return this.postFileBuffer(fs.readFileSync(path), name, signBuffer);
  }

  async getAddress() {
    if (!this.signer) return undefined;
    return this.signer.getAddress();
  }

  async getVotesByAddress(address: string): Promise<StoredVote[]> {
    try {
    } catch (e: any) {
      throw e.response.data.message;
    }
    return (await axios.get(`${this.host}/votes/by/${address}`)).data;
  }

  async getCommunities(): Promise<CommunityWithAuctions[]> {
    try {
      return (await axios.get(`${this.host}/communities`)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getCommunity(contractAddress: string): Promise<CommunityWithAuctions> {
    try {
      return (await axios.get(`${this.host}/${contractAddress}`)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getCommunityWithId(id: number): Promise<Community> {
    try {
      return (await axios.get(`${this.host}/communities/id/${id}`)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }

  async getCommunityWithName(name: string): Promise<CommunityWithAuctions> {
    try {
      return (await axios.get(`${this.host}/communities/name/${name}`)).data;
    } catch (e: any) {
      throw e.response.data.message;
    }
  }
}
