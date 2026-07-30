"use client";

import { getEventsRanged } from "./logsRanged";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { coilPoolId, curveAbi, v3PoolAbi, v4PoolManagerAbi, LIVE } from "./contracts";
import {
  chainCtx,
  parseV3Swap,
  parseV4Swap,
  supplyOf,
  v3TradersByTx,
  useChainClients,
} from "./useActivity";
import { asSupportedChainId, marketKey, v4PoolManagerOf } from "./chain";
import { isHiddenMarket } from "./useMarkets";
import type { Address, TokenMarket } from "./types";

/**
 * One wallet's trading footprint across every launched token (curve, V3 and v4),
 * for the public profile page: lifetime volume, trade count, and the most recent
 * trades with their tokens. Same event sources as the leaderboard, filtered to
 * a single wallet.
 */

export interface WalletTrade {
  id: string;
  token: TokenMarket;
  isBuy: boolean;
  /** In the TOKEN'S chain's native coin. */
  ethAmount: number;
  /** Same trade in USD — the only unit summable across chains. */
  usdAmount: number;
  time: number; // unix seconds, estimated from block distance
}

export interface WalletActivity {
  /** USD — profiles span chains, so the lifetime figure must not add ETH to USDC raw. */
  volumeUsd: number;
  tradeCount: number;
  trades: WalletTrade[]; // newest first, capped
  isLoading: boolean;
}

const EMPTY: WalletActivity = { volumeUsd: 0, tradeCount: 0, trades: [], isLoading: LIVE };
const TRADES_SHOWN = 10;

export function useWalletActivity(tokens: TokenMarket[], wallet?: Address): WalletActivity {
  // Profiles are chain-independent: tokens may span chains, so each uses its own chain's client,
  // clock and USD rate (see useChainClients/chainCtx).
  const clients = useChainClients();
  const [data, setData] = useState<WalletActivity>(EMPTY);
  const key = tokens.map(marketKey).join(",") + (wallet ?? "");

  useEffect(() => {
    if (!LIVE || !wallet || tokens.length === 0) {
      setData({ ...EMPTY, isLoading: false });
      return;
    }
    const me = wallet.toLowerCase();
    let alive = true;

    (async () => {
      try {
        // Hidden tokens never count toward a profile's footprint either.
        const visible = tokens.filter((t) => !isHiddenMarket(t));

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

        const all: (WalletTrade & { bn: bigint })[] = [];
        await Promise.all(
          visible.slice(0, 40).map(async (t) => {
            try {
              const tChain = asSupportedChainId(t.chainId);
              const client = clients[tChain];
              const ctx = ctxByChain.get(tChain);
              if (!client || !ctx) return;
              const { clock, weth, usd } = ctx;
              const V4_POOL_MANAGER = v4PoolManagerOf(tChain);
              const supply = supplyOf(t);
              const tokenIs0 = weth ? t.address.toLowerCase() < weth.toLowerCase() : true;
              const isV3 = t.mode === "v3";
              const isV4 = t.mode === "v4";
              const [logs, traders] = await Promise.all([
                isV4
                  ? getEventsRanged(client, {
                      address: V4_POOL_MANAGER,
                      abi: v4PoolManagerAbi,
                      eventName: "Swap",
                      args: { id: coilPoolId(t.address) },
                      fromBlock: 0n,
                      toBlock: "latest",
                    })
                  : isV3
                    ? getEventsRanged(client, {
                        address: t.curve,
                        abi: v3PoolAbi,
                        eventName: "Swap",
                        fromBlock: 0n,
                        toBlock: "latest",
                      })
                    : getEventsRanged(client, {
                        address: t.curve,
                        abi: curveAbi,
                        eventName: "Trade",
                        fromBlock: 0n,
                        toBlock: "latest",
                      }),
                isV4
                  ? v3TradersByTx(client, t.address, V4_POOL_MANAGER)
                  : isV3
                    ? v3TradersByTx(client, t.address, t.curve)
                    : Promise.resolve(undefined),
              ]);
              for (const l of logs) {
                let trader: string;
                let isBuy: boolean;
                let eth: number;
                if (isV4 || isV3) {
                  const s = isV4 ? parseV4Swap(l, supply) : parseV3Swap(l, tokenIs0, supply);
                  isBuy = s.isBuy;
                  eth = s.ethAmount;
                  trader =
                    (isBuy
                      ? traders?.buyerByTx.get(l.transactionHash)
                      : traders?.sellerByTx.get(l.transactionHash)) ?? s.trader;
                } else {
                  const a = l.args as { trader: Address; isBuy: boolean; nativeAmount?: bigint };
                  trader = a.trader;
                  isBuy = a.isBuy;
                  eth = Number(formatEther(a.nativeAmount ?? 0n));
                }
                if (trader.toLowerCase() !== me) continue;
                all.push({
                  id: `${l.transactionHash}-${l.logIndex}`,
                  token: t,
                  isBuy,
                  ethAmount: eth,
                  usdAmount: eth * usd,
                  bn: l.blockNumber,
                  time: Math.round(
                    clock.latestTs - Number(clock.latestNum - l.blockNumber) * clock.spb,
                  ),
                });
              }
            } catch {
              /* one token failing must not break the profile */
            }
          }),
        );

        // Estimated time, not block number — heights from different chains don't compare.
        all.sort((a, b) => b.time - a.time);
        if (alive)
          setData({
            volumeUsd: all.reduce((s, t) => s + t.usdAmount, 0),
            tradeCount: all.length,
            trades: all.slice(0, TRADES_SHOWN),
            isLoading: false,
          });
      } catch {
        if (alive) setData({ ...EMPTY, isLoading: false });
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, key]);

  return data;
}
