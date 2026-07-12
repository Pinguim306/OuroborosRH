import type { Address, Holder, RewardPosition, TokenMarket, Trade } from "../types";

/**
 * Mock-data layer. Every page reads from here until real contract addresses are
 * configured in `lib/contracts.ts`, so the whole app is browsable pre-deploy.
 */

const HOUR = 3600;
const now = () => Math.floor(Date.now() / 1000);

function addr(seed: string): Address {
  const hex = Array.from(seed)
    .map((c) => c.charCodeAt(0).toString(16))
    .join("")
    .padEnd(40, "0")
    .slice(0, 40);
  return `0x${hex}` as Address;
}

/**
 * Every launch mints the same fixed supply, sold through the curve. Keep the mock
 * consistent with it so price × supply (marketcap) and holder balances line up
 * with what the live on-chain path produces — otherwise implied supply drifts and
 * the numbers look "strange".
 */
const MOCK_SUPPLY = 1_000_000_000;

/**
 * All monetary fields are **ETH-denominated** (matching the live `*Rh` fields),
 * so the UI's `usdFromEth()` converts them to USD exactly once. `price` is derived
 * from `mcapEth / MOCK_SUPPLY`, guaranteeing a consistent 1B implied supply.
 */
interface Seed {
  name: string;
  symbol: string;
  image: string;
  description: string;
  mcapEth: number;
  volEth: number;
  liqEth: number;
  holders: number;
  progress: number;
  graduated: boolean;
  poolEth: number;
  apr: number;
  ageHours: number;
}

const SEEDS: Seed[] = [
  { name: "Snake Oil", symbol: "SSSS", image: "🐍", description: "The original ouroboros meme. It literally never sells the tail.", mcapEth: 24, volEth: 6, liqEth: 11, holders: 1240, progress: 0.72, graduated: false, poolEth: 1.4, apr: 141, ageHours: 6 },
  { name: "Loop Cat", symbol: "LOOP", image: "🐈", description: "A cat chasing its own liquidity. Purr-petual motion.", mcapEth: 60, volEth: 25, liqEth: 27, holders: 3410, progress: 1, graduated: true, poolEth: 5.2, apr: 96, ageHours: 52 },
  { name: "Diamond Fangs", symbol: "FANG", image: "💎", description: "Loyalty pays. The longer you hold, the harder the bite.", mcapEth: 5, volEth: 1.8, liqEth: 2.3, holders: 420, progress: 0.31, graduated: false, poolEth: 0.25, apr: 220, ageHours: 2 },
  { name: "Robin Rocket", symbol: "RRKT", image: "🚀", description: "Fueled entirely by recycled fees. To the loop and beyond.", mcapEth: 34, volEth: 15, liqEth: 17, holders: 2110, progress: 0.88, graduated: false, poolEth: 2.6, apr: 112, ageHours: 14 },
  { name: "Venom", symbol: "VNM", image: "🟢", description: "Acid-green tokenomics. Every swap deepens the pool.", mcapEth: 94, volEth: 37, liqEth: 43, holders: 5020, progress: 1, graduated: true, poolEth: 11.7, apr: 74, ageHours: 120 },
  { name: "Tail End", symbol: "TAIL", image: "🌀", description: "Where the fees come home to roost. Or coil.", mcapEth: 1.5, volEth: 0.6, liqEth: 0.75, holders: 132, progress: 0.12, graduated: false, poolEth: 0.06, apr: 310, ageHours: 1 },
  { name: "Feather", symbol: "FTHR", image: "🪶", description: "Light on supply, heavy on loyalty rewards.", mcapEth: 26, volEth: 9, liqEth: 12, holders: 1560, progress: 0.61, graduated: false, poolEth: 1.1, apr: 128, ageHours: 9 },
  { name: "Hood Money", symbol: "HOOD", image: "💵", description: "Fees in, liquidity out, holders paid. Simple.", mcapEth: 74, volEth: 30, liqEth: 34, holders: 4300, progress: 0.95, graduated: false, poolEth: 4.5, apr: 88, ageHours: 30 },
];

