import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ProposalsService } from 'src/proposal/proposals.service';
import { isValidVoteDirection, VoteDirections } from 'src/utils/vote';
import { Vote } from './vote.entity';
import { CreateVoteDto } from './vote.types';
import { VotesService } from './votes.service';
import { SignedPayloadValidationPipe } from 'src/entities/signed.pipe';

@Controller('votes')
export class VotesController {
  constructor(
    private readonly votesService: VotesService,
    private readonly proposalService: ProposalsService,
  ) {}

  @Get()
  getVotes(): Promise<Vote[]> {
    return this.votesService.findAll();
  }
  @Get(':id')
  findOne(@Param('id') id: number): Promise<Vote> {
    return this.votesService.findOne(id);
  }

  @Get('by/:address')
  findByAddress(@Param('address') address: string) {
    return this.votesService.findByAddress(address);
  }

  @Post()
  async create(
    @Body(SignedPayloadValidationPipe) createVoteDto: CreateVoteDto,
  ) {
    const foundProposal = await this.proposalService.findOne(
      createVoteDto.proposalId,
    );

    // Verify that proposal exist
    if (!foundProposal)
      throw new HttpException('No Proposal with that ID', HttpStatus.NOT_FOUND);

    // Verify that vote direction is valid
    if (!isValidVoteDirection(createVoteDto.direction))
      throw new HttpException(
        `${createVoteDto.direction} is not a valid vote direction`,
        HttpStatus.BAD_REQUEST,
      );

    // Verify that signed data equals this payload
    const signedPayload: CreateVoteDto = JSON.parse(
      Buffer.from(createVoteDto.signedData.message, 'base64').toString(),
    );

    // Get corresponding vote within signed payload (bulk voting payloads may have multiple votes)
    var arr = Object.keys(signedPayload).map((key) => signedPayload[key]);
    const correspondingVote = arr.find(
      (v) => v.proposalId === foundProposal.id,
    );
    if (
      !(
        correspondingVote.direction === createVoteDto.direction &&
        correspondingVote.proposalId === createVoteDto.proposalId
      )
    )
      throw new HttpException(
        "Signed payload and supplied data doesn't match",
        HttpStatus.BAD_REQUEST,
      );

    // Verify that signer has allowed votes
    const totalVotesAvail = await this.votesService.getNumVotes(
      createVoteDto,
      foundProposal.auction.balanceBlockTag,
    );

    if (totalVotesAvail === 0)
      throw new HttpException(
        'Signer does not have delegated votes',
        HttpStatus.BAD_REQUEST,
      );

    // Get votes by user for auction
    const signerVotesForAuction = (
      await this.votesService.findByAddress(createVoteDto.address)
    )
      .filter((vote) => vote.proposal.auctionId === foundProposal.auctionId)
      .sort((a, b) => (a.createdDate < b.createdDate ? -1 : 1));

    // Voting up
    if (createVoteDto.direction === VoteDirections.Up) {
      const aggVoteWeightSubmitted = signerVotesForAuction.reduce(
        (agg, current) => Number(agg) + Number(current.weight),
        0,
      );

      // Verify that user has not reached max votes
      if (aggVoteWeightSubmitted >= totalVotesAvail)
        throw new HttpException(
          'Signer has consumed all delegated votes',
          HttpStatus.BAD_REQUEST,
        );

      await this.votesService.createNewVote(createVoteDto, foundProposal);
      await this.proposalService.rollupVoteCount(foundProposal.id);
    }
  }
}
