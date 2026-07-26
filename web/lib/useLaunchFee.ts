"use client";

import { useReadContract } from "wagmi";
import { coilContracts, coilLaunchpadV4Abi } from "./contracts";
import { asSupportedChainId } from "./chain";

/** The rate a creator gets if they never touch the control — 2%, the middle of the allowed range. */
export const DEFAULT_TOTAL_FEE_BPS = 200;

export type FeeSplit = { protocolBps: number; holderBps: number; burnBps: number };

/**
 * What the launchpad ON THIS CHAIN lets a creator choose.
 *
 * The two live launchpads disagree, and that is by design rather than a migration to finish:
 * Robinhood Chain runs `LAUNCHPAD_VERSION` 3, whose fee split is fixed at deployment, while Arc is
 * deployed at 4, where the creator picks the total rate. Redeploying Robinhood's just to unify the
 * ABI would strand the tokens already launched there, so the site asks each chain what it is.
 *
 * `configurable` deliberately waits for the bounds as well as the version. They come from the
 * contract rather than from constants here because they gate what the creator can pick, and a
 * frontend guessing a range wider than the deployed one would offer rates that revert at signing.
 */
export function useLaunchFee(chainId?: number) {
  const id = asSupportedChainId(chainId);
  const { coilLaunchpad, launchLive } = coilContracts(id);

  // v3 launchpads have none of these getters, so the reads simply fail there. That failure IS the
  // detection — `retry: false` keeps it to one attempt instead of a background retry storm.
  const { data: version } = useReadContract({
    chainId: id,
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "LAUNCHPAD_VERSION",
    query: { enabled: launchLive, retry: false, staleTime: Infinity },
  });

  const supportsRate = typeof version === "bigint" && version >= 4n;

  const { data: minBps } = useReadContract({
    chainId: id,
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "MIN_FEE_BPS",
    query: { enabled: launchLive && supportsRate, retry: false, staleTime: Infinity },
  });
  const { data: maxBps } = useReadContract({
    chainId: id,
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "MAX_FEE_BPS",
    query: { enabled: launchLive && supportsRate, retry: false, staleTime: Infinity },
  });

  const configurable = supportsRate && minBps !== undefined && maxBps !== undefined;

  return {
    /** Undefined until the read lands; 3 or lower means a fixed, deploy-time split. */
    version,
    /** True once we know this chain's launchpad takes a creator-chosen rate AND what its limits are. */
    configurable,
    minBps: configurable ? Number(minBps) : undefined,
    maxBps: configurable ? Number(maxBps) : undefined,
  };
}

/**
 * The exact waterfall `totalFeeBps` produces, straight from the contract.
 *
 * Not computed here on purpose: the curve is owner-tunable on-chain, so any copy of the maths in
 * the frontend is one `setFeeCurve` away from showing a creator a split they will not get.
 */
export function useFeeSplit(totalFeeBps: number, enabled: boolean, chainId?: number): FeeSplit | undefined {
  const id = asSupportedChainId(chainId);
  const { coilLaunchpad, launchLive } = coilContracts(id);

  const { data } = useReadContract({
    chainId: id,
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "resolveFees",
    args: [BigInt(totalFeeBps)],
    query: { enabled: enabled && launchLive, retry: false },
  });

  if (!data) return undefined;
  const split = data as { protocolBps: bigint; holderBps: bigint; burnBps: bigint };
  return {
    protocolBps: Number(split.protocolBps),
    holderBps: Number(split.holderBps),
    burnBps: Number(split.burnBps),
  };
}
