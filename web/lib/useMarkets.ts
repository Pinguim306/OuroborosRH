"use client";

import { useMemo } from "react";
import { formatEther } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, LIVE, launchpadAbi, curveAbi, tokenAbi } from "./contracts";
import type { Address, TokenMarket } from "./types";

/**
 * Live on-chain read hooks. When contracts are deployed (LIVE), these read the
 * launchpad + curves + tokens and map them into the UI's TokenMarket shape.
 * Fields that need an off-chain indexer (24h volume, holder count, APR) are left
 * at 0 — wire an indexer/subgraph later to fill them.
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

function imageFrom(metadataURI: string): string {
  // Image URLs (uploaded to IPFS or a remote host) render as an <img>; short
  // metadata renders as an emoji badge; otherwise a default coin.
  if (metadataURI.startsWith("http") || metadataURI.startsWith("ipfs://")) return metadataURI;
  if (metadataURI && metadataURI.length <= 6) return metadataURI;
  return "🪙";
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

const STATS_PER_MARKET = 7;

const asAddr = (x: unknown): Address | undefined =>
  typeof x === "string" && x.startsWith("0x") ? (x as Address) : undefined;

/** Read all launchpad markets + their on-chain stats. */
export function useLiveMarkets(): { tokens: TokenMarket[]; isLoading: boolean } {
  const marketsQ = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "getMarkets",
    args: [0n, 50n],
    query: { enabled: LIVE },
  });

  const markets = useMemo(
    () => (marketsQ.data ?? []) as readonly MarketTuple[],
    [marketsQ.data],
  );

  const contracts = useMemo(
    () =>
      markets.flatMap((m) => [
        { address: m.curve, abi: curveAbi, functionName: "currentPrice" } as const,
        { address: m.curve, abi: curveAbi, functionName: "graduationProgress" } as const,
        { address: m.curve, abi: curveAbi, functionName: "graduated" } as const,
        { address: m.curve, abi: curveAbi, functionName: "realNativeRaised" } as const,
        { address: m.token, abi: tokenAbi, functionName: "totalRewardsDistributed" } as const,
        { address: m.token, abi: tokenAbi, functionName: "totalSupply" } as const,
        { address: m.curve, abi: curveAbi, functionName: "pair" } as const,
      ]),
    [markets],
  );

  const statsQ = useReadContracts({
    contracts,
    query: { enabled: LIVE && markets.length > 0 },
  });

  const tokens = useMemo(() => {
    if (!statsQ.data) return [];
    return markets.map((m, i) => {
      const b = i * STATS_PER_MARKET;
      const r = statsQ.data!;
      return mapToken(
        m,
        bn(r[b]?.result),
        bn(r[b + 1]?.result),
        Boolean(r[b + 2]?.result),
        bn(r[b + 3]?.result),
        bn(r[b + 4]?.result),
        bn(r[b + 5]?.result),
        asAddr(r[b + 6]?.result),
      );
    });
  }, [markets, statsQ.data]);

  return { tokens, isLoading: marketsQ.isLoading || statsQ.isLoading };
}

/** Read a single token/curve by token address. */
export function useLiveToken(tokenAddress?: Address): {
  token: TokenMarket | undefined;
  isLoading: boolean;
  notFound: boolean;
} {
  const idxQ = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "marketIndexByToken",
    args: [tokenAddress ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: LIVE && !!tokenAddress },
  });
  const idx = bn(idxQ.data);
  const exists = idx > 0n;

  const marketQ = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "markets",
    args: [exists ? idx - 1n : 0n],
    query: { enabled: LIVE && exists },
  });
  const market = marketQ.data as
    | readonly [Address, Address, Address, string, string, string, bigint]
    | undefined;

  const curve = market?.[1];
  const token = market?.[0];

  const statsQ = useReadContracts({
    contracts: [
      { address: curve, abi: curveAbi, functionName: "currentPrice" },
      { address: curve, abi: curveAbi, functionName: "graduationProgress" },
      { address: curve, abi: curveAbi, functionName: "graduated" },
      { address: curve, abi: curveAbi, functionName: "realNativeRaised" },
      { address: token, abi: tokenAbi, functionName: "totalRewardsDistributed" },
      { address: token, abi: tokenAbi, functionName: "totalSupply" },
      { address: curve, abi: curveAbi, functionName: "pair" },
    ],
    query: { enabled: LIVE && !!curve && !!token },
  });

  const mapped = useMemo(() => {
    if (!market || !statsQ.data) return undefined;
    const r = statsQ.data;
    const m: MarketTuple = {
      token: market[0],
      curve: market[1],
      creator: market[2],
      name: market[3],
      symbol: market[4],
      metadataURI: market[5],
      createdAt: market[6],
    };
    return mapToken(
      m,
      bn(r[0]?.result),
      bn(r[1]?.result),
      Boolean(r[2]?.result),
      bn(r[3]?.result),
      bn(r[4]?.result),
      bn(r[5]?.result),
      asAddr(r[6]?.result),
    );
  }, [market, statsQ.data]);

  return {
    token: mapped,
    isLoading: idxQ.isLoading || marketQ.isLoading || statsQ.isLoading,
    notFound: LIVE && !idxQ.isLoading && !exists,
  };
}
