import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Community } from 'src/community/community.entity';
import { Proposal } from 'src/proposal/proposal.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
  ManyToOne,
  RelationId,
} from 'typeorm';

@Entity()
@ObjectType()
export class Auction {
  @PrimaryGeneratedColumn()
  @Field(type => Int, {
    description: "All auctions are issued a unique ID number"
  })
  id: number;

  @Column({ default: true })
  visible: boolean;

  @Column()
  @Field(type => String)
  title: string;

  @Column()
  @Field(type => Date, {
    description: "After the Start Time users may submit proposals"
  })
  startTime: Date;

  @Column()
  @Field(type => Date,
    {
      description: "Users may submit proposals up until Proposal End Time"
    })
  proposalEndTime: Date;

  @Column()
  @Field(type => Date, {
    description: "Between Proposal End Time and Voting End Time, users may submit votes for proposals"
  })
  votingEndTime: Date;

  @Column({ type: 'decimal', scale: 2, default: 0.0 })
  @Field((type) => Float, {
    description: 'The number of currency units paid to each winner',
  })
  fundingAmount: number;

  @Column({ nullable: true })
  @Field(type => String, {
    description: "The currency for the auction that winners will be paid in"
  })
  currencyType: string;

  @Column({ nullable: true })
  @Field(type => String)
  description: string;

  @Column()
  @Field(type => Int, {
    description: "The number of winners that will be paid from the auction"
  })
  numWinners: number;

  @OneToMany(() => Proposal, (proposal) => proposal.auction)
  @JoinColumn()
  @Field(type => [Proposal])
  proposals: Proposal[];

  @RelationId((auction: Auction) => auction.proposals)
  numProposals: number;

  @ManyToOne(() => Community, (community) => community.auctions)
  @JoinColumn()
  @Field(type => Community)
  community: Community;

  @Column()
  @Field(type => Date)
  createdDate: Date;

  @Column({ nullable: true })
  @Field(type => Date)
  lastUpdatedDate: Date;

  @Column({ default: 0 })
  @Field(type => String)
  balanceBlockTag: number;

  @Column({ default: 0 })
  @Field((type) => Number)
  type: number;

  @Column({ type: 'decimal', scale: 2, default: null })
  @Field((type) => Number)
  quorum: number;

  @BeforeInsert()
  setCreatedDate() {
    this.createdDate = new Date();
  }

  @BeforeUpdate()
  setUpdatedDate() {
    this.lastUpdatedDate = new Date();
  }
}

@InputType()
export class AuctionInput extends Auction {}
