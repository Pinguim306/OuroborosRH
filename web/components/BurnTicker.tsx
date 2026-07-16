"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import {
  useAccount,
  useBalance,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { CHAIN_ID, NATIVE_SYMBOL } from "@/lib/chain";
import { BURNER_LIVE, COIL_BURNER, COIL_TOKEN, coilBurnerAbi, isDeployed } from "@/lib/contracts";
import { compact, usdFromEth } from "@/lib/format";
import { useEthPrice } from "@/lib/usePrice";

const bn = (x: unknown): bigint => (typeof x === "bigint" ? x : 0n);

/**
 * Live $COIL buyback & burn stats, read straight from the CoilBuybackBurner: total $COIL burned,
 * ETH spent, and the ETH sitting in the burner waiting to be used. `buybackAndBurn` is
 * permissionless — the burned tokens can only ever go to the dead address — so anyone connected
 * can crank the 🔥 button when there's pending ETH.
 */
export function BurnTicker() {
  const { isConnected } = useAccount();
  const ethUsd = useEthPrice();
  const [flash, setFlash] = useState<string | null>(null);

  const statsQ = useReadContracts({
    contracts: [
      { chainId: CHAIN_ID, address: COIL_BURNER, abi: coilBurnerAbi, functionName: "totalCoilBurned" },
      { chainId: CHAIN_ID, address: COIL_BURNER, abi: coilBurnerAbi, functionName: "totalEthSpent" },
      { chainId: CHAIN_ID, address: COIL_BURNER, abi: coilBurnerAbi, functionName: "coil" },
    ],
    query: { enabled: BURNER_LIVE, refetchInterval: 30_000 },
  });
  const pendingQ = useBalance({
    chainId: CHAIN_ID,
    address: BURNER_LIVE ? COIL_BURNER : undefined,
    query: { enabled: BURNER_LIVE, refetchInterval: 30_000 },
  });

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      setFlash("Burned 🔥");
      statsQ.refetch();
      pendingQ.refetch();
      const t = setTimeout(() => setFlash(null), 4000);
      return () => clearTimeout(t);
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!BURNER_LIVE) return null;

  const burned = bn(statsQ.data?.[0]?.result);
  const ethSpent = bn(statsQ.data?.[1]?.result);
  const coilAddr = (statsQ.data?.[2]?.result as string | undefined) ?? "";
  const coilSet = isDeployed((coilAddr || "0x0000000000000000000000000000000000000000") as `0x${string}`);
  const pending = pendingQ.data?.value ?? 0n;

  const burnedN = Number(formatEther(burned));
  const busy = isPending || confirming;
  const canBurn = coilSet && pending > 0n && isConnected;

  function burn() {
    writeContract({
      chainId: CHAIN_ID,
      address: COIL_BURNER,
      abi: coilBurnerAbi,
      functionName: "buybackAndBurn",
      args: [0n, 0n, BigInt(Math.floor(Date.now() / 1000) + 1200)], // 0 = spend the whole balance
    });
  }

  const coilLabel = isDeployed(COIL_TOKEN) ? (
    <Link href={`/token/${COIL_TOKEN}`} className="font-bold text-venom-400 hover:underline">
      $COIL
    </Link>
  ) : (
    <span className="font-bold text-venom-400">$COIL</span>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-transparent px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-xl">🔥</span>
          <span className="font-bold text-white">{compact(burnedN, burnedN >= 1000 ? 1 : 2)}</span>
          <span className="text-white/60">{coilLabel} burned forever</span>
        </span>
        <span className="text-xs text-white/40">
          {Number(formatEther(ethSpent)).toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
          {NATIVE_SYMBOL} spent ({usdFromEth(Number(formatEther(ethSpent)), ethUsd, 0)})
        </span>
        {pending > 0n && (
          <span className="text-xs text-acid">
            {Number(formatEther(pending)).toLocaleString(undefined, { maximumFractionDigits: 5 })}{" "}
            {NATIVE_SYMBOL} ready to burn
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {error && (
          <span className="text-[11px] text-red-400">
            {(error as { shortMessage?: string }).shortMessage ?? "Burn failed."}
          </span>
        )}
        {flash ? (
          <span className="text-sm font-bold text-orange-400">{flash}</span>
        ) : (
          <button
            onClick={burn}
            disabled={!canBurn || busy}
            title={
              !coilSet
                ? "The burner isn't pointed at $COIL yet."
                : pending === 0n
                  ? "No ETH accrued to burn yet — fees fill this up with every trade."
                  : !isConnected
                    ? "Connect a wallet to trigger the burn (anyone can)."
                    : "Swap the accrued ETH for $COIL and burn it. Permissionless."
            }
            className="rounded-xl border border-orange-500/40 px-3.5 py-1.5 text-xs font-bold text-orange-400 transition hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Burning…" : "Burn now 🔥"}
          </button>
        )}
      </div>
    </div>
  );
}
