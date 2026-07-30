"use client";
import { IconBurn } from "@/components/Icon";

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
import { chainConfig, chainParam } from "@/lib/chain";
import { useSelectedChainId } from "@/lib/useSelectedChain";
import {
  coilContracts,
  coilBurnerAbi,
  coilHookAbi,
  isDeployed,
  tokenAbi,
} from "@/lib/contracts";
import { compact, usdFromEth } from "@/lib/format";
import { useEthPrice } from "@/lib/usePrice";
import { useLiveMarkets } from "@/lib/useMarkets";

const bn = (x: unknown): bigint => (typeof x === "bigint" ? x : 0n);

/** The canonical dead address every burn ends up at (the burner sends here too). */
const DEAD = "0x000000000000000000000000000000000000dEaD" as const;

/**
 * Live $COIL buyback & burn stats, read straight from the CoilBuybackBurner: total $COIL burned,
 * ETH spent, and the ETH sitting in the burner waiting to be used. `buybackAndBurn` is
 * permissionless — the burned tokens can only ever go to the dead address — so anyone connected
 * can crank the burn button when there's pending ETH.
 */
export function BurnTicker() {
  const { isConnected } = useAccount();
  // Each chain runs its own burner against its own $COIL, so the ticker follows the network the
  // page is pointed at — otherwise browsing Arc would show Robinhood's burn totals.
  const chainId = useSelectedChainId();
  const { coilBurner: COIL_BURNER, burnerLive: BURNER_LIVE, coilToken: COIL_TOKEN } =
    coilContracts(chainId);
  const NATIVE_SYMBOL = chainConfig(chainId).nativeSymbol;
  const ethUsd = useEthPrice(chainId);
  const [flash, setFlash] = useState<string | null>(null);
  const [action, setAction] = useState<"burn" | "collect" | null>(null);

  const statsQ = useReadContracts({
    contracts: [
      { chainId, address: COIL_BURNER, abi: coilBurnerAbi, functionName: "totalCoilBurned" },
      { chainId, address: COIL_BURNER, abi: coilBurnerAbi, functionName: "totalEthSpent" },
      { chainId, address: COIL_BURNER, abi: coilBurnerAbi, functionName: "coil" },
      // Total burned from ANY source — the burner sends here too, but so do manual burns
      // (dev wallet, community). This is the headline number when COIL_TOKEN is configured.
      { chainId, address: COIL_TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [DEAD] },
    ],
    query: { enabled: BURNER_LIVE, refetchInterval: 30_000 },
  });
  const pendingQ = useBalance({
    chainId,
    address: BURNER_LIVE ? COIL_BURNER : undefined,
    query: { enabled: BURNER_LIVE, refetchInterval: 30_000 },
  });

  // Burn-slice fees still sitting INSIDE each v4 hook, waiting for a (permissionless)
  // sweepTreasury push into the burner. Read across every listed v4 token — of the SELECTED
  // chain, explicitly: every other read here follows `chainId`, and after Arc became the site
  // default the no-arg call would list Arc tokens under a Robinhood burner.
  const { tokens } = useLiveMarkets(chainId);
  const v4Tokens = tokens.filter((t) => t.mode === "v4");
  const accruedQ = useReadContracts({
    contracts: v4Tokens.map(
      (t) =>
        ({
          chainId,
          address: t.address,
          abi: coilHookAbi,
          functionName: "treasuryAccruedETH",
        }) as const,
    ),
    query: { enabled: BURNER_LIVE && v4Tokens.length > 0, refetchInterval: 30_000 },
  });
  const accruedPer = v4Tokens.map((t, i) => ({ token: t, eth: bn(accruedQ.data?.[i]?.result) }));
  const accruedTotal = accruedPer.reduce((s, x) => s + x.eth, 0n);
  const topAccrued = accruedPer.reduce(
    (best, x) => (x.eth > best.eth ? x : best),
    { token: undefined as (typeof v4Tokens)[number] | undefined, eth: 0n },
  );

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      setFlash(action === "collect" ? "Collected" : "Burned");
      statsQ.refetch();
      pendingQ.refetch();
      accruedQ.refetch();
      const t = setTimeout(() => setFlash(null), 4000);
      return () => clearTimeout(t);
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!BURNER_LIVE) return null;

  // Prefer the dead address's balance (covers buyback burns AND manual burns); fall back to the
  // burner's own counter while COIL_TOKEN isn't configured.
  const burnerBurned = bn(statsQ.data?.[0]?.result);
  const deadBalance = bn(statsQ.data?.[3]?.result);
  const burned = isDeployed(COIL_TOKEN) ? deadBalance : burnerBurned;
  const ethSpent = bn(statsQ.data?.[1]?.result);
  const coilAddr = (statsQ.data?.[2]?.result as string | undefined) ?? "";
  const coilSet = isDeployed((coilAddr || "0x0000000000000000000000000000000000000000") as `0x${string}`);
  const pending = pendingQ.data?.value ?? 0n;

  const burnedN = Number(formatEther(burned));
  const busy = isPending || confirming;
  const canBurn = coilSet && pending > 0n && isConnected;

  function collect() {
    if (!topAccrued.token) return;
    setAction("collect");
    writeContract({
      chainId,
      address: topAccrued.token.address,
      abi: coilHookAbi,
      functionName: "sweepTreasury",
    });
  }

  function burn() {
    setAction("burn");
    writeContract({
      chainId,
      address: COIL_BURNER,
      abi: coilBurnerAbi,
      functionName: "buybackAndBurn",
      args: [0n, 0n, BigInt(Math.floor(Date.now() / 1000) + 1200)], // 0 = spend the whole balance
    });
  }

  const coilLabel = isDeployed(COIL_TOKEN) ? (
    <Link href={`/token/${COIL_TOKEN}${chainParam(chainId)}`} className="font-bold text-coil-400 hover:underline">
      $COIL
    </Link>
  ) : (
    <span className="font-bold text-coil-400">$COIL</span>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-transparent px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-coil-400"><IconBurn size={20} /></span>
          <span className="font-bold text-white">{compact(burnedN, burnedN >= 1000 ? 1 : 2)}</span>
          <span className="text-ink-3">{coilLabel} burned forever</span>
        </span>
        <span className="text-xs text-ink-4">
          {Number(formatEther(ethSpent)).toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
          {NATIVE_SYMBOL} spent ({usdFromEth(Number(formatEther(ethSpent)), ethUsd, 0)})
        </span>
        {pending > 0n && (
          <span className="text-xs text-spark">
            {Number(formatEther(pending)).toLocaleString(undefined, { maximumFractionDigits: 5 })}{" "}
            {NATIVE_SYMBOL} ready to burn
          </span>
        )}
        {accruedTotal > 0n && (
          <span className="text-xs text-ink-4">
            +{Number(formatEther(accruedTotal)).toLocaleString(undefined, { maximumFractionDigits: 5 })}{" "}
            {NATIVE_SYMBOL} accruing in token fees
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {accruedTotal > 0n && !flash && (
          <button
            onClick={collect}
            disabled={!isConnected || busy}
            title={
              isConnected
                ? "Push the accrued burn-slice fees from the token into the burner. Permissionless."
                : "Connect a wallet to trigger the sweep (anyone can)."
            }
            className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-bold text-ink-3 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && action === "collect" ? "Collecting…" : "Collect"}
          </button>
        )}
        {error && (
          <span className="text-[11px] text-down">
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
            {busy ? "Burning…" : "Burn now"}
          </button>
        )}
      </div>
    </div>
  );
}
