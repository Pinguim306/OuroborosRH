"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { curveAbi, v3PoolAbi, LIVE } from "./contracts";
import { blockClock, parseV3Swap, supplyOf, wethOf, v3TradersByTx, INFRA_ADDRESSES } from "./useActivity";
import type { Address, TokenMarket } from "./types";

/**
 * Launchpad-wide activity, aggregated from every token's on-chain events (curve
 * Trade events or, for instant-V3 tokens, the pool's Swap events). Feeds the
 * home page's live feed + King of the Hill and the leaderboard page. Polls
 * periodically; scales fine for a hobby launchpad, an indexer would take over
 * at high volume.
 */

const HOUR = 3600;
const FEED_SIZE = 14;

export interface GlobalTrade {
  id: string;
  token: TokenMarket;
  trader: Address;
  isBuy: boolean;
  ethAmount: number;
  time: number; // unix seconds, estimated from block distance
}

export interface TraderStat {
  address: Address;
  volumeEth: number;
  trades: number;
}

export interface CreatorStat {
  address: Address;
  tokens: number;
  volumeEth: number;
}

export interface GlobalActivity {
  trades: GlobalTrade[]; // newest first
  traders: TraderStat[]; // by volume, desc
  creators: CreatorStat[]; // by combined volume of their tokens, desc
  hot?: { token: TokenMarket; vol1hEth: number }; // King of the Hill (top 1h volume)
  isLoading: boolean;
}

const EMPTY: GlobalActivity = { trades: [], traders: [], creators: [], isLoading: LIVE };

export function useGlobalActivity(tokens: TokenMarket[]): GlobalActivity {
  const client = usePublicClient();
  const [data, setData] = useState<GlobalActivity>(EMPTY);
  const key = tokens.map((t) => t.address).join(",");

  useEffect(() => {
    if (!LIVE || !client || tokens.length === 0) {
      setData({ ...EMPTY, isLoading: false });
      return;
    }
    let alive = true;

    async function load() {
      try {
        const [clock, weth] = await Promise.all([
          blockClock(client!),
          tokens.some((t) => t.mode === "v3") ? wethOf(client!) : Promise.resolve(undefined),
        ]);
        const hourAgo = clock.latestNum - BigInt(Math.max(1, Math.floor(HOUR / clock.spb)));

        const all: (GlobalTrade & { bn: bigint })[] = [];
        const volByToken = new Map<string, number>();
        const vol1hByToken = new Map<string, number>();

        await Promise.all(
          tokens.slice(0, 40).map(async (t) => {
            try {
              const supply = supplyOf(t);
              const tokenIs0 = weth ? t.address.toLowerCase() < weth.toLowerCase() : true;
              const isV3 = t.mode === "v3";
              const [logs, traders] = await Promise.all([
                isV3
                  ? client!.getContractEvents({
                      address: t.curve, // the pool
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
                // V3 Swap events name the relaying router, not the wallet — the
                // token Transfer in the same tx names the real trader.
                isV3
                  ? v3TradersByTx(client!, t.address, t.curve)
                  : Promise.resolve(undefined),
              ]);
              for (const l of logs) {
                let trader: Address;
                let isBuy: boolean;
                let eth: number;
                if (isV3) {
                  const s = parseV3Swap(l, tokenIs0, supply);
                  isBuy = s.isBuy;
                  eth = s.ethAmount;
                  trader =
                    (isBuy
                      ? traders?.buyerByTx.get(l.transactionHash)
                      : traders?.sellerByTx.get(l.transactionHash)) ?? s.trader;
                } else {
                  const a = l.args as {
                    trader: Address;
                    isBuy: boolean;
                    nativeAmount?: bigint;
                  };
                  trader = a.trader;
                  isBuy = a.isBuy;
                  eth = Number(formatEther(a.nativeAmount ?? 0n));
                }
                const k = t.address.toLowerCase();
                volByToken.set(k, (volByToken.get(k) ?? 0) + eth);
                if (l.blockNumber >= hourAgo) {
                  vol1hByToken.set(k, (vol1hByToken.get(k) ?? 0) + eth);
                }
                all.push({
                  id: `${l.transactionHash}-${l.logIndex}`,
                  token: t,
                  trader,
                  isBuy,
                  ethAmount: eth,
                  bn: l.blockNumber,
                  time: Math.round(clock.latestTs - Number(clock.latestNum - l.blockNumber) * clock.spb),
                });
              }
            } catch {
              /* one token failing must not break the feed */
            }
          }),
        );

        // Recent feed, newest first.
        all.sort((a, b) => (a.bn === b.bn ? 0 : a.bn > b.bn ? -1 : 1));
        const trades = all.slice(0, FEED_SIZE);

        // Trader leaderboard. Routers/aggregators never make the board, even when
        // a swap couldn't be attributed to a wallet.
        const byTrader = new Map<string, TraderStat>();
        for (const tr of all) {
          const k = tr.trader.toLowerCase();
          if (INFRA_ADDRESSES.has(k)) continue;
          const s = byTrader.get(k) ?? { address: tr.trader, volumeEth: 0, trades: 0 };
          s.volumeEth += tr.ethAmount;
          s.trades += 1;
          byTrader.set(k, s);
        }
        const traders = [...byTrader.values()].sort((a, b) => b.volumeEth - a.volumeEth).slice(0, 10);

        // Creator leaderboard: tokens launched + combined volume of those tokens.
        const byCreator = new Map<string, CreatorStat>();
        for (const t of tokens) {
          const k = t.creator.toLowerCase();
          const s = byCreator.get(k) ?? { address: t.creator, tokens: 0, volumeEth: 0 };
          s.tokens += 1;
          s.volumeEth += volByToken.get(t.address.toLowerCase()) ?? 0;
          byCreator.set(k, s);
        }
        const creators = [...byCreator.values()]
          .sort((a, b) => b.volumeEth - a.volumeEth || b.tokens - a.tokens)
          .slice(0, 10);

        // King of the Hill: hottest token of the last hour (falls back to all-time
        // volume so the card isn't empty on a quiet hour).
        let hot: GlobalActivity["hot"];
        const pool = vol1hByToken.size > 0 ? vol1hByToken : volByToken;
        for (const [addr, vol] of pool) {
          if (vol <= 0) continue;
          if (!hot || vol > hot.vol1hEth) {
            const token = tokens.find((t) => t.address.toLowerCase() === addr);
            if (token) hot = { token, vol1hEth: vol };
          }
        }

        if (alive) setData({ trades, traders, creators, hot, isLoading: false });
      } catch {
        if (alive) setData((d) => ({ ...d, isLoading: false }));
      }
    }

    load();
    const id = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  return data;
}
