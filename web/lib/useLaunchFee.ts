"use client";

import { useReadContract } from "wagmi";
import { ContractFunctionExecutionError } from "viem";
import { coilContracts, coilLaunchpadV4Abi } from "./contracts";
import { asSupportedChainId } from "./chain";

/**
 * Retry policy for the version/bounds reads. Two very different failures land here and they must
 * not be treated alike:
 *
 * - the CONTRACT failing the call — a v3 launchpad genuinely has no `LAUNCHPAD_VERSION` getter.
 *   That failure IS the version detection; retrying it would re-ask a question whose answer cannot
 *   change, so it stops immediately.
 * - the TRANSPORT failing — a 429, a timeout, a flaky RPC. Giving up on the first one of those
 *   permanently hides the fee-rate control on a v4 chain (the launch then falls back to the old
 *   call signature and reverts), which is how a rate-limited public RPC made the control vanish in
 *   production. Those get retried.
 */
const retryTransportOnly = (failureCount: number, error: Error) =>
  !(error instanceof ContractFunctionExecutionError) && failureCount < 3;

/** The rate a creator gets if they never touch the control — 2%, the middle of the allowed range. */
export const DEFAULT_TOTAL_FEE_BPS = 200;

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

  // v3 launchpads have none of these getters, so a CONTRACT failure here is the detection itself;
  // a TRANSPORT failure is retried — see retryTransportOnly.
  const { data: version, isFetched: versionSettled } = useReadContract({
    chainId: id,
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "LAUNCHPAD_VERSION",
    query: { enabled: launchLive, retry: retryTransportOnly, staleTime: Infinity },
  });

  const supportsRate = typeof version === "bigint" && version >= 4n;

  const { data: minBps } = useReadContract({
    chainId: id,
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "MIN_FEE_BPS",
    query: { enabled: launchLive && supportsRate, retry: retryTransportOnly, staleTime: Infinity },
  });
  const { data: maxBps } = useReadContract({
    chainId: id,
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "MAX_FEE_BPS",
    query: { enabled: launchLive && supportsRate, retry: retryTransportOnly, staleTime: Infinity },
  });

  const configurable = supportsRate && minBps !== undefined && maxBps !== undefined;

  return {
    /** Undefined until the read lands; 3 or lower means a fixed, deploy-time split. */
    version,
    /**
     * False while the version is still being read on a live chain. The launch flow MUST hold until
     * this settles: the create signature depends on the version, and firing the pre-v4 call at a
     * v4 launchpad while the read is in flight produces a revert with nothing to explain it. On a
     * chain with no launchpad there is nothing to wait for.
     */
    versionKnown: !launchLive || versionSettled,
    /** The launchpad takes a rate (version >= 4) — even if its bounds are still being read. */
    supportsRate,
    /** True once we know this chain's launchpad takes a creator-chosen rate AND what its limits are. */
    configurable,
    minBps: configurable ? Number(minBps) : undefined,
    maxBps: configurable ? Number(maxBps) : undefined,
  };
}
