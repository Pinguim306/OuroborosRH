"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, isAddress, maxUint256, parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address } from "@/lib/types";
import { CHAIN_ID, NATIVE_SYMBOL } from "@/lib/chain";
import {
  COIL_SWAP_ROUTER,
  SWAP_LIVE,
  coilPoolKey,
  coilSwapRouterAbi,
  tokenAbi,
} from "@/lib/contracts";
import { WalletButton } from "./WalletButton";

const SLIPPAGE_OPTIONS = [
  { label: "1%", bps: 100n },
  { label: "3%", bps: 300n },
  { label: "5%", bps: 500n },
];

function safeParseEther(v: string): bigint {
  try {
    return v ? parseEther(v) : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Swap ETH ↔ a Coil (v4) token through the CoilSwapRouter, which skims the interface fee. The
 * quote comes from an eth_call simulation of the swap itself (the router returns `amountOut`), so
 * it already reflects both the interface fee and the hook's own per-swap fee.
 */
export function SwapWidget() {
  const { address, isConnected } = useAccount();
  const [tokenInput, setTokenInput] = useState("");
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(300n);
  const [flash, setFlash] = useState<string | null>(null);

  const token = useMemo<Address | null>(
    () => (isAddress(tokenInput) ? (tokenInput as Address) : null),
    [tokenInput],
  );
  const amountWei = safeParseEther(amount);
  const zeroForOne = mode === "buy"; // buy = ETH(currency0) → token(currency1)
  const deadline = useMemo(() => BigInt(Math.floor(Date.now() / 1000) + 1200), [amount, mode]);

  // --- Sell-side reads: the trader's token balance + allowance to the router ---
  const { data: tokenBal } = useReadContract({
    chainId: CHAIN_ID,
    address: token ?? undefined,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: SWAP_LIVE && !!token && !!address && !zeroForOne },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    chainId: CHAIN_ID,
    address: token ?? undefined,
    abi: tokenAbi,
    functionName: "allowance",
    args: address ? [address, COIL_SWAP_ROUTER] : undefined,
    query: { enabled: SWAP_LIVE && !!token && !!address && !zeroForOne },
  });

  const needsApproval = !zeroForOne && amountWei > 0n && (allowance ?? 0n) < amountWei;

  // --- Quote via a simulation of the real swap (returns amountOut) ---
  // Buys need no allowance; sells only quote once the router is approved.
  const quoteReady =
    SWAP_LIVE && !!token && !!address && amountWei > 0n && (zeroForOne || !needsApproval);

  const { data: sim, error: simError } = useSimulateContract({
    chainId: CHAIN_ID,
    address: COIL_SWAP_ROUTER,
    abi: coilSwapRouterAbi,
    functionName: "swapExactInSingle",
    args: token
      ? [coilPoolKey(token), zeroForOne, amountWei, 0n, address ?? COIL_SWAP_ROUTER, deadline]
      : undefined,
    value: zeroForOne ? amountWei : 0n,
    query: { enabled: quoteReady },
  });

  const quotedOut = (sim?.result as bigint | undefined) ?? 0n;
  const minOut = (quotedOut * (10000n - slippage)) / 10000n;

  // --- Writes ---
  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      setFlash(mode === "buy" ? "Bought ✓" : "Sold ✓");
      setAmount("");
      refetchAllowance();
      const t = setTimeout(() => {
        setFlash(null);
        reset();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  function approve() {
    if (!token) return;
    writeContract({
      chainId: CHAIN_ID,
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [COIL_SWAP_ROUTER, maxUint256],
    });
  }

  function swap() {
    if (!token || !address) return;
    writeContract({
      chainId: CHAIN_ID,
      address: COIL_SWAP_ROUTER,
      abi: coilSwapRouterAbi,
      functionName: "swapExactInSingle",
      args: [coilPoolKey(token), zeroForOne, amountWei, minOut, address, deadline],
      value: zeroForOne ? amountWei : 0n,
    });
  }

  const inSym = zeroForOne ? NATIVE_SYMBOL : "token";
  const outSym = zeroForOne ? "token" : NATIVE_SYMBOL;
  const busy = isPending || confirming;

  if (!SWAP_LIVE) {
    return (
      <div className="glass-strong p-6">
        <p className="text-sm text-white/70">
          The Swap router isn&apos;t deployed on this environment yet. Set{" "}
          <code className="text-venom-400">NEXT_PUBLIC_COIL_SWAP_ROUTER</code> once it&apos;s live.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-strong space-y-4 p-6">
      {/* direction toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("buy")}
          className={`btn ${mode === "buy" ? "btn-primary" : "btn-ghost"}`}
        >
          Buy
        </button>
        <button
          onClick={() => setMode("sell")}
          className={`btn ${mode === "sell" ? "btn-primary" : "btn-ghost"}`}
        >
          Sell
        </button>
      </div>

      <div>
        <label className="label">Coil token address</label>
        <input
          className="field mt-1 font-mono"
          placeholder="0x…"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value.trim())}
          spellCheck={false}
        />
        {tokenInput && !token && (
          <p className="mt-1 text-xs text-red-400">Not a valid address.</p>
        )}
      </div>

      <div>
        <label className="label">You pay ({inSym})</label>
        <input
          className="field mt-1"
          placeholder="0.0"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {!zeroForOne && tokenBal !== undefined && (
          <button
            className="mt-1 text-xs text-white/40 hover:text-venom-400"
            onClick={() => setAmount(formatEther(tokenBal as bigint))}
          >
            Balance: {Number(formatEther(tokenBal as bigint)).toLocaleString()} — max
          </button>
        )}
      </div>

      {/* slippage */}
      <div className="flex items-center gap-2">
        <span className="label">Max slippage</span>
        {SLIPPAGE_OPTIONS.map((o) => (
          <button
            key={o.label}
            onClick={() => setSlippage(o.bps)}
            className={`chip ${slippage === o.bps ? "border-venom-500/60 text-white" : ""}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* quote */}
      <div className="rounded-xl border border-white/5 bg-obsidian-900/60 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-white/40">Est. received ({outSym})</span>
          <span className="font-medium text-white">
            {quotedOut > 0n ? Number(formatEther(quotedOut)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—"}
          </span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-white/40">Min. received</span>
          <span className="text-white/70">
            {minOut > 0n ? Number(formatEther(minOut)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—"}
          </span>
        </div>
        {simError && amountWei > 0n && !needsApproval && (
          <p className="mt-2 text-xs text-amber-400">
            No route / pool for this token, or the amount is too large for its liquidity.
          </p>
        )}
      </div>

      {/* action */}
      {!isConnected ? (
        <WalletButton />
      ) : needsApproval ? (
        <button className="btn-primary w-full" disabled={busy || !token} onClick={approve}>
          {busy ? "Approving…" : "Approve token"}
        </button>
      ) : (
        <button
          className="btn-primary w-full"
          disabled={busy || !token || amountWei === 0n || quotedOut === 0n}
          onClick={swap}
        >
          {busy ? "Swapping…" : flash ?? `Swap ${inSym} → ${outSym}`}
        </button>
      )}

      {writeError && (
        <p className="text-xs text-red-400">{(writeError as { shortMessage?: string }).shortMessage ?? "Transaction failed."}</p>
      )}

      <p className="text-center text-[11px] text-white/30">
        Routed through Coil · a small interface fee supports the protocol.
      </p>
    </div>
  );
}
