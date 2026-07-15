"use client";

import { useMemo } from "react";
import { formatEther } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, LAUNCHPADS, LIVE, launchpadAbi, curveAbi, tokenAbi, v3PoolAbi } from "./contracts";
import type { Address, TokenMarket } from "./types";

/**
 * Live on-chain read hooks. Markets are read from EVERY configured launchpad
 * (comma-separated NEXT_PUBLIC_LAUNCHPAD_ADDRESS) and merged newest-first, so a
 * contract upgrade never wipes the listings. Two market modes:
 *   - curve: Market.curve is a BondingCurve (price/progress/graduation reads);
 *   - v3:    Market.curve is a Uniswap V3 pool (price derived from slot0).
 * Mode is flagged by the launchpad's isV3Token (older launchpads lack the getter,
 * so their reads fail -> curve mode, which is correct for them).
 */

interface MarketTuple {
  token: Address;
  curve: Address;
  creator: Address;
  name: string;
  symbol: string;
  metadataURI: string;
  createdAt: bigint;
}

const bn = (x: unknown): bigint => (typeof x === "bigint" ? x : 0n);
const num = (x: unknown): number => Number(formatEther(bn(x)));

/**
 * Token addresses to hide from the listings (Discover, home). Set as a comma-
 * separated list in NEXT_PUBLIC_HIDDEN_TOKENS. This only filters the lists — the
 * tokens still exist on-chain and their /token/<address> page still works.
 */
