"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import {
  curveAbi,
  tokenAbi,
  v3PoolAbi,
  launchpadAbi,
  CONTRACTS,
  LIVE,
  LAUNCHPADS,
  COIL_LAUNCHPAD,
  COIL_SWAP_ROUTER,
  COIL_SWAP_ROUTER_V3,
  COIL_BURNER,
  coilPoolId,
  v4PoolManagerAbi,
} from "./contracts";
import { ROBINHOOD_CONTRACTS } from "./chain";
import { isHiddenMarket } from "./useMarkets";
import type { Address, Holder, TokenMarket, Trade } from "./types";

/**
 * Reads on-chain activity directly from contract events (no indexer needed).
 * Best-effort over full history; failures degrade to empty. An indexer/subgraph
 * would scale better for many tokens / high volume.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const DAY = 24 * 3600;

export function supplyOf(token: TokenMarket): number {
  return token.priceRh > 0 ? token.marketCapRh / token.priceRh : 1_000_000_000;
}

/** One V3 pool Swap normalized to the same shape as a curve Trade. */
export interface ParsedSwap {
  bn: bigint;
  ethAmount: number; // absolute ETH notional of the swap
  tokenAmount: number;
  mcap: number; // implied marketcap (ETH) after the swap
  isBuy: boolean;
  trader: Address;
  id: string;
}

/**
 * Decode a Uniswap V3 Swap log. Amounts are the pool's deltas (negative = out of
 * the pool): a buy pulls tokens out (token delta < 0) and pushes ETH in.
 * sqrtPriceX96 gives the post-swap price, oriented by token0/token1 sort order.
 */
export function parseV3Swap(
  l: { args: unknown; blockNumber: bigint; transactionHash: string; logIndex: number },
  tokenIs0: boolean,
  supply: number,
): ParsedSwap {
  const a = l.args as {
    sender?: Address;
    recipient?: Address;
    amount0?: bigint;
    amount1?: bigint;
    sqrtPriceX96?: bigint;
  };
  const amtTok = (tokenIs0 ? a.amount0 : a.amount1) ?? 0n;
  const amtEth = (tokenIs0 ? a.amount1 : a.amount0) ?? 0n;
  const ratio = Number(a.sqrtPriceX96 ?? 0n) / 2 ** 96;
  const p10 = ratio * ratio; // token1-per-token0 after the swap
  const price = tokenIs0 ? p10 : p10 > 0 ? 1 / p10 : 0;
  return {
    bn: l.blockNumber,
    ethAmount: Number(formatEther(amtEth < 0n ? -amtEth : amtEth)),
    tokenAmount: Number(formatEther(amtTok < 0n ? -amtTok : amtTok)),
    mcap: price * supply,
    isBuy: amtTok < 0n,
    trader: (a.recipient ?? a.sender ?? ZERO) as Address,
    id: `${l.transactionHash}-${l.logIndex}`,
  };
}

/** The v4 PoolManager singleton — every v4 pool's Swap events are emitted here, keyed by PoolId. */
export const V4_POOL_MANAGER = ROBINHOOD_CONTRACTS.v4PoolManager as Address;

/**
 * Decode a Uniswap v4 PoolManager Swap log for a Coil pool (currency0 = ETH, currency1 = token).
 * Amounts are the swapper's balance deltas: on a buy the user pays ETH (amount0 < 0) and receives
 * tokens (amount1 > 0). sqrtPriceX96 is the post-swap price; tokens-per-ETH = (sqrtP/2^96)^2.
 */
export function parseV4Swap(
  l: { args: unknown; blockNumber: bigint; transactionHash: string; logIndex: number },
  supply: number,
): ParsedSwap {
  const a = l.args as {
    sender?: Address;
    amount0?: bigint;
    amount1?: bigint;
    sqrtPriceX96?: bigint;
  };
  const amtEth = a.amount0 ?? 0n;
  const amtTok = a.amount1 ?? 0n;
  const ratio = Number(a.sqrtPriceX96 ?? 0n) / 2 ** 96;
  const tokensPerEth = ratio * ratio;
  const price = tokensPerEth > 0 ? 1 / tokensPerEth : 0;
  return {
    bn: l.blockNumber,
    ethAmount: Number(formatEther(amtEth < 0n ? -amtEth : amtEth)),
    tokenAmount: Number(formatEther(amtTok < 0n ? -amtTok : amtTok)),
    mcap: price * supply,
    isBuy: amtTok > 0n, // the user received tokens
    trader: (a.sender ?? ZERO) as Address, // the router — refined via token Transfers per tx
    id: `${l.transactionHash}-${l.logIndex}`,
  };
}

