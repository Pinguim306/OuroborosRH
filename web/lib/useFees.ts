"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS, LIVE, launchpadAbi, feeLockerAbi } from "./contracts";
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

/** Single-token convenience wrapper around useHolderShare + totalFeesEth. */
export function useTotalFeesEth(token?: TokenMarket): number {
  const share = useHolderShare(token?.mode === "v3", token?.launchpad);
  return token ? totalFeesEth(token, share) : 0;
}