const HIDDEN_TOKENS = new Set(
  (process.env.NEXT_PUBLIC_HIDDEN_TOKENS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Hidden time cutoff: any token launched BEFORE this instant is dropped from the listings, so old
 * contracts can be swept off the site without touching code. Set NEXT_PUBLIC_HIDE_TOKENS_BEFORE in
 * the Vercel env to either a unix timestamp (seconds; 13-digit millis are accepted too) or a date
 * string like `2026-07-15` / `2026-07-15T00:00:00Z`. Empty/unset = no cutoff. Like
 * NEXT_PUBLIC_HIDDEN_TOKENS this only filters the lists — each token's /token/<address> page still
 * works.
 */
function parseCutoff(raw?: string): number {
  const v = (raw ?? "").trim();
  if (!v) return 0;
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n > 1e12 ? Math.floor(n / 1000) : n; // treat 13-digit values as milliseconds
  }
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

const HIDE_BEFORE = parseCutoff(process.env.NEXT_PUBLIC_HIDE_TOKENS_BEFORE);

const isHidden = (t: TokenMarket): boolean =>
  HIDDEN_TOKENS.has(t.address.toLowerCase()) ||
  (HIDE_BEFORE > 0 && t.createdAt > 0 && t.createdAt < HIDE_BEFORE);

function imageFrom(metadataURI: string): string {
  // Image URLs (uploaded to IPFS or a remote host) render as an <img>; short
  // metadata renders as an emoji badge; otherwise a default coin.
  if (metadataURI.startsWith("http") || metadataURI.startsWith("ipfs://")) return metadataURI;
  if (metadataURI && metadataURI.length <= 6) return metadataURI;
  return "🪙";
}

/** Price of the launched token in ETH from a V3 pool's slot0 (both sides 18 dec). */
function v3PriceFromSlot0(slot0: unknown, tokenIs0: boolean): number {
  const arr = slot0 as readonly [bigint, ...unknown[]] | undefined;
  const sq = arr?.[0];
  if (typeof sq !== "bigint" || sq === 0n) return 0;
  const ratio = Number(sq) / 2 ** 96; // sqrt(token1/token0)
  const price1per0 = ratio * ratio;
  return tokenIs0 ? price1per0 : price1per0 > 0 ? 1 / price1per0 : 0;
}

function mapToken(
  m: MarketTuple,
  price: bigint,
  progress: bigint,
  graduated: boolean,
  realNative: bigint,
  rewardsPool: bigint,
  supply: bigint,
  pair?: Address,
): TokenMarket {
  const priceRh = num(price);
  const supplyN = num(supply);
  return {
    address: m.token,
    curve: m.curve,
    rewards: m.token, // the token is the dividend vault
    pair,
    name: m.name,
    symbol: m.symbol,
    description: m.metadataURI.startsWith("http") ? "" : "",
    image: imageFrom(m.metadataURI),
    creator: m.creator,
    createdAt: Number(m.createdAt),
    priceRh,
    marketCapRh: priceRh * supplyN,
    volume24hRh: 0, // needs an indexer
    liquidityRh: num(realNative),
    holders: 0, // needs an indexer
    graduationProgress: Number(bn(progress)) / 1e18,
    graduated,
    rewardsPoolRh: num(rewardsPool),
    aprPct: 0, // needs an indexer
  };
}

/** Per-market batched reads. Failing reads resolve to undefined and are harmless:
 *  curve getters fail on V3 pools, slot0 fails on curves, isV3Token fails on old
 *  launchpads — each side of the fork only trusts its own reads. */
const STATS_PER_MARKET = 10;

function statsCalls(m: MarketTuple, launchpad: Address) {
  return [
    { address: m.curve, abi: curveAbi, functionName: "currentPrice" } as const,
    { address: m.curve, abi: curveAbi, functionName: "graduationProgress" } as const,
    { address: m.curve, abi: curveAbi, functionName: "graduated" } as const,
    { address: m.curve, abi: curveAbi, functionName: "realNativeRaised" } as const,
    { address: m.token, abi: tokenAbi, functionName: "totalRewardsDistributed" } as const,
    { address: m.token, abi: tokenAbi, functionName: "totalSupply" } as const,
    { address: m.curve, abi: curveAbi, functionName: "pair" } as const,
    { address: launchpad, abi: launchpadAbi, functionName: "isV3Token", args: [m.token] } as const,
    { address: m.curve, abi: v3PoolAbi, functionName: "slot0" } as const,
    // Fails (→ false) on v1 launchpads, which predate the Creator Rewards mode.
    { address: launchpad, abi: launchpadAbi, functionName: "isCreatorFeeToken", args: [m.token] } as const,
  ];
}

const asAddr = (x: unknown): Address | undefined =>
  typeof x === "string" && x.startsWith("0x") ? (x as Address) : undefined;

function fromStats(
  m: MarketTuple,
  launchpad: Address,
  r: readonly { result?: unknown }[],
  b: number,
  weth?: Address,
): TokenMarket {
  const t = mapToken(
    m,
    bn(r[b]?.result),
    bn(r[b + 1]?.result),
    Boolean(r[b + 2]?.result),
    bn(r[b + 3]?.result),
    bn(r[b + 4]?.result),
    bn(r[b + 5]?.result),
    asAddr(r[b + 6]?.result),
  );
  t.launchpad = launchpad;
  t.creatorFees = Boolean(r[b + 9]?.result);
  const isV3 = Boolean(r[b + 7]?.result);
  if (isV3) {
    t.mode = "v3";
    t.pair = m.curve; // the pool doubles as the DexScreener pair
    const tokenIs0 = weth ? m.token.toLowerCase() < weth.toLowerCase() : true;
    t.priceRh = v3PriceFromSlot0(r[b + 8]?.result, tokenIs0);
    const supplyN = num(bn(r[b + 5]?.result));
    t.marketCapRh = t.priceRh * supplyN;
  } else {
    t.mode = "curve";
  }
  return t;
}

/** Read all markets from every configured launchpad + their on-chain stats. */
export function useLiveMarkets(): { tokens: TokenMarket[]; isLoading: boolean } {
  const marketsQ = useReadContracts({
    contracts: LAUNCHPADS.map(
      (lp) =>
        ({ address: lp, abi: launchpadAbi, functionName: "getMarkets", args: [0n, 50n] }) as const,
    ),
    query: { enabled: LIVE },
  });

  const wethQ = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "weth",
    query: { enabled: LIVE },
  });
  const weth = asAddr(wethQ.data);

  // Merge every launchpad's page, tagging each market with its launchpad.
  const markets = useMemo(() => {
    const out: { m: MarketTuple; launchpad: Address }[] = [];
    (marketsQ.data ?? []).forEach((res, i) => {
      const page = (res?.result ?? []) as readonly MarketTuple[];
      for (const m of page) out.push({ m, launchpad: LAUNCHPADS[i] });
    });
    out.sort((a, b) => Number(b.m.createdAt) - Number(a.m.createdAt));
    return out;
  }, [marketsQ.data]);

  const contracts = useMemo(
    () => markets.flatMap(({ m, launchpad }) => statsCalls(m, launchpad)),
    [markets],
  );

  const statsQ = useReadContracts({
    contracts,
    query: { enabled: LIVE && markets.length > 0 },
  });

  const tokens = useMemo(() => {
    if (!statsQ.data) return [];
    const r = statsQ.data;
    return markets
      .map(({ m, launchpad }, i) => fromStats(m, launchpad, r, i * STATS_PER_MARKET, weth))
      .filter((t) => !isHidden(t));
  }, [markets, statsQ.data, weth]);

  return { tokens, isLoading: marketsQ.isLoading || statsQ.isLoading };
}

