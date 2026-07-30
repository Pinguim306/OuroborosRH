"use client";

import { getEventsRanged } from "./logsRanged";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { coilPoolId, curveAbi, v3PoolAbi, v4PoolManagerAbi, LIVE } from "./contracts";
import { marketKey } from "./chain";
import {
  chainCtx,
  parseV3Swap,
  parseV4Swap,
  supplyOf,
  v3TradersByTx,
  useChainClients,
  INFRA_ADDRESSES,
} from "./useActivity";
import { asSupportedChainId, v4PoolManagerOf } from "./chain";
import { isHiddenMarket } from "./useMarkets";
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
  /** In the TOKEN'S chain's native coin — display it with that chain's symbol. */
  ethAmount: number;
  /** Same trade in USD — the only unit that may be summed across chains. */
  usdAmount: number;
  time: number; // unix seconds, estimated from block distance
}

export interface TraderStat {
  address: Address;
  /** USD. Cross-chain sums of raw native amounts would count a $1 Arc trade as an ETH. */
  volumeUsd: number;
  trades: number;
}

export interface CreatorStat {
  address: Address;
  tokens: number;
  /** USD — same reasoning as TraderStat. */
  volumeUsd: number;
}

export interface GlobalActivity {
  trades: GlobalTrade[]; // newest first
  traders: TraderStat[]; // by volume, desc
  creators: CreatorStat[]; // by combined volume of their tokens, desc
  hot?: { token: TokenMarket; vol1hUsd: number }; // King of the Hill (top 1h volume, USD)
  isLoading: boolean;
}

const EMPTY: GlobalActivity = { trades: [], traders: [], creators: [], isLoading: LIVE };

