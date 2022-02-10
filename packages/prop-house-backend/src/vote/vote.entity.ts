import { SignedEntity } from 'src/entities/signed.entity';
import { Proposal } from 'src/proposal/proposal.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  JoinColumn,
  ManyToOne,
  BeforeInsert,
} from 'typeorm';

@Entity()
export class Vote extends SignedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 1 })
  direction: number;

  @ManyToOne(() => Proposal, (proposal) => proposal.votes)
  @JoinColumn()
  proposal: Proposal;

  @Column()
  createdDate: Date;

  @Column()
  proposalId: number;

  @BeforeInsert()
  setCreatedDate() {
    this.createdDate = new Date();
  }

  static findByAddress(address: string) {
    return this.createQueryBuilder('vote')
      .where('vote.address = :address', { address })
      .getMany();
  }
}
