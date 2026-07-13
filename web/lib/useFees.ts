"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS, LIVE, launchpadAbi, feeLockerAbi } from "./contracts";
import type { Address, TokenMarket } from "./types";

/**
 * Total fees a token has paid out so far, in ETH — the number shown as
 * "Rewards pool" / "Pool paid out".
 *
 * Curve tokens stream their holder fee straight into the token, so
 * totalRewardsDistributed (rewardsPoolRh) already is the total. V3 tokens only
 * stream holderShareBps of each harvest's ETH side to holders — the rest goes to
 * the protocol in the same collect() — so the total collected is the distributed
 * amount scaled back up by that share.
 */
export function useTotalFeesEth(token?: TokenMarket): number {
  const isV3 = token?.mode === "v3";

  const lockerQ = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "feeLocker",
    query: { enabled: LIVE && isV3 },
  });
  const locker = lockerQ.data as Address | undefined;

  const shareQ = useReadContract({
    address: locker,
    abi: feeLockerAbi,
    functionName: "holderShareBps",
    query: { enabled: LIVE && isV3 && !!locker },
  });
  const share = typeof shareQ.data === "bigint" ? Number(shareQ.data) / 10_000 : undefined;

  if (!token) return 0;
  if (isV3 && share !== undefined && share > 0) return token.rewardsPoolRh / share;
  return token.rewardsPoolRh;
}
