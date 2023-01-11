import { Auction } from 'src/auction/auction.entity';

export const ParseDate = (str) => new Date(str);

export const tweetDate = (date: Date) => [date.toLocaleString('en-US', {timeZone: "America/New_York"}), "ET"].join(' ')

export const canSubmitProposals = (auction: Auction): boolean =>
  new Date() > auction.startTime && new Date() <= auction.proposalEndTime;
