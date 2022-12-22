import { Injectable, Logger, Scope } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { proposalCountSubquery } from 'src/utils/proposal-count-subquery';
import { Repository } from 'typeorm';
import { Auction } from './auction.entity';

@Injectable()
export class AuctionsService {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(
    @InjectRepository(Auction)
    private auctionsRepository: Repository<Auction>,
  ) {}

  findAll(): Promise<Auction[]> {
    return this.auctionsRepository.find({
      loadRelationIds: {
        relations: ['proposals.auction', 'community'],
      },
      where: {
        visible: true,
      },
    });
  }

  findAllWithCommunity(): Promise<Auction[]> {
    return this.auctionsRepository.find({
      relations: ['community'],
      where: {
        visible: true,
      },
    });
  }

  findAllForCommunity(id: number): Promise<Auction[]> {
    return this.auctionsRepository
      .createQueryBuilder('a')
      .select('a.*')
      .where('a.community.id = :id', { id })
      .addSelect('SUM(p."numProposals")', 'numProposals')
      .leftJoin(proposalCountSubquery, 'p', 'p."auctionId" = a.id')
      .groupBy('a.id')
      .getRawMany();
  }

  findWithNameForCommunity(name: string, id: number): Promise<Auction> {
    const parsedName = name.replaceAll('-', ' '); // parse slug to name
    return this.auctionsRepository
      .createQueryBuilder('a')
      .select('a.*')
      .where('a.title ILIKE :parsedName', { parsedName }) // case insensitive
      .andWhere('a.community.id = :id', { id })
      .getRawOne();
  }

  findOne(id: number): Promise<Auction> {
    return this.auctionsRepository.findOne(id, {
      relations: ['proposals'],
      loadRelationIds: {
        relations: ['community'],
      },
      where: { visible: true },
    });
  }

  findOneWithCommunity(id: number): Promise<Auction> {
    return this.auctionsRepository.findOne(id, {
      relations: ['proposals', 'community'],
      where: { visible: true },
    });
  }

  findWhere(
    start: number,
    limit: number,
    where: Partial<Auction>,
    relations: string[] = [],
    relationIds?: string[],
  ) {
    return this.auctionsRepository.find({
      skip: start,
      take: limit,
      where,
      order: { id: 'ASC' },
      relations,
      loadRelationIds: relationIds ? { relations: relationIds } : undefined,
    });
  }

  async remove(id: number): Promise<void> {
    await this.auctionsRepository.delete(id);
  }

  async store(proposal: Auction): Promise<Auction> {
    return await this.auctionsRepository.save(proposal, { reload: true });
  }
}