/** Read a single token/curve by token address, searching every launchpad. */
export function useLiveToken(tokenAddress?: Address): {
  token: TokenMarket | undefined;
  isLoading: boolean;
  notFound: boolean;
} {
  const zero = "0x0000000000000000000000000000000000000000" as Address;

  const idxQ = useReadContracts({
    contracts: LAUNCHPADS.map(
      (lp) =>
        ({
          address: lp,
          abi: launchpadAbi,
          functionName: "marketIndexByToken",
          args: [tokenAddress ?? zero],
        }) as const,
    ),
    query: { enabled: LIVE && !!tokenAddress },
  });

  // First launchpad that knows this token wins.
  const found = useMemo(() => {
    const rs = idxQ.data ?? [];
    for (let i = 0; i < rs.length; i++) {
      const idx = bn(rs[i]?.result);
      if (idx > 0n) return { launchpad: LAUNCHPADS[i], idx };
    }
    return undefined;
  }, [idxQ.data]);

  const marketQ = useReadContract({
    address: found?.launchpad ?? zero,
    abi: launchpadAbi,
    functionName: "markets",
    args: [found ? found.idx - 1n : 0n],
    query: { enabled: LIVE && !!found },
  });
  const market = marketQ.data as
    | readonly [Address, Address, Address, string, string, string, bigint]
    | undefined;

  const wethQ = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "weth",
    query: { enabled: LIVE },
  });
  const weth = asAddr(wethQ.data);

  const tuple: MarketTuple | undefined = useMemo(
    () =>
      market
        ? {
            token: market[0],
            curve: market[1],
            creator: market[2],
            name: market[3],
            symbol: market[4],
            metadataURI: market[5],
            createdAt: market[6],
          }
        : undefined,
    [market],
  );

  const statsQ = useReadContracts({
    contracts: tuple && found ? statsCalls(tuple, found.launchpad) : [],
    query: { enabled: LIVE && !!tuple && !!found },
  });

  const mapped = useMemo(() => {
    if (!tuple || !found || !statsQ.data) return undefined;
    return fromStats(tuple, found.launchpad, statsQ.data, 0, weth);
  }, [tuple, found, statsQ.data, weth]);

  return {
    token: mapped,
    isLoading: idxQ.isLoading || marketQ.isLoading || statsQ.isLoading,
    notFound: LIVE && !idxQ.isLoading && !found,
  };
}
