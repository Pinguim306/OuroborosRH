"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { coilPoolId, curveAbi, tokenAbi, v3PoolAbi, v4PoolManagerAbi, LIVE } from "./contracts";
import { V4_POOL_MANAGER } from "./useActivity";
import type { Address, TokenMarket } from "./types";

/**
 * Trading cost basis per token for one wallet, from on-chain events:
 *   - curve tokens: the curve's Trade events where trader == user
 *     (buy → ETH in, sell → ETH out);
 *   - V3 tokens: token Transfers between the user and the pool, with the ETH leg
 *     taken from the pool's Swap event in the same transaction (sells go through
 *     the router, so the Swap's recipient can't attribute them — the Transfer can).
 *
 * PnL is then `current value + receivedEth - investedEth` (claimed holder rewards
 * are not counted — this is pure trading PnL).
 */

export interface TokenPnl {
  investedEth: number; // ETH spent buying
  receivedEth: number; // ETH received selling
}

/** Both legs of a V3 swap: absolute amounts plus which side left the pool. */
interface SwapLegs {
  abs0: number;
  abs1: number;
  amount0Negative: boolean;
}

export function usePnL(tokens: TokenMarket[], user?: Address): Map<string, TokenPnl> {
  const client = usePublicClient();
  const [data, setData] = useState<Map<string, TokenPnl>>(new Map());
  const key = tokens.map((t) => t.address).join(",") + (user ?? "");

  useEffect(() => {
    if (!LIVE || !client || !user || tokens.length === 0) {
      setData(new Map());
      return;
    }
    let alive = true;

    (async () => {
      const next = new Map<string, TokenPnl>();
      await Promise.all(
        tokens.slice(0, 30).map(async (t) => {
          try {
            const pnl: TokenPnl = { investedEth: 0, receivedEth: 0 };

            if (t.mode === "v4") {
              // v4 swaps live in the PoolManager singleton, keyed by PoolId; the token leg moves
              // PoolManager ↔ user, and amount0 is always the ETH leg (currency0 = native ETH).
              const [swaps, buys, sells] = await Promise.all([
                client.getContractEvents({
                  address: V4_POOL_MANAGER,
                  abi: v4PoolManagerAbi,
                  eventName: "Swap",
                  args: { id: coilPoolId(t.address) },
                  fromBlock: 0n,
                  toBlock: "latest",
                }),
                client.getContractEvents({
                  address: t.address,
                  abi: tokenAbi,
                  eventName: "Transfer",
                  args: { from: V4_POOL_MANAGER, to: user },
                  fromBlock: 0n,
                  toBlock: "latest",
                }),
                client.getContractEvents({
                  address: t.address,
                  abi: tokenAbi,
                  eventName: "Transfer",
                  args: { from: user, to: V4_POOL_MANAGER },
                  fromBlock: 0n,
                  toBlock: "latest",
                }),
              ]);
              const ethByTx = new Map<string, number>();
              for (const l of swaps) {
                const a0 = (l.args as { amount0?: bigint }).amount0 ?? 0n;
                ethByTx.set(l.transactionHash, Number(formatEther(a0 < 0n ? -a0 : a0)));
              }
              for (const l of buys) pnl.investedEth += ethByTx.get(l.transactionHash) ?? 0;
              for (const l of sells) pnl.receivedEth += ethByTx.get(l.transactionHash) ?? 0;
            } else if (t.mode === "v3") {
              const pool = t.curve;
              const [swaps, buys, sells] = await Promise.all([
                client.getContractEvents({
                  address: pool,
                  abi: v3PoolAbi,
                  eventName: "Swap",
                  fromBlock: 0n,
                  toBlock: "latest",
                }),
                // pool → user token transfer = the user bought
                client.getContractEvents({
                  address: t.address,
                  abi: tokenAbi,
                  eventName: "Transfer",
                  args: { from: pool, to: user },
                  fromBlock: 0n,
                  toBlock: "latest",
                }),
                // user → pool token transfer = the user sold
                client.getContractEvents({
                  address: t.address,
                  abi: tokenAbi,
                  eventName: "Transfer",
                  args: { from: user, to: pool },
                  fromBlock: 0n,
                  toBlock: "latest",
                }),
              ]);

              const legsByTx = new Map<string, SwapLegs>();
              for (const l of swaps) {
                const a = l.args as { amount0?: bigint; amount1?: bigint };
                const a0 = a.amount0 ?? 0n;
                const a1 = a.amount1 ?? 0n;
                legsByTx.set(l.transactionHash, {
                  abs0: Number(formatEther(a0 < 0n ? -a0 : a0)),
                  abs1: Number(formatEther(a1 < 0n ? -a1 : a1)),
                  amount0Negative: a0 < 0n,
                });
              }

              // The token leg's sign matches the transfer direction (a buy pulls the
              // token OUT of the pool → its delta is the negative one). Whichever
              // side that is, the other side is the ETH leg.
              const ethLeg = (tx: string, tokenLeftPool: boolean): number => {
                const legs = legsByTx.get(tx);
                if (!legs) return 0;
                const tokenIsAmount0 = legs.amount0Negative === tokenLeftPool;
                return tokenIsAmount0 ? legs.abs1 : legs.abs0;
              };

              for (const l of buys) pnl.investedEth += ethLeg(l.transactionHash, true);
              for (const l of sells) pnl.receivedEth += ethLeg(l.transactionHash, false);
            } else {
              const logs = await client.getContractEvents({
                address: t.curve,
                abi: curveAbi,
                eventName: "Trade",
                args: { trader: user },
                fromBlock: 0n,
                toBlock: "latest",
              });
              for (const l of logs) {
                const a = l.args as { isBuy?: boolean; nativeAmount?: bigint };
                const eth = Number(formatEther(a.nativeAmount ?? 0n));
                if (a.isBuy) pnl.investedEth += eth;
                else pnl.receivedEth += eth;
              }
            }

            next.set(t.address.toLowerCase(), pnl);
          } catch {
            /* leave the token without PnL rather than breaking the page */
          }
        }),
      );
      if (alive) setData(next);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  return data;
}
