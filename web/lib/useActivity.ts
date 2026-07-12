"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { curveAbi, tokenAbi, LIVE } from "./contracts";
import type { Address, Holder, TokenMarket, Trade } from "./types";

/**
 * Reads on-chain activity directly from contract events (no indexer needed).
 * Best-effort over full history; failures degrade to empty. An indexer/subgraph
 * would scale better for many tokens / high volume.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const DAY = 24 * 3600;

function supplyOf(token: TokenMarket): number {
  return token.priceRh > 0 ? token.marketCapRh / token.priceRh : 1_000_000_000;
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

export interface Activity {
  trades: Trade[];
  volume24hEth: number;
  athMcapEth: number;
  series: number[]; // marketcap (ETH) per trade — for the chart
  isLoading: boolean;
}

const EMPTY: Activity = { trades: [], volume24hEth: 0, athMcapEth: 0, series: [], isLoading: LIVE };

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
        const [logs, cutoff] = await Promise.all([
          client.getContractEvents({
            address: curve,
            abi: curveAbi,
            eventName: "Trade",
            fromBlock: 0n,
            toBlock: "latest",
          }),
          cutoffBlock(client, DAY),
        ]);
        const supply = supplyOf(token);
        let vol24 = 0;
        let ath = 0;
        const series: number[] = [];
        const all: Trade[] = [];
        for (const l of logs) {
          const a = l.args as {
            trader: Address;
            isBuy: boolean;
            nativeAmount: bigint;
            tokenAmount: bigint;
            newPrice: bigint;
          };
          const nat = Number(formatEther(a.nativeAmount ?? 0n));
          const mcap = Number(formatEther(a.newPrice ?? 0n)) * supply;
          if (l.blockNumber >= cutoff) vol24 += nat;
          if (mcap > ath) ath = mcap;
          series.push(mcap);
          all.push({
            id: `${l.transactionHash}-${l.logIndex}`,
            trader: a.trader,
            isBuy: a.isBuy,
            rhAmount: nat,
            tokenAmount: Number(formatEther(a.tokenAmount ?? 0n)),
            time: 0,
          });
        }

        const recentLogs = logs.slice(-20).reverse();
        const recent = all.slice(-20).reverse();
        const uniqueBlocks = [...new Set(recentLogs.map((l) => l.blockNumber))];
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
          t.time = ts.get(recentLogs[i].blockNumber) ?? 0;
        });

        if (alive) setData({ trades: recent, volume24hEth: vol24, athMcapEth: ath, series, isLoading: false });
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
      const cutoff = await cutoffBlock(client!, DAY);
      const next = new Map<string, MarketStat>();
      await Promise.all(
        tokens.slice(0, 40).map(async (t) => {
          try {
            const [trades, transfers] = await Promise.all([
              client!.getContractEvents({
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
            let vol = 0;
            let vol24 = 0;
            let ath = 0;
            let lastBlock = 0;
            for (const l of trades) {
              const a = l.args as { nativeAmount?: bigint; newPrice?: bigint };
              const nat = Number(formatEther(a.nativeAmount ?? 0n));
              vol += nat;
              if (l.blockNumber >= cutoff) vol24 += nat;
              const mcap = Number(formatEther(a.newPrice ?? 0n)) * supply;
              if (mcap > ath) ath = mcap;
              lastBlock = Number(l.blockNumber);
            }
            const bal = new Map<string, bigint>();
            for (const l of transfers) {
              const a = l.args as { from: Address; to: Address; value: bigint };
              if (a.from && a.from !== ZERO) bal.set(a.from, (bal.get(a.from) ?? 0n) - a.value);
              if (a.to && a.to !== ZERO) bal.set(a.to, (bal.get(a.to) ?? 0n) + a.value);
            }
            const excluded = new Set([t.curve.toLowerCase(), DEAD, ZERO, t.address.toLowerCase()]);
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
        const excluded = new Set([token.curve.toLowerCase(), DEAD, ZERO, token.address.toLowerCase()]);
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
    let highestAthEth = 0;
    let holders = 0;
    for (const t of tokens) {
      const s = stats.get(t.address.toLowerCase());
      if (!s) continue;
      volume24hEth += s.volume24hEth;
      if (s.athEth > highestAthEth) highestAthEth = s.athEth;
      holders += s.holders;
    }
    return { tokens: tokens.length, volume24hEth, highestAthEth, holders };
  }, [tokens, stats]);
}