export const MOCK_TOKENS: TokenMarket[] = SEEDS.map((s) => {
  const a = addr(s.symbol + "token");
  return {
    address: a,
    curve: addr(s.symbol + "curve"),
    rewards: addr(s.symbol + "rewards"),
    name: s.name,
    symbol: s.symbol,
    description: s.description,
    image: s.image,
    creator: addr(s.symbol + "creator"),
    createdAt: now() - s.ageHours * HOUR,
    // Derived from a fixed 1B supply so marketcap = price × supply is exact.
    priceRh: s.mcapEth / MOCK_SUPPLY,
    marketCapRh: s.mcapEth,
    volume24hRh: s.volEth,
    liquidityRh: s.liqEth,
    holders: s.holders,
    graduationProgress: s.progress,
    graduated: s.graduated,
    rewardsPoolRh: s.poolEth,
    aprPct: s.apr,
    socials: { x: "https://x.com", telegram: "https://t.me", website: "https://example.com" },
  } satisfies TokenMarket;
});

export function getToken(address: string): TokenMarket | undefined {
  return MOCK_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

export function trendingTokens(): TokenMarket[] {
  return [...MOCK_TOKENS].sort((a, b) => b.volume24hRh - a.volume24hRh);
}

export function newestTokens(): TokenMarket[] {
  return [...MOCK_TOKENS].sort((a, b) => b.createdAt - a.createdAt);
}

export function graduatingTokens(): TokenMarket[] {
  return [...MOCK_TOKENS]
    .filter((t) => !t.graduated)
    .sort((a, b) => b.graduationProgress - a.graduationProgress);
}

export function mockTrades(token: TokenMarket, count = 12): Trade[] {
  const traders = ["fang", "loop", "diamond", "paperhand", "whale", "ape", "robin"];
  return Array.from({ length: count }, (_, i) => {
    const isBuy = (i * 7 + token.symbol.length) % 3 !== 0;
    const rhAmount = 0.2 + ((i * 13) % 40) / 10;
    return {
      id: `${token.symbol}-${i}`,
      trader: addr(traders[i % traders.length] + i),
      isBuy,
      rhAmount,
      tokenAmount: rhAmount / token.priceRh,
      time: now() - i * 137,
    } satisfies Trade;
  });
}

export function mockHolders(token: TokenMarket, count = 8): Holder[] {
  return Array.from({ length: count }, (_, i) => {
    const sharePct = Math.max(0.4, 22 / (i + 1) - i * 0.8);
    return {
      address: addr(token.symbol + "holder" + i),
      balance: MOCK_SUPPLY * (sharePct / 100),
      sharePct,
      // Fees accrued to this holder so far, ~proportional to their share of the pool.
      claimableRh: (token.rewardsPoolRh * sharePct) / 100,
    } satisfies Holder;
  });
}

export function mockRewardPositions(): RewardPosition[] {
  return [MOCK_TOKENS[0], MOCK_TOKENS[3], MOCK_TOKENS[6]].map((token, i) => ({
    token,
    balance: MOCK_SUPPLY * [0.012, 0.004, 0.02][i],
    claimableRh: [0.09, 0.031, 0.18][i],
  }) satisfies RewardPosition);
}

export function globalStats() {
  const totalLiq = MOCK_TOKENS.reduce((s, t) => s + t.liquidityRh, 0);
  const totalPool = MOCK_TOKENS.reduce((s, t) => s + t.rewardsPoolRh, 0);
  const totalVol = MOCK_TOKENS.reduce((s, t) => s + t.volume24hRh, 0);
  return {
    tokens: MOCK_TOKENS.length,
    liquidityLocked: totalLiq,
    rewardsPaid: totalPool,
    volume24h: totalVol,
    graduated: MOCK_TOKENS.filter((t) => t.graduated).length,
  };
}
