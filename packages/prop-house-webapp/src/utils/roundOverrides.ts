import { Timed } from '@prophouse/sdk-react';

export const ROUND_OVERRIDES: Record<string, { state: Timed.RoundState; winners: number[] }> = {
  // BasePaint
  '0x2fd198c8b641180a593dceda1eaaac6bd0fc8c89': {
    state: Timed.RoundState.COMPLETE,
    winners: [12, 18, 13, 8, 2],
  },
  // CrypToadz
  '0xe1cef36f31d304c2b7cdd7e759774bbb2dc6526f': {
    state: Timed.RoundState.COMPLETE,
    winners: [12, 11, 7, 9, 6],
  },
  // Purple
  '0xc6afa7d53c692ec7f997f2953af18dd449bfe1ed': {
    state: Timed.RoundState.COMPLETE,
    winners: [2, 7, 3, 5, 4],
  },
  // Indexers Index
  '0x57347c22f0a0a764c0aa3554cc3df20ca7ceb28d': {
    state: Timed.RoundState.COMPLETE,
    winners: [10, 16, 13],
  },
  // qDAUs of the Year
  '0x9a9bb3c4bb4071ad572782dae78afc128a4b5f52': {
    state: Timed.RoundState.COMPLETE,
    winners: [14, 23, 6, 21, 18],
  },
};

export const GOV_POWER_OVERRIDES: Record<string, { decimals: number }> = {
  // $FARTS
  '0x7a5a9ddbbb10726daf19aedf8d8c402e44dc5215': {
    decimals: 18,
  },
};
