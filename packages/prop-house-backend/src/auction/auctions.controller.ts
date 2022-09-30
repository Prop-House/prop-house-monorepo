import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ParseDate } from 'src/utils/date';
import { Auction } from './auction.entity';
import { CreateAuctionDto } from './auction.types';
import { AuctionsService } from './auctions.service';
import { ProposalsService } from 'src/proposal/proposals.service';
import { Proposal } from 'src/proposal/proposal.entity';

@Controller('auctions')
export class AuctionsController {
  constructor(
    private readonly auctionsService: AuctionsService,
    private readonly proposalService: ProposalsService,
  ) {}

  @Get()
  getVotes(): Promise<Auction[]> {
    return this.auctionsService.findAll();
  }

  @Post()
  async create(@Body() createAuctionDto: CreateAuctionDto): Promise<Auction> {
    const auction = new Auction();
    auction.startTime = createAuctionDto.startTime
      ? ParseDate(createAuctionDto.startTime)
      : new Date();
    auction.fundingAmount = createAuctionDto.fundingAmount;
    auction.proposalEndTime = ParseDate(createAuctionDto.proposalEndTime);
    auction.votingEndTime = ParseDate(createAuctionDto.votingEndTime);
    auction.title = createAuctionDto.title;
    return this.auctionsService.store(auction);
  }

  @Get(':id')
  async findOne(@Param('id') id: number): Promise<Auction> {
    const foundAuction = await this.auctionsService.findOne(id);
    if (!foundAuction)
      throw new HttpException('Auction not found', HttpStatus.NOT_FOUND);
    return foundAuction;
  }

  @Get('/forCommunity/:id')
  async findAllForCommunity(@Param('id') id: number): Promise<Auction[]> {
    const auctions = await this.auctionsService.findAllForCommunity(id);
    if (!auctions)
      throw new HttpException('Auction not found', HttpStatus.NOT_FOUND);
    auctions.map((a) => (a.numProposals = Number(a.numProposals) || 0));
    return auctions;
  }

  @Get('/:name/community/:id')
  async findWithNameForCommunity(
    @Param('id') id: number,
    @Param('name') name: string,
  ): Promise<Auction> {
    const auction = await this.auctionsService.findWithNameForCommunity(
      name,
      id,
    );
    if (!auction)
      throw new HttpException('Auction not found', HttpStatus.NOT_FOUND);
    return auction;
  }

  @Get(':id/proposals')
  async find(@Param('id') id: number): Promise<Proposal[]> {
    const foundProposals = await this.proposalService.findAllWithAuctionId(id);
    if (!foundProposals)
      throw new HttpException('Proposals not found', HttpStatus.NOT_FOUND);
    return foundProposals;
  }
  l;

  @Get(':id/rollUpProposals')
  async findAll(@Param('id') id: number): Promise<Proposal[]> {
    const foundProposals = await this.proposalService.findAllWithAuctionId(id);
    if (!foundProposals)
      throw new HttpException('Proposals not found', HttpStatus.NOT_FOUND);
    for (let index = 0; index < foundProposals.length; index++) {
      await this.proposalService.rollupVoteCount(foundProposals[index].id);
    }
    return foundProposals;
  }
}
