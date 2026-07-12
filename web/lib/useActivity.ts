"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { curveAbi, tokenAbi, LIVE } from "./contracts";
import type { Address, Holder, TokenMarket, Trade } from "./types";

/**
 * Reads on-chain activity directly from contract events (no indexer needed).
 * Best-effort over full history — for high-volume tokens a subgraph/indexer would
 * be faster; failures degrade to empty rather than crashing.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

function supplyOf(token: TokenMarket): number {
  return token.priceRh > 0 ? token.marketCapRh / token.priceRh : 1_000_000_000;
}

export interface Activity {
  trades: Trade[];
  volumeEth: number;
  lastTradeTime: number;
  athMcapEth: number;
  series: number[]; // marketcap (ETH) per trade, chronological — for the chart
  isLoading: boolean;
}

const EMPTY: Activity = {
  trades: [],
  volumeEth: 0,
  lastTradeTime: 0,
  athMcapEth: 0,
  series: [],
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
        const logs = await client.getContractEvents({
          address: curve,
          abi: curveAbi,
          eventName: "Trade",
          fromBlock: 0n,
          toBlock: "latest",
        });
        const supply = supplyOf(token);
        let vol = 0;
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
          vol += nat;
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

        // Fetch block timestamps for the most recent trades only.
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

        if (alive) {
          setData({
            trades: recent,
            volumeEth: vol,
            lastTradeTime: recent[0]?.time ?? 0,
            athMcapEth: ath,
            series,
            isLoading: false,
          });
        }
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
  volumeEth: number;
  lastTradeTime: number; // block number as a monotonic proxy (no timestamp fetch)
}

/**
 * Enriches a list of tokens with volume + last-trade ordering info by reading each
 * curve's Trade events. Fine for a handful of tokens; an indexer scales better.
 * Polls periodically so "Last Trade" ordering feels live.
 */
export function useMarketsActivity(tokens: TokenMarket[]): Map<string, MarketStat> {
  const client = usePublicClient();
  const [stats, setStats] = useState<Map<string, MarketStat>>(new Map());
  const key = tokens.map((t) => t.curve).join(",");

  useEffect(() => {
    if (!LIVE || !client || tokens.length === 0) return;
    let alive = true;
    async function load() {
      const next = new Map<string, MarketStat>();
      await Promise.all(
        tokens.map(async (t) => {
          try {
            const logs = await client!.getContractEvents({
              address: t.curve,
              abi: curveAbi,
              eventName: "Trade",
              fromBlock: 0n,
              toBlock: "latest",
            });
            let vol = 0;
            let lastBlock = 0;
            for (const l of logs) {
              const a = l.args as { nativeAmount?: bigint };
              vol += Number(formatEther(a.nativeAmount ?? 0n));
              lastBlock = Number(l.blockNumber);
            }
            next.set(t.address.toLowerCase(), { volumeEth: vol, lastTradeTime: lastBlock });
          } catch {
            /* ignore */
          }
        }),
      );
      if (alive) setStats(next);
    }
    load();
    const id = setInterval(load, 20_000);
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
