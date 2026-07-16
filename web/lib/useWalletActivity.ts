"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { coilPoolId, curveAbi, v3PoolAbi, v4PoolManagerAbi, LIVE } from "./contracts";
import {
  blockClock,
  parseV3Swap,
  parseV4Swap,
  supplyOf,
  wethOf,
  v3TradersByTx,
  V4_POOL_MANAGER,
} from "./useActivity";
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
  ethAmount: number;
  time: number; // unix seconds, estimated from block distance
}

export interface WalletActivity {
  volumeEth: number;
  tradeCount: number;
  trades: WalletTrade[]; // newest first, capped
  isLoading: boolean;
}

const EMPTY: WalletActivity = { volumeEth: 0, tradeCount: 0, trades: [], isLoading: LIVE };
const TRADES_SHOWN = 10;

export function useWalletActivity(tokens: TokenMarket[], wallet?: Address): WalletActivity {
  const client = usePublicClient();
  const [data, setData] = useState<WalletActivity>(EMPTY);
  const key = tokens.map((t) => t.address).join(",") + (wallet ?? "");

  useEffect(() => {
    if (!LIVE || !client || !wallet || tokens.length === 0) {
      setData({ ...EMPTY, isLoading: false });
      return;
    }
    const me = wallet.toLowerCase();
    let alive = true;

    (async () => {
      try {
        const [clock, weth] = await Promise.all([
          blockClock(client),
          tokens.some((t) => t.mode === "v3") ? wethOf(client) : Promise.resolve(undefined),
        ]);

        const all: (WalletTrade & { bn: bigint })[] = [];
        await Promise.all(
          tokens.slice(0, 40).map(async (t) => {
            try {
              const supply = supplyOf(t);
              const tokenIs0 = weth ? t.address.toLowerCase() < weth.toLowerCase() : true;
              const isV3 = t.mode === "v3";
              const isV4 = t.mode === "v4";
              const [logs, traders] = await Promise.all([
                isV4
                  ? client.getContractEvents({
                      address: V4_POOL_MANAGER,
                      abi: v4PoolManagerAbi,
                      eventName: "Swap",
                      args: { id: coilPoolId(t.address) },
                      fromBlock: 0n,
                      toBlock: "latest",
                    })
                  : isV3
                    ? client.getContractEvents({
                        address: t.curve,
                        abi: v3PoolAbi,
                        eventName: "Swap",
                        fromBlock: 0n,
                        toBlock: "latest",
                      })
                    : client.getContractEvents({
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

        all.sort((a, b) => (a.bn === b.bn ? 0 : a.bn > b.bn ? -1 : 1));
        if (alive)
          setData({
            volumeEth: all.reduce((s, t) => s + t.ethAmount, 0),
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
  }, [client, key]);

  return data;
}
