"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { CONTRACTS, LIVE, coilHookAbi, launchpadAbi, feeLockerAbi } from "./contracts";
import type { Address, TokenMarket } from "./types";

/**
 * The FeeLocker's holder share as a fraction (holderShareBps / 10000), or
 * undefined while loading / when not needed. Pass `enabled: false` to skip the
 * reads entirely (e.g. no V3 tokens on screen). `launchpad` picks whose locker
 * to read — pass the token's own launchpad for legacy tokens; defaults to the
 * primary.
 */
export function useHolderShare(enabled = true, launchpad?: Address): number | undefined {
  const lockerQ = useReadContract({
    address: launchpad ?? CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "feeLocker",
    query: { enabled: LIVE && enabled },
  });
  const locker = lockerQ.data as Address | undefined;

  const shareQ = useReadContract({
    address: locker,
    abi: feeLockerAbi,
    functionName: "holderShareBps",
    query: { enabled: LIVE && enabled && !!locker },
  });
  return typeof shareQ.data === "bigint" ? Number(shareQ.data) / 10_000 : undefined;
}

/**
 * Total fees a token has paid out so far, in ETH — the number shown as
 * "Rewards pool" / "Pool paid out" / the homepage rewards total.
 *
 * Curve tokens stream their holder fee straight into the token, so
 * totalRewardsDistributed (rewardsPoolRh) already is the total. V3 tokens only
 * stream holderShare of each harvest's ETH side to holders — the rest goes to
 * the protocol in the same collect() — so the total collected is the distributed
 * amount scaled back up by that share.
 */
export function totalFeesEth(token: TokenMarket, holderShare?: number): number {
  if (token.mode === "v3" && holderShare !== undefined && holderShare > 0) {
    return token.rewardsPoolRh / holderShare;
  }
  return token.rewardsPoolRh;
}

/**
 * A v4 token's lifetime rewards pool, in ETH: the sum of the `holders` slice of every FeeTaken
 * event the hook emitted (ETH side + token side valued at spot). Covers both modes — in Creator
 * Rewards the same slice routes to the creator, but it is still the fee earmarked as rewards.
 */
export function useV4RewardsPoolEth(token?: TokenMarket): number {
  const client = usePublicClient();
  const [total, setTotal] = useState(0);
  const isV4 = token?.mode === "v4";
  const addr = token?.address;
  const price = token?.priceRh ?? 0;

  useEffect(() => {
    if (!LIVE || !client || !isV4 || !addr) {
      setTotal(0);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: addr,
          abi: coilHookAbi,
          eventName: "FeeTaken",
          fromBlock: 0n,
          toBlock: "latest",
        });
        let eth = 0;
        let tok = 0;
        for (const l of logs) {
          const a = l.args as { isEth?: boolean; holders?: bigint };
          const v = Number(formatEther(a.holders ?? 0n));
          if (a.isEth) eth += v;
          else tok += v;
        }
        if (alive) setTotal(eth + tok * price);
      } catch {
        if (alive) setTotal(0);
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, isV4, addr, price]);

  return total;
}

/** Single-token convenience wrapper around useHolderShare + totalFeesEth (v4 uses the hook's
 *  FeeTaken events instead — the v3/curve getters don't exist there). */
export function useTotalFeesEth(token?: TokenMarket): number {
  const share = useHolderShare(token?.mode === "v3", token?.launchpad);
  const v4Pool = useV4RewardsPoolEth(token);
  if (!token) return 0;
  return token.mode === "v4" ? v4Pool : totalFeesEth(token, share);
}
