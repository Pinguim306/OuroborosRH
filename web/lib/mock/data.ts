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

interface Seed {
  name: string;
  symbol: string;
  image: string;
  description: string;
  price: number;
  mcap: number;
  vol: number;
  liq: number;
  holders: number;
  progress: number;
  graduated: boolean;
  pool: number;
  apr: number;
  ageHours: number;
}

const SEEDS: Seed[] = [
  { name: "Snake Oil", symbol: "SSSS", image: "🐍", description: "The original ouroboros meme. It literally never sells the tail.", price: 0.000042, mcap: 84000, vol: 21000, liq: 39000, holders: 1240, progress: 0.72, graduated: false, pool: 5100, apr: 141, ageHours: 6 },
  { name: "Loop Cat", symbol: "LOOP", image: "🐈", description: "A cat chasing its own liquidity. Purr-petual motion.", price: 0.00018, mcap: 210000, vol: 88000, liq: 96000, holders: 3410, progress: 1, graduated: true, pool: 18400, apr: 96, ageHours: 52 },
  { name: "Diamond Fangs", symbol: "FANG", image: "💎", description: "Loyalty pays. The longer you hold, the harder the bite.", price: 0.0000091, mcap: 18200, vol: 6400, liq: 8100, holders: 420, progress: 0.31, graduated: false, pool: 900, apr: 220, ageHours: 2 },
  { name: "Robin Rocket", symbol: "RRKT", image: "🚀", description: "Fueled entirely by recycled fees. To the loop and beyond.", price: 0.00006, mcap: 120000, vol: 54000, liq: 61000, holders: 2110, progress: 0.88, graduated: false, pool: 9200, apr: 112, ageHours: 14 },
  { name: "Venom", symbol: "VNM", image: "🟢", description: "Acid-green tokenomics. Every swap deepens the pool.", price: 0.00033, mcap: 330000, vol: 130000, liq: 150000, holders: 5020, progress: 1, graduated: true, pool: 41000, apr: 74, ageHours: 120 },
  { name: "Tail End", symbol: "TAIL", image: "🌀", description: "Where the fees come home to roost. Or coil.", price: 0.0000027, mcap: 5400, vol: 2100, liq: 2600, holders: 132, progress: 0.12, graduated: false, pool: 210, apr: 310, ageHours: 1 },
  { name: "Feather", symbol: "FTHR", image: "🪶", description: "Light on supply, heavy on loyalty rewards.", price: 0.00009, mcap: 90000, vol: 32000, liq: 44000, holders: 1560, progress: 0.61, graduated: false, pool: 3800, apr: 128, ageHours: 9 },
  { name: "Hood Money", symbol: "HOOD", image: "💵", description: "Fees in, liquidity out, holders paid. Simple.", price: 0.00021, mcap: 260000, vol: 105000, liq: 118000, holders: 4300, progress: 0.95, graduated: false, pool: 15600, apr: 88, ageHours: 30 },
];

export const MOCK_TOKENS: TokenMarket[] = SEEDS.map((s, i) => {
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
    priceRh: s.price,
    marketCapRh: s.mcap,
    volume24hRh: s.vol,
    liquidityRh: s.liq,
    holders: s.holders,
    graduationProgress: s.progress,
    graduated: s.graduated,
    rewardsPoolRh: s.pool,
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
      balance: (token.marketCapRh / token.priceRh) * (sharePct / 100),
      sharePct,
      // Fees accrued to this holder so far, ~proportional to their share of the pool.
      claimableRh: (token.rewardsPoolRh * sharePct) / 100,
    } satisfies Holder;
  });
}

export function mockRewardPositions(): RewardPosition[] {
  return [MOCK_TOKENS[0], MOCK_TOKENS[3], MOCK_TOKENS[6]].map((token, i) => ({
    token,
    balance: (token.marketCapRh / token.priceRh) * [0.012, 0.004, 0.02][i],
    claimableRh: [3.42, 1.18, 6.71][i],
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