export function useGlobalActivity(tokens: TokenMarket[]): GlobalActivity {
  // The list may span chains (the boards are chain-independent by product decision), so clients,
  // clocks and USD rates are resolved PER CHAIN and each token uses its own chain's set.
  const clients = useChainClients();
  const [data, setData] = useState<GlobalActivity>(EMPTY);
  const key = tokens.map(marketKey).join(",");

  useEffect(() => {
    if (!LIVE || tokens.length === 0) {
      setData({ ...EMPTY, isLoading: false });
      return;
    }
    let alive = true;

    async function load() {
      try {
        // Hidden tokens never feed the boards, whatever list the caller passed.
        const visible = tokens.filter((t) => !isHiddenMarket(t));

        // One context per chain present in the list: block clock (chains tick at different
        // speeds), WETH (V3 orientation, where that topology exists), native→USD rate.
        const chainIds = [...new Set(visible.map((t) => asSupportedChainId(t.chainId)))];
        const ctxByChain = new Map<number, Awaited<ReturnType<typeof chainCtx>>>();
        await Promise.all(
          chainIds.map(async (id) => {
            const c = clients[id];
            if (!c) return;
            ctxByChain.set(
              id,
              await chainCtx(c, id, visible.some((t) => t.mode === "v3" && asSupportedChainId(t.chainId) === id)),
            );
          }),
        );

        const all: (GlobalTrade & { bn: bigint; chainId: number })[] = [];
        const volByToken = new Map<string, number>(); // USD
        const vol1hByToken = new Map<string, number>(); // USD

        await Promise.all(
          visible.slice(0, 40).map(async (t) => {
            try {
              const tChain = asSupportedChainId(t.chainId);
              const client = clients[tChain];
              const ctx = ctxByChain.get(tChain);
              if (!client || !ctx) return;
              const { clock, weth, v3Scale, usd } = ctx;
              const hourAgo = clock.latestNum - BigInt(Math.max(1, Math.floor(HOUR / clock.spb)));
              const V4_POOL_MANAGER = v4PoolManagerOf(tChain);
              const supply = supplyOf(t);
              const tokenIs0 = weth ? t.address.toLowerCase() < weth.toLowerCase() : true;
              const isV3 = t.mode === "v3";
              const isV4 = t.mode === "v4";
              const [logs, traders] = await Promise.all([
                isV4
                  ? getEventsRanged(client!, {
                      address: V4_POOL_MANAGER,
                      abi: v4PoolManagerAbi,
                      eventName: "Swap",
                      args: { id: coilPoolId(t.address) },
                      fromBlock: 0n,
                      toBlock: "latest",
                    })
                  : isV3
                    ? getEventsRanged(client!, {
                        address: t.curve, // the pool
                        abi: v3PoolAbi,
                        eventName: "Swap",
                        fromBlock: 0n,
                        toBlock: "latest",
                      })
                    : getEventsRanged(client!, {
                        address: t.curve,
                        abi: curveAbi,
                        eventName: "Trade",
                        fromBlock: 0n,
                        toBlock: "latest",
                      }),
                // Pool Swap events name the relaying router, not the wallet — the
                // token Transfer in the same tx names the real trader. For v4 the
                // "pool" side of those transfers is the PoolManager singleton.
                isV4
                  ? v3TradersByTx(client!, t.address, V4_POOL_MANAGER)
                  : isV3
                    ? v3TradersByTx(client!, t.address, t.curve)
                    : Promise.resolve(undefined),
              ]);
              for (const l of logs) {
                let trader: Address;
                let isBuy: boolean;
                let eth: number;
                if (isV4) {
                  const s = parseV4Swap(l, supply);
                  isBuy = s.isBuy;
                  eth = s.ethAmount;
                  trader =
                    (isBuy
                      ? traders?.buyerByTx.get(l.transactionHash)
                      : traders?.sellerByTx.get(l.transactionHash)) ?? s.trader;
                } else if (isV3) {
                  const s = parseV3Swap(l, tokenIs0, supply, v3Scale);
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
                const k = marketKey(t);
                const usdAmount = eth * usd;
                volByToken.set(k, (volByToken.get(k) ?? 0) + usdAmount);
                if (l.blockNumber >= hourAgo) {
                  vol1hByToken.set(k, (vol1hByToken.get(k) ?? 0) + usdAmount);
                }
                all.push({
                  id: `${l.transactionHash}-${l.logIndex}`,
                  token: t,
                  trader,
                  isBuy,
                  ethAmount: eth,
                  usdAmount,
                  bn: l.blockNumber,
                  chainId: tChain,
                  time: Math.round(clock.latestTs - Number(clock.latestNum - l.blockNumber) * clock.spb),
                });
              }
            } catch {
              /* one token failing must not break the feed */
            }
          }),
        );

        // Recent feed, newest first. Estimated TIME, not block number — block heights from
        // different chains are not comparable (Arc's counter is 12M+ where Robinhood's is lower).
        all.sort((a, b) => b.time - a.time);
        const trades = all.slice(0, FEED_SIZE);

        // Trader leaderboard. Routers/aggregators never make the board, even when
        // a swap couldn't be attributed to a wallet.
        const byTrader = new Map<string, TraderStat>();
        for (const tr of all) {
          const k = tr.trader.toLowerCase();
          if (INFRA_ADDRESSES.has(k)) continue;
          const s = byTrader.get(k) ?? { address: tr.trader, volumeUsd: 0, trades: 0 };
          s.volumeUsd += tr.usdAmount;
          s.trades += 1;
          byTrader.set(k, s);
        }
        const traders = [...byTrader.values()].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 10);

        // Creator leaderboard: tokens launched + combined volume of those tokens.
        const byCreator = new Map<string, CreatorStat>();
        for (const t of visible) {
          const k = t.creator.toLowerCase();
          const s = byCreator.get(k) ?? { address: t.creator, tokens: 0, volumeUsd: 0 };
          s.tokens += 1;
          s.volumeUsd += volByToken.get(marketKey(t)) ?? 0;
          byCreator.set(k, s);
        }
        const creators = [...byCreator.values()]
          .sort((a, b) => b.volumeUsd - a.volumeUsd || b.tokens - a.tokens)
          .slice(0, 10);

        // King of the Hill: hottest token of the last hour (falls back to all-time
        // volume so the card isn't empty on a quiet hour).
        let hot: GlobalActivity["hot"];
        const pool = vol1hByToken.size > 0 ? vol1hByToken : volByToken;
        for (const [k, vol] of pool) {
          if (vol <= 0) continue;
          if (!hot || vol > hot.vol1hUsd) {
            const token = visible.find((t) => marketKey(t) === k);
            if (token) hot = { token, vol1hUsd: vol };
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
  }, [clients, key]);

  return data;
}
