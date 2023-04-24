export enum RoundState {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  FINALIZED = 'FINALIZED',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
}

export interface Uint256 {
  low: string;
  high: string;
}

export interface Proposal {
  proposal_id: string;
  proposer_address: string;
  voting_power: Uint256;
}
