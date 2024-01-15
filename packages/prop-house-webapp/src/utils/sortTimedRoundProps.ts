import { TimedRoundSortProps, TimedRoundSortType } from '../state/slices/propHouse';
import { sortByVotesAndHandleTies } from './sortByVotesAndHandleTies';
import { Proposal } from '@prophouse/sdk-react';
import dayjs from 'dayjs';
import { sortHelper } from './sortHelper';

export const sortTimedRoundProps = (
  proposals: Proposal[],
  props: TimedRoundSortProps,
): Proposal[] => {
  switch (props.sortType) {
    case TimedRoundSortType.VoteCount:
      return sortByVotesAndHandleTies(proposals, props.ascending);
    case TimedRoundSortType.Random:
      return proposals.sort(() => Math.random() - 0.5);
    case TimedRoundSortType.CreatedAt:
      return proposals.sort((a, b) =>
        sortHelper(dayjs(a.receivedAt), dayjs(b.receivedAt), props.ascending),
      );
    default:
      return proposals.sort((a, b) =>
        sortHelper(dayjs(a.receivedAt), dayjs(b.receivedAt), props.ascending),
      );
  }
};
