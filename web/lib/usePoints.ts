"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";
import { curveAbi, v3PoolAbi, LIVE } from "./contracts";
import { parseV3Swap, supplyOf, wethOf, v3TradersByTx, INFRA_ADDRESSES } from "./useActivity";
import type { Address, TokenMarket } from "./types";

/**
 * Coil Points — Season 1.
 *
 * A reputation score computed ENTIRELY from public on-chain events, so anyone
 * can verify their own number. Nothing is stored off-chain; this hook replays
 * every token's trade history and applies the season rules below.
 *
 * Season 1 rules (all history since the first launchpad counts):
 *   - Trading:    1,000 pts per ETH of buy+sell volume
 *   - Launching:    500 pts per token launched
 *   - Creator cut:  100 pts per ETH of volume your tokens generate
 *   - Early ape:    250 pts per token where you were one of its first 10 buyers
 *
 * Anti-wash rule: trading volume only counts on tokens with at least
 * MIN_TRADERS distinct traders — ping-ponging your own token earns nothing.
 */

export const SEASON = 1;
export const PTS_PER_ETH_VOLUME = 1_000;
export const PTS_PER_LAUNCH = 500;
export const PTS_PER_ETH_CREATOR = 100;
export const PTS_EARLY_APE = 250;
export const EARLY_APE_SLOTS = 10;
export const MIN_TRADERS = 3;

export interface WalletPoints {
  address: Address;
  total: number;
  trading: number;
  launching: number;
  creatorVolume: number;
  earlyApe: number;
  volumeEth: number; // eligible trading volume behind the trading score
}

export interface PointsBoard {
  board: WalletPoints[]; // sorted by total, desc (full list)
  totalPoints: number;
  isLoading: boolean;
}

const EMPTY: PointsBoard = { board: [], totalPoints: 0, isLoading: LIVE };

interface Tally {
  volumeEth: number; // eligible volume traded
  launches: number;
  creatorVolEth: number;
  earlyApes: number;
}

const freshTally = (): Tally => ({
  volumeEth: 0,
  launches: 0,
  creatorVolEth: 0,
  earlyApes: 0,
});

export function usePoints(tokens: TokenMarket[]): PointsBoard {
  const client = usePublicClient();
  const [data, setData] = useState<PointsBoard>(EMPTY);
  const key = tokens.map((t) => t.address).join(",");

  useEffect(() => {
    if (!LIVE || !client || tokens.length === 0) {
      setData({ ...EMPTY, isLoading: false });
      return;
    }
    let alive = true;

    async function load() {
      try {
        const weth = tokens.some((t) => t.mode === "v3") ? await wethOf(client!) : undefined;
        const tallies = new Map<string, Tally>();
        const addrOf = new Map<string, Address>(); // lowercase → checksummed-ish original
        const tally = (a: Address): Tally => {
          const k = a.toLowerCase();
          addrOf.set(k, a);
          let t = tallies.get(k);
          if (!t) {
            t = freshTally();
            tallies.set(k, t);
          }
          return t;
        };

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
                // V3 Swap events name the relaying router — resolve the real wallet
                // from the token Transfer in the same transaction.
                isV3 ? v3TradersByTx(client!, t.address, t.curve) : Promise.resolve(undefined),
              ]);

              // Normalize every trade of this token, in chain order.
              const trades: { trader: Address; isBuy: boolean; eth: number }[] = [];
              for (const l of logs) {
                if (isV3) {
                  const s = parseV3Swap(l, tokenIs0, supply);
                  const wallet =
                    (s.isBuy
                      ? traders?.buyerByTx.get(l.transactionHash)
                      : traders?.sellerByTx.get(l.transactionHash)) ?? s.trader;
                  trades.push({ trader: wallet, isBuy: s.isBuy, eth: s.ethAmount });
                } else {
                  const a = l.args as { trader: Address; isBuy: boolean; nativeAmount?: bigint };
                  trades.push({
                    trader: a.trader,
                    isBuy: a.isBuy,
                    eth: Number(formatEther(a.nativeAmount ?? 0n)),
                  });
                }
              }

              // Anti-wash gate: volume only counts on tokens that at least
              // MIN_TRADERS distinct wallets have traded (routers don't count).
              const distinct = new Set(
                trades.map((x) => x.trader.toLowerCase()).filter((a) => !INFRA_ADDRESSES.has(a)),
              );
              const eligible = distinct.size >= MIN_TRADERS;

              let tokenVol = 0;
              const earlyBuyers = new Set<string>();
              for (const tr of trades) {
                tokenVol += tr.eth;
                // Routers/aggregators never score, even when a swap couldn't be
                // attributed to the wallet behind it.
                if (INFRA_ADDRESSES.has(tr.trader.toLowerCase())) continue;
                if (eligible) tally(tr.trader).volumeEth += tr.eth;
                if (tr.isBuy && earlyBuyers.size < EARLY_APE_SLOTS) {
                  const k = tr.trader.toLowerCase();
                  if (!earlyBuyers.has(k)) {
                    earlyBuyers.add(k);
                    if (eligible) tally(tr.trader).earlyApes += 1;
                  }
                }
              }

              const creator = tally(t.creator);
              creator.launches += 1;
              if (eligible) creator.creatorVolEth += tokenVol;
            } catch {
              /* one token failing must not zero the whole board */
            }
          }),
        );

        const board: WalletPoints[] = [...tallies.entries()].map(([k, t]) => {
          const trading = t.volumeEth * PTS_PER_ETH_VOLUME;
          const launching = t.launches * PTS_PER_LAUNCH;
          const creatorVolume = t.creatorVolEth * PTS_PER_ETH_CREATOR;
          const earlyApe = t.earlyApes * PTS_EARLY_APE;
          return {
            address: addrOf.get(k) as Address,
            trading,
            launching,
            creatorVolume,
            earlyApe,
            total: trading + launching + creatorVolume + earlyApe,
            volumeEth: t.volumeEth,
          };
        });
        board.sort((a, b) => b.total - a.total);
        const totalPoints = board.reduce((s, w) => s + w.total, 0);

        if (alive) setData({ board, totalPoints, isLoading: false });
      } catch {
        if (alive) setData((d) => ({ ...d, isLoading: false }));
      }
    }

    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  return data;
}