/**
 * Addresses that execute swaps on users' behalf or custody liquidity (routers, aggregators,
 * launchpads, pool singletons, the burner). Swap/Transfer events carry these as sender/recipient
 * on relayed legs, so they must never be credited as traders on boards. Built from the deployed
 * platform contracts (env-configured) plus known third-party routers. Lowercase.
 */
export const INFRA_ADDRESSES = new Set(
  [
    "0xCaf681a66D020601342297493863E78C959E5cb2", // Uniswap SwapRouter02 (chain 4663)
    "0x8876789976dEcBfCbBbe364623C63652db8C0904", // Uniswap UniversalRouter (chain 4663)
    "0x65050A9b7E5075A2bA5cED7b1b64EE66262c40Dc", // router/aggregator seen relaying user swaps
    ZERO,
    DEAD,
    // Coil platform contracts — routers relay user swaps, the rest custody funds.
    COIL_SWAP_ROUTER,
    COIL_SWAP_ROUTER_V3,
    COIL_LAUNCHPAD,
    COIL_BURNER,
    ...LAUNCHPADS,
    ...Object.values(ROBINHOOD_CONTRACTS),
  ]
    .map((a) => String(a).toLowerCase())
    .filter((a) => a.startsWith("0x")),
);

/** Routers that PULL the seller's tokens into themselves before settling with the pool
 *  (user → router → pool). The pool-side Transfer then names the router, so the real wallet is
 *  the same-tx Transfer INTO the router. */
export const RELAYER_ROUTERS = [
  COIL_SWAP_ROUTER,
  COIL_SWAP_ROUTER_V3,
  "0xCaf681a66D020601342297493863E78C959E5cb2" as Address, // SwapRouter02
  "0x8876789976dEcBfCbBbe364623C63652db8C0904" as Address, // UniversalRouter
].filter((a) => a.toLowerCase() !== ZERO);

/**
 * Resolve the real wallet behind each V3 swap of a pool. The Swap event's
 * sender/recipient is whatever router relayed the trade, but the launched
 * token's Transfer in the same transaction touches the actual wallet:
 * pool → wallet on buys, wallet → pool on sells.
 */
