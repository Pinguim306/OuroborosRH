export type Address = `0x${string}`;

export interface TokenMarket {
  address: Address;
  curve: Address;
  rewards: Address;
  name: string;
  symbol: string;
  description: string;
  image: string; // emoji or url
  creator: Address;
  createdAt: number; // unix seconds
  priceRh: number; // native per token
  marketCapRh: number;
  volume24hRh: number;
  liquidityRh: number; // permanent liquidity accrued from fees
  holders: number;
  graduationProgress: number; // 0..1
  graduated: boolean;
  rewardsPoolRh: number; // native streamed to holders so far
  aprPct: number; // estimated
  socials?: { x?: string; telegram?: string; website?: string };
}

export interface Trade {
  id: string;
  trader: Address;
  isBuy: boolean;
  rhAmount: number;
  tokenAmount: number;
  time: number;
}

export interface Holder {
  address: Address;
  balance: number;
  sharePct: number;
  claimableRh: number; // fees accrued to this holder, no staking
}

export interface RewardPosition {
  token: TokenMarket;
  balance: number; // tokens held
  claimableRh: number; // native fees claimable right now
}
