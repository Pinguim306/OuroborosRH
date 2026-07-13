"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { CONTRACTS, launchpadAbi, feeLockerAbi } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { usdFromEth } from "@/lib/format";
import { useEthPrice } from "@/lib/usePrice";
import type { Address, TokenMarket } from "@/lib/types";

/**
 * Harvest a V3 token's accrued pool fees. In V3 mode the 1% pool fee accrues
 * INSIDE the Uniswap position; it only becomes protocol revenue + holder rewards
 * when someone cranks FeeLocker.collect() — which is permissionless, so we let
 * anyone do it right from the token page.
 */
export function HarvestFees({ token }: { token: TokenMarket }) {
  const client = usePublicClient();
  const ethUsd = useEthPrice();
  const [positionId, setPositionId] = useState<bigint | undefined>();
  const [pending, setPending] = useState<{ eth: number; tok: number } | undefined>();

  const lockerQ = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "feeLocker",
  });
  const locker = lockerQ.data as Address | undefined;

  // ETH-side fees are split on harvest: holderShareBps to holders, rest to the
  // protocol — surfaced so "uncollected" matches what actually lands in the pool.
  const shareQ = useReadContract({
    address: locker,
    abi: feeLockerAbi,
    functionName: "holderShareBps",
    query: { enabled: !!locker },
  });
  const holderShare = typeof shareQ.data === "bigint" ? Number(shareQ.data) / 10_000 : undefined;

  // Resolve the token's locked position id from the locker's PositionLocked event.
  useEffect(() => {
    if (!client || !locker) return;
    let alive = true;
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: locker,
          abi: feeLockerAbi,
          eventName: "PositionLocked",
          args: { token: token.address },
          fromBlock: 0n,
          toBlock: "latest",
        });
        const id = (logs[0]?.args as { tokenId?: bigint } | undefined)?.tokenId;
        if (alive && typeof id === "bigint") setPositionId(id);
      } catch {
        /* leave undefined — button stays hidden */
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, locker, token.address]);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || confirming;

  // Quote the uncollected fees by SIMULATING collect() (eth_call — nothing is
  // executed): the return values are exactly what a harvest would pay out now.
  useEffect(() => {
    if (!client || !locker || positionId === undefined) return;
    let alive = true;
    (async () => {
      try {
        const { result } = await client.simulateContract({
          address: locker,
          abi: feeLockerAbi,
          functionName: "collect",
          args: [positionId],
        });
        const [ethSide, tokSide] = result as readonly [bigint, bigint];
        if (alive)
          setPending({ eth: Number(formatEther(ethSide)), tok: Number(formatEther(tokSide)) });
      } catch {
        if (alive) setPending(undefined);
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, locker, positionId, isSuccess]);

  if (!locker || positionId === undefined) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-obsidian-900/50 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-white/45">
          The pool&apos;s 1% swap fee accrues inside the locked position. Anyone can harvest it —
          rewards stream to holders and the protocol on collection.
        </p>
        {pending && (
          <p className="mt-1 text-xs font-medium text-venom-400">
            Uncollected: {usdFromEth(pending.eth, ethUsd, 2)}
            {holderShare !== undefined && pending.eth > 0 && (
              <span className="font-normal text-white/45">
                {" "}
                — {usdFromEth(pending.eth * holderShare, ethUsd, 2)} to holders (
                {Math.round(holderShare * 100)}%), {usdFromEth(pending.eth * (1 - holderShare), ethUsd, 2)} to
                the protocol
              </span>
            )}
          </p>
        )}
      </div>
      <button
        onClick={() =>
          writeContract({ chainId: CHAIN_ID, address: locker, abi: feeLockerAbi, functionName: "collect", args: [positionId] })
        }
        disabled={busy}
        className="btn-ghost shrink-0"
      >
        {busy ? "Harvesting…" : isSuccess ? "✓ Harvested" : "Harvest fees"}
      </button>
      {error && (
        <p className="w-full text-[11px] text-red-400">
          {(error as { shortMessage?: string }).shortMessage ?? "Harvest failed."}
        </p>
      )}
    </div>
  );
}