export async function v3TradersByTx(
  client: PublicClient,
  token: Address,
  pool: Address,
): Promise<{ buyerByTx: Map<string, Address>; sellerByTx: Map<string, Address> }> {
  const buyerByTx = new Map<string, Address>();
  const sellerByTx = new Map<string, Address>();
  try {
    const [outOfPool, intoPool] = await Promise.all([
      client.getContractEvents({
        address: token,
        abi: tokenAbi,
        eventName: "Transfer",
        args: { from: pool },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client.getContractEvents({
        address: token,
        abi: tokenAbi,
        eventName: "Transfer",
        args: { to: pool },
        fromBlock: 0n,
        toBlock: "latest",
      }),
    ]);
    for (const l of outOfPool) {
      const to = (l.args as { to?: Address }).to;
      if (to && !INFRA_ADDRESSES.has(to.toLowerCase())) buyerByTx.set(l.transactionHash, to);
    }
    for (const l of intoPool) {
      const from = (l.args as { from?: Address }).from;
      if (from && !INFRA_ADDRESSES.has(from.toLowerCase())) sellerByTx.set(l.transactionHash, from);
    }

    // Relayed legs: Coil's routers pull the seller's tokens into themselves before settling
    // (user → router → pool), so the pool-side Transfer names the router. The same-tx Transfer
    // into/out of the router names the real wallet — use it wherever the direct pass drew a blank.
    const [intoRouter, outOfRouter] = await Promise.all([
      client.getContractEvents({
        address: token,
        abi: tokenAbi,
        eventName: "Transfer",
        args: { to: RELAYER_ROUTERS },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client.getContractEvents({
        address: token,
        abi: tokenAbi,
        eventName: "Transfer",
        args: { from: RELAYER_ROUTERS },
        fromBlock: 0n,
        toBlock: "latest",
      }),
    ]);
    for (const l of intoRouter) {
      const from = (l.args as { from?: Address }).from;
      if (
        from &&
        !INFRA_ADDRESSES.has(from.toLowerCase()) &&
        !sellerByTx.has(l.transactionHash)
      )
        sellerByTx.set(l.transactionHash, from);
    }
    for (const l of outOfRouter) {
      const to = (l.args as { to?: Address }).to;
      if (to && !INFRA_ADDRESSES.has(to.toLowerCase()) && !buyerByTx.has(l.transactionHash))
        buyerByTx.set(l.transactionHash, to);
    }
  } catch {
    /* fall back to the Swap event's own addresses */
  }
  return { buyerByTx, sellerByTx };
}

/** The launchpad's WETH address — needed to orient V3 pool swaps. */
export async function wethOf(client: PublicClient): Promise<string | undefined> {
  try {
    const w = await client.readContract({
      address: CONTRACTS.launchpad,
      abi: launchpadAbi,
      functionName: "weth",
    });
    return typeof w === "string" ? w : undefined;
  } catch {
    return undefined;
  }
}

/** Estimate the block ~`secondsAgo` in the past by sampling recent block times. */
async function cutoffBlock(client: PublicClient, secondsAgo: number): Promise<bigint> {
  try {
    const latestNum = await client.getBlockNumber();
    const sample = latestNum > 5000n ? 5000n : latestNum;
    const [latest, older] = await Promise.all([
      client.getBlock({ blockNumber: latestNum }),
      client.getBlock({ blockNumber: latestNum - sample }),
    ]);
    const dt = Number(latest.timestamp - older.timestamp);
    const nblocks = Number(sample);
    const spb = nblocks > 0 && dt > 0 ? dt / nblocks : 2;
    const back = BigInt(Math.max(1, Math.floor(secondsAgo / spb)));
    return latestNum > back ? latestNum - back : 0n;
  } catch {
    return 0n;
  }
}

/** A candlestick point. Time is unix seconds; O/H/L/C are marketcap in ETH. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Latest block number/timestamp + estimated seconds-per-block, sampled once. */
export async function blockClock(
  client: PublicClient,
): Promise<{ latestNum: bigint; latestTs: number; spb: number }> {
  const latestNum = await client.getBlockNumber();
  const sample = latestNum > 5000n ? 5000n : latestNum;
  const [latest, older] = await Promise.all([
    client.getBlock({ blockNumber: latestNum }),
    client.getBlock({ blockNumber: latestNum - sample }),
  ]);
  const dt = Number(latest.timestamp - older.timestamp);
  const n = Number(sample);
  const spb = n > 0 && dt > 0 ? dt / n : 2;
  return { latestNum, latestTs: Number(latest.timestamp), spb };
}

/** Round a raw seconds span to a "nice" candle interval. */
function niceInterval(seconds: number): number {
  const steps = [60, 300, 900, 1800, 3600, 14400, 43200, 86400, 604800];
  for (const s of steps) if (seconds <= s) return s;
  return steps[steps.length - 1];
}

/** Bucket time-stamped marketcap points into ~80 OHLC candles. */
function buildCandles(points: { t: number; v: number }[]): Candle[] {
  if (points.length === 0) return [];
  points.sort((a, b) => a.t - b.t);
  const span = points[points.length - 1].t - points[0].t;
  const interval = niceInterval(span > 0 ? span / 80 : 60);
  const map = new Map<number, Candle>();
  for (const p of points) {
    const bucket = Math.floor(p.t / interval) * interval;
    const c = map.get(bucket);
    if (!c) map.set(bucket, { time: bucket, open: p.v, high: p.v, low: p.v, close: p.v });
    else {
      c.high = Math.max(c.high, p.v);
      c.low = Math.min(c.low, p.v);
      c.close = p.v;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export interface Activity {
  trades: Trade[];
  volume24hEth: number;
  athMcapEth: number;
  series: number[]; // marketcap (ETH) per trade — for the chart
  candles: Candle[]; // OHLC marketcap (ETH) for the candlestick chart
  isLoading: boolean;
}

const EMPTY: Activity = {
  trades: [],
  volume24hEth: 0,
  athMcapEth: 0,
  series: [],
  candles: [],
  isLoading: LIVE,
};

export function useTokenActivity(token?: TokenMarket): Activity {
  const client = usePublicClient();
  const [data, setData] = useState<Activity>(EMPTY);
  const curve = token?.curve;

  useEffect(() => {
    if (!LIVE || !client || !token || !curve) {
      setData({ ...EMPTY, isLoading: false });
      return;
    }
    let alive = true;
    (async () => {
      try {
        const clock = await blockClock(client);
        const back = BigInt(Math.max(1, Math.floor(DAY / clock.spb)));
        const cutoff = clock.latestNum > back ? clock.latestNum - back : 0n;
        const supply = supplyOf(token);

        // One normalized shape for all sources: bonding-curve Trade events, a V3 pool's Swap
        // events, or — for v4 tokens — the PoolManager's Swap events filtered by PoolId.
        const parsed: { trade: Trade; mcap: number; bn: bigint }[] = [];

        if (token.mode === "v4") {
          const [logs, traders] = await Promise.all([
            client.getContractEvents({
              address: V4_POOL_MANAGER,
              abi: v4PoolManagerAbi,
              eventName: "Swap",
              args: { id: coilPoolId(token.address) },
              fromBlock: 0n,
              toBlock: "latest",
            }),
            // v4 token balances move PoolManager ↔ wallet, so the same Transfer-based wallet
            // resolution used for V3 pools works with the PoolManager as the "pool".
            v3TradersByTx(client, token.address, V4_POOL_MANAGER),
          ]);
          for (const l of logs) {
            const s = parseV4Swap(l, supply);
            const wallet = s.isBuy
              ? traders.buyerByTx.get(l.transactionHash)
              : traders.sellerByTx.get(l.transactionHash);
            parsed.push({
              bn: s.bn,
              mcap: s.mcap,
              trade: {
                id: s.id,
                trader: wallet ?? s.trader,
                isBuy: s.isBuy,
                rhAmount: s.ethAmount,
                tokenAmount: s.tokenAmount,
                time: 0,
              },
            });
          }
        } else if (token.mode === "v3") {
          const [logs, wethAddr, traders] = await Promise.all([
            client.getContractEvents({
              address: curve, // the pool
              abi: v3PoolAbi,
              eventName: "Swap",
              fromBlock: 0n,
              toBlock: "latest",
            }),
            wethOf(client),
            v3TradersByTx(client, token.address, curve),
          ]);
          const tokenIs0 = wethAddr ? token.address.toLowerCase() < wethAddr.toLowerCase() : true;
          for (const l of logs) {
            const s = parseV3Swap(l, tokenIs0, supply);
            // The Swap event names the router; the token Transfer in the same tx
            // names the actual wallet — prefer it.
            const wallet = s.isBuy
              ? traders.buyerByTx.get(l.transactionHash)
              : traders.sellerByTx.get(l.transactionHash);
            parsed.push({
              bn: s.bn,
              mcap: s.mcap,
              trade: {
                id: s.id,
                trader: wallet ?? s.trader,
                isBuy: s.isBuy,
                rhAmount: s.ethAmount,
                tokenAmount: s.tokenAmount,
                time: 0,
              },
            });
          }
        } else {
          const logs = await client.getContractEvents({
            address: curve,
            abi: curveAbi,
            eventName: "Trade",
            fromBlock: 0n,
            toBlock: "latest",
          });
          for (const l of logs) {
            const a = l.args as {
              trader: Address;
              isBuy: boolean;
              nativeAmount: bigint;
              tokenAmount: bigint;
              newPrice: bigint;
            };
            parsed.push({
              bn: l.blockNumber,
              mcap: Number(formatEther(a.newPrice ?? 0n)) * supply,
              trade: {
                id: `${l.transactionHash}-${l.logIndex}`,
                trader: a.trader,
                isBuy: a.isBuy,
                rhAmount: Number(formatEther(a.nativeAmount ?? 0n)),
                tokenAmount: Number(formatEther(a.tokenAmount ?? 0n)),
                time: 0,
              },
            });
          }
        }

        let vol24 = 0;
        let ath = 0;
        const series: number[] = [];
        const points: { t: number; v: number }[] = [];
        for (const p of parsed) {
          if (p.bn >= cutoff) vol24 += p.trade.rhAmount;
          if (p.mcap > ath) ath = p.mcap;
          series.push(p.mcap);
          // Estimate this trade's time from the sampled seconds-per-block.
          const estTime = clock.latestTs - Number(clock.latestNum - p.bn) * clock.spb;
          points.push({ t: Math.round(estTime), v: p.mcap });
        }

        const recentParsed = parsed.slice(-20).reverse();
        const recent = recentParsed.map((p) => p.trade);
        const uniqueBlocks = [...new Set(recentParsed.map((p) => p.bn))];
        const ts = new Map<bigint, number>();
        await Promise.all(
          uniqueBlocks.map(async (bn) => {
            try {
              const b = await client.getBlock({ blockNumber: bn });
              ts.set(bn, Number(b.timestamp));
            } catch {
              /* ignore */
            }
          }),
        );
        recent.forEach((t, i) => {
          t.time = ts.get(recentParsed[i].bn) ?? 0;
        });

        const candles = buildCandles(points);
        if (alive)
          setData({ trades: recent, volume24hEth: vol24, athMcapEth: ath, series, candles, isLoading: false });
      } catch {
        if (alive) setData({ ...EMPTY, isLoading: false });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, curve, token?.marketCapRh, token?.priceRh]);

  return data;
}

export interface MarketStat {
  volumeEth: number; // all-time
  volume24hEth: number;
  athEth: number;
  holders: number;
  lastBlock: number;
}

/** Per-token stats for the Discover list + launchpad totals. Polls periodically. */
export function useMarketsActivity(tokens: TokenMarket[]): Map<string, MarketStat> {
  const client = usePublicClient();
  const [stats, setStats] = useState<Map<string, MarketStat>>(new Map());
  const key = tokens.map((t) => t.address).join(",");

  useEffect(() => {
    if (!LIVE || !client || tokens.length === 0) return;
    let alive = true;
    async function load() {
      // Hidden tokens contribute nothing to per-token stats or the launchpad totals.
      const visible = tokens.filter((t) => !isHiddenMarket(t));
      // WETH is only needed to orient V3 pool swaps (token0 vs token1 sort order).
      const [cutoff, wethAddr] = await Promise.all([
        cutoffBlock(client!, DAY),
        visible.some((t) => t.mode === "v3") ? wethOf(client!) : Promise.resolve(undefined),
      ]);
      const next = new Map<string, MarketStat>();
      await Promise.all(
        visible.slice(0, 40).map(async (t) => {
          try {
            // Instant-V3 tokens have no curve — their trades are the Uniswap pool's Swap events
            // (t.curve holds the pool address for them). v4 tokens trade inside the PoolManager
            // singleton, whose Swap events are filtered by the token's PoolId.
            const [trades, transfers] = await Promise.all([
              t.mode === "v4"
                ? client!.getContractEvents({
                    address: V4_POOL_MANAGER,
                    abi: v4PoolManagerAbi,
                    eventName: "Swap",
                    args: { id: coilPoolId(t.address) },
                    fromBlock: 0n,
                    toBlock: "latest",
                  })
                : t.mode === "v3"
                  ? client!.getContractEvents({
                      address: t.curve,
                      abi: v3PoolAbi,
                      eventName: "Swap",
                      fromBlock: 0n,
                      toBlock: "latest",
                    })
                  : client!.getContractEvents({
                      address: t.curve,
                      abi: curveAbi,
                      eventName: "Trade",
                      fromBlock: 0n,
                      toBlock: "latest",
                    }),
              client!.getContractEvents({
                address: t.address,
                abi: tokenAbi,
                eventName: "Transfer",
                fromBlock: 0n,
                toBlock: "latest",
              }),
            ]);
            const supply = supplyOf(t);
            const tokenIs0 = wethAddr ? t.address.toLowerCase() < wethAddr.toLowerCase() : true;
            let vol = 0;
            let vol24 = 0;
            let ath = 0;
            let lastBlock = 0;
            for (const l of trades) {
              let nat: number;
              let mcap: number;
              if (t.mode === "v4") {
                const s = parseV4Swap(l, supply);
                nat = s.ethAmount;
                mcap = s.mcap;
              } else if (t.mode === "v3") {
                const s = parseV3Swap(l, tokenIs0, supply);
                nat = s.ethAmount;
                mcap = s.mcap;
              } else {
                const a = l.args as { nativeAmount?: bigint; newPrice?: bigint };
                nat = Number(formatEther(a.nativeAmount ?? 0n));
                mcap = Number(formatEther(a.newPrice ?? 0n)) * supply;
              }
              vol += nat;
              if (l.blockNumber >= cutoff) vol24 += nat;
              if (mcap > ath) ath = mcap;
              lastBlock = Number(l.blockNumber);
            }
            const bal = new Map<string, bigint>();
            for (const l of transfers) {
              const a = l.args as { from: Address; to: Address; value: bigint };
              if (a.from && a.from !== ZERO) bal.set(a.from, (bal.get(a.from) ?? 0n) - a.value);
              if (a.to && a.to !== ZERO) bal.set(a.to, (bal.get(a.to) ?? 0n) + a.value);
            }
            // The PoolManager holds every v4 pool's liquidity — never a "holder" (harmless for
            // curve/V3 tokens, which it never touches).
            const excluded = new Set([
              t.curve.toLowerCase(),
              DEAD,
              ZERO,
              t.address.toLowerCase(),
              V4_POOL_MANAGER.toLowerCase(),
            ]);
            let holders = 0;
            for (const [addr, v] of bal) if (v > 0n && !excluded.has(addr.toLowerCase())) holders++;
            next.set(t.address.toLowerCase(), { volumeEth: vol, volume24hEth: vol24, athEth: ath, holders, lastBlock });
          } catch {
            /* ignore */
          }
        }),
      );
      if (alive) setStats(next);
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  return stats;
}

export function useTokenHolders(token?: TokenMarket): { holders: Holder[]; isLoading: boolean } {
  const client = usePublicClient();
  const [state, setState] = useState<{ holders: Holder[]; isLoading: boolean }>({
    holders: [],
    isLoading: LIVE,
  });
  const addr = token?.address;

  useEffect(() => {
    if (!LIVE || !client || !token || !addr) {
      setState({ holders: [], isLoading: false });
      return;
    }
    let alive = true;
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: addr,
          abi: tokenAbi,
          eventName: "Transfer",
          fromBlock: 0n,
          toBlock: "latest",
        });
        const bal = new Map<string, bigint>();
        for (const l of logs) {
          const a = l.args as { from: Address; to: Address; value: bigint };
          if (a.from && a.from !== ZERO) bal.set(a.from, (bal.get(a.from) ?? 0n) - a.value);
          if (a.to && a.to !== ZERO) bal.set(a.to, (bal.get(a.to) ?? 0n) + a.value);
        }
        const excluded = new Set([
          token.curve.toLowerCase(),
          DEAD,
          ZERO,
          token.address.toLowerCase(),
          V4_POOL_MANAGER.toLowerCase(), // holds every v4 pool's liquidity — never a "holder"
        ]);
        const supply = supplyOf(token);
        const holders: Holder[] = [...bal.entries()]
          .filter(([a, v]) => v > 0n && !excluded.has(a.toLowerCase()))
          .map(([a, v]) => {
            const b = Number(formatEther(v));
            return {
              address: a as Address,
              balance: b,
              sharePct: supply > 0 ? (b / supply) * 100 : 0,
              claimableRh: 0,
            };
          })
          .sort((x, y) => y.balance - x.balance)
          .slice(0, 10);
        if (alive) setState({ holders, isLoading: false });
      } catch {
        if (alive) setState({ holders: [], isLoading: false });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, addr, token?.marketCapRh, token?.priceRh]);

  return state;
}

/** Aggregate launchpad totals from the per-token stats map. */
export function useLaunchpadTotals(tokens: TokenMarket[], stats: Map<string, MarketStat>) {
  return useMemo(() => {
    let volume24hEth = 0;
    let volumeEth = 0; // all-time, summed across every token
    let highestAthEth = 0;
    let holders = 0;
    for (const t of tokens) {
      const s = stats.get(t.address.toLowerCase());
      if (!s) continue;
      volume24hEth += s.volume24hEth;
      volumeEth += s.volumeEth;
      if (s.athEth > highestAthEth) highestAthEth = s.athEth;
      holders += s.holders;
    }
    return { tokens: tokens.length, volume24hEth, volumeEth, highestAthEth, holders };
  }, [tokens, stats]);
}
