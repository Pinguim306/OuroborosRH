"use client";

import { getEventsRanged } from "@/lib/logsRanged";
import { useEffect, useState } from "react";
import { formatEther, formatUnits } from "viem";
import { usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { CONTRACTS, arcPoolLockerAbi, launchpadAbi, feeLockerAbi } from "@/lib/contracts";
import { asSupportedChainId, v3QuoteOf } from "@/lib/chain";
import { usdFromEth } from "@/lib/format";
import { useEthPrice } from "@/lib/usePrice";
import type { Address, TokenMarket } from "@/lib/types";

/**
 * Harvest a V3 token's accrued pool fees. In V3 mode the 1% pool fee accrues
 * INSIDE the Uniswap position; it only becomes protocol revenue + holder rewards
 * when someone cranks the locker's collect() — which is permissionless, so we let
 * anyone do it right from the token page.
 *
 * Two locker generations answer here: Robinhood's FeeLocker custodies position
 * NFTs (collect by tokenId, resolved from its PositionLocked event) and Arc's
 * ArcPoolLocker holds pool-level positions keyed by token (collect by address,
 * USDC side in the facade's 6-decimal units).
 */
export function HarvestFees({ token }: { token: TokenMarket }) {
  const chainId = asSupportedChainId(token.chainId);
  const client = usePublicClient({ chainId });
  const ethUsd = useEthPrice(chainId);
  const arcStyle = !!v3QuoteOf(chainId); // facade-quoted chain → ArcPoolLocker semantics
  const quoteDecimals = v3QuoteOf(chainId)?.decimals ?? 18;
  const [positionId, setPositionId] = useState<bigint | undefined>();
  const [pending, setPending] = useState<{ eth: number; tok: number } | undefined>();

  // The position lives in the locker of the launchpad that CREATED this token —
  // for legacy tokens that is not the current primary launchpad.
  const lockerQ = useReadContract({
    address: token.launchpad ?? CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "feeLocker",
    chainId,
  });
  const locker = lockerQ.data as Address | undefined;

  // Legacy locker only: resolve the token's position NFT id from PositionLocked.
  useEffect(() => {
    if (!client || !locker || arcStyle) return;
    let alive = true;
    (async () => {
      try {
        const logs = await getEventsRanged(client, {
          address: locker,
          abi: feeLockerAbi,
          eventName: "PositionLocked",
          args: { token: token.address },
          fromBlock: 0n,
          toBlock: "latest",
        }) as { args?: Record<string, unknown> }[];
        const id = (logs[0]?.args as { tokenId?: bigint } | undefined)?.tokenId;
        if (alive && typeof id === "bigint") setPositionId(id);
      } catch {
        /* leave undefined — button stays hidden */
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, locker, token.address, arcStyle]);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || confirming;

  // Quote the uncollected fees by SIMULATING collect() (eth_call — nothing is
  // executed): the return values are exactly what a harvest would pay out now.
  useEffect(() => {
    if (!client || !locker) return;
    if (!arcStyle && positionId === undefined) return;
    let alive = true;
    (async () => {
      try {
        const { result } = arcStyle
          ? await client.simulateContract({
              address: locker,
              abi: arcPoolLockerAbi,
              functionName: "collect",
              args: [token.address],
            })
          : await client.simulateContract({
              address: locker,
              abi: feeLockerAbi,
              functionName: "collect",
              args: [positionId!],
            });
        const [quoteSide, tokSide] = result as readonly [bigint, bigint];
        if (alive)
          setPending({
            eth: Number(formatUnits(quoteSide, quoteDecimals)),
            tok: Number(formatEther(tokSide)),
          });
      } catch {
        if (alive) setPending(undefined);
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, locker, positionId, isSuccess, arcStyle, token.address, quoteDecimals]);

  if (!locker || (!arcStyle && positionId === undefined)) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-obsidian-900/50 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-ink-3">
          The pool&apos;s 1% swap fee accrues inside the locked position. Anyone can harvest it —
          rewards stream to holders and the protocol on collection.
        </p>
        {pending && (
          <p className="mt-1 text-xs font-medium text-coil-400">
            Uncollected: {usdFromEth(pending.eth, ethUsd, 2)}
          </p>
        )}
      </div>
      <button
        onClick={() =>
          arcStyle
            ? writeContract({
                chainId,
                address: locker,
                abi: arcPoolLockerAbi,
                functionName: "collect",
                args: [token.address],
              })
            : writeContract({
                chainId,
                address: locker,
                abi: feeLockerAbi,
                functionName: "collect",
                args: [positionId!],
              })
        }
        disabled={busy}
        className="btn-ghost shrink-0"
      >
        {busy ? "Harvesting…" : isSuccess ? "✓ Harvested" : "Harvest fees"}
      </button>
      {error && (
        <p className="w-full text-[11px] text-down">
          {(error as { shortMessage?: string }).shortMessage ?? "Harvest failed."}
        </p>
      )}
    </div>
  );
}
