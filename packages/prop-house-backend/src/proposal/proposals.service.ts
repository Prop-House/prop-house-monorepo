import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proposal } from './proposal.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ProposalsService {
  constructor(
    @InjectRepository(Proposal)
    private proposalsRepository: Repository<Proposal>,
    private readonly eventEmitter: EventEmitter2
  ) {}

  findAll(): Promise<Proposal[]> {
    return this.proposalsRepository.find({
      loadRelationIds: {
        relations: ['auction', 'votes']
      },
      
      where: { visible: true },
    });
  }

  findOne(id: number): Promise<Proposal> {
    return this.proposalsRepository.findOne(id, {
      relations: ['votes'],
      where: { visible: true },
    });
  }

  async remove(id: number): Promise<void> {
    await this.proposalsRepository.delete(id);
  }

  async rollupScore(id: number) {
    const foundProposal = await this.findOne(id);
    if (!foundProposal) return;
    foundProposal.updateScore();
    this.proposalsRepository.save(foundProposal);
    this.eventEmitter.emitAsync('proposal.rolledUp', foundProposal)
  }

  async store(proposal: Proposal): Promise<Proposal> {
    return await this.proposalsRepository.save(proposal);
  }

  async scoreById(id: number): Promise<number> {
    const foundProposal = await this.proposalsRepository.findOneOrFail(id);
    return foundProposal.score;
  }
}
