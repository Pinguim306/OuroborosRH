"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatEther, maxUint256, parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address, TokenMarket } from "@/lib/types";
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
const MAX_SLIPPAGE_PCT = 49;
const USD_PRESETS = [25, 100, 250];
const ETH_PRESETS = ["0.01", "0.05", "0.1"];
const PCT_PRESETS = [25, 50, 100];

function safeParseEther(v: string): bigint {
  try {
    return v ? parseEther(v) : 0n;
  } catch {
    return 0n;
  }
}
function fmt(x: bigint, dp = 4) {
  return Number(formatEther(x)).toLocaleString(undefined, { maximumFractionDigits: dp });
}

/**
 * Compact buy/sell widget for a v4 (CoilHook) token, embedded on its token page so trading never
 * requires leaving the screen. Same route as the Swap page: quotes come from an eth_call
 * simulation of the real `swapExactInSingle`, and the swap executes through the CoilSwapRouter.
 */
export function V4TradeWidget({ token, ethUsd = 0 }: { token: TokenMarket; ethUsd?: number }) {
  const { address, isConnected } = useAccount();
  const [dir, setDir] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(300n);
  const [customSlip, setCustomSlip] = useState("");
  const [slipOpen, setSlipOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const isBuy = dir === "buy";
  const tokenAddr = token.address as Address;
  const amountWei = safeParseEther(amount);
  const deadline = useMemo(() => BigInt(Math.floor(Date.now() / 1000) + 1200), [amount, dir]);

  const { data: tokenBal, refetch: refetchBal } = useReadContract({
    chainId: CHAIN_ID,
    address: tokenAddr,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    chainId: CHAIN_ID,
    address: tokenAddr,
    abi: tokenAbi,
    functionName: "allowance",
    args: address ? [address, COIL_SWAP_ROUTER] : undefined,
    query: { enabled: !!address && !isBuy },
  });

  const needsApproval = !isBuy && amountWei > 0n && (allowance ?? 0n) < amountWei;
  const quoteReady = SWAP_LIVE && !!address && amountWei > 0n && (isBuy || !needsApproval);

  const { data: sim, error: simError } = useSimulateContract({
    chainId: CHAIN_ID,
    address: COIL_SWAP_ROUTER,
    abi: coilSwapRouterAbi,
    functionName: "swapExactInSingle",
    args: [coilPoolKey(tokenAddr), isBuy, amountWei, 0n, address ?? COIL_SWAP_ROUTER, deadline],
    value: isBuy ? amountWei : 0n,
    query: { enabled: quoteReady },
  });
  const quotedOut = (sim?.result as bigint | undefined) ?? 0n;
  const minOut = (quotedOut * (10000n - slippage)) / 10000n;

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      setFlash("Done ✓");
      setAmount("");
      refetchAllowance();
      refetchBal();
      const t = setTimeout(() => {
        setFlash(null);
        reset();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  function onCustomSlip(raw: string) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    if (cleaned === "") {
      setCustomSlip("");
      return;
    }
    const n = parseFloat(cleaned);
    if (Number.isNaN(n)) {
      setCustomSlip(cleaned);
      return;
    }
    const clamped = Math.min(n, MAX_SLIPPAGE_PCT);
    setCustomSlip(n > MAX_SLIPPAGE_PCT ? String(MAX_SLIPPAGE_PCT) : cleaned);
    setSlippage(BigInt(Math.round(clamped * 100)));
  }

  function approve() {
    writeContract({
      chainId: CHAIN_ID,
      address: tokenAddr,
      abi: tokenAbi,
      functionName: "approve",
      args: [COIL_SWAP_ROUTER, maxUint256],
    });
  }

  function swap() {
    if (!address || amountWei === 0n) return;
    writeContract({
      chainId: CHAIN_ID,
      address: COIL_SWAP_ROUTER,
      abi: coilSwapRouterAbi,
      functionName: "swapExactInSingle",
      args: [coilPoolKey(tokenAddr), isBuy, amountWei, minOut, address, deadline],
      value: isBuy ? amountWei : 0n,
    });
  }

  // Quick-amount chips: buys use USD presets converted at the live ETH price (ETH presets when the
  // feed is down); sells use percentages of the wallet's token balance.
  function pickUsd(usd: number) {
    if (ethUsd > 0) setAmount((usd / ethUsd).toFixed(6));
  }
  function pickPct(pct: number) {
    const bal = (tokenBal as bigint | undefined) ?? 0n;
    if (bal === 0n) return;
    setAmount(formatEther((bal * BigInt(pct)) / 100n));
  }

  const busy = isPending || confirming;
  const usdIn = ethUsd > 0 && isBuy ? parseFloat(amount || "0") * ethUsd : 0;
  const balance = (tokenBal as bigint | undefined) ?? 0n;

  if (!SWAP_LIVE) {
    return (
      <div className="glass p-6 text-center text-sm text-white/50">
        Coil Swap isn&apos;t configured yet — set{" "}
        <code className="text-venom-400">NEXT_PUBLIC_COIL_SWAP_ROUTER</code>.
      </div>
    );
  }

  return (
    <div className="glass p-4">
      {/* Buy / Sell tabs + slippage gear */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-xl bg-obsidian-900 p-1 text-sm font-bold">
          {(["buy", "sell"] as const).map((d) => (
            <button
              key={d}
              onClick={() => {
                setDir(d);
                setAmount("");
              }}
              className={`flex-1 rounded-lg px-3 py-2 capitalize transition ${
                dir === d
                  ? d === "buy"
                    ? "bg-venom-500 text-obsidian-950"
                    : "bg-red-500/90 text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSlipOpen((o) => !o)}
          title="Slippage settings"
          className={`grid h-9 w-9 place-items-center rounded-xl border text-sm transition ${
            slipOpen ? "border-venom-500/50 text-venom-400" : "border-white/10 text-white/50 hover:text-white"
          }`}
        >
          ⚙
        </button>
      </div>

      {/* Slippage panel */}
      {slipOpen && (
        <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-white/5 bg-obsidian-900/60 p-2 text-xs">
          <span className="px-1 text-white/40">Slippage</span>
          {SLIPPAGE_OPTIONS.map((o) => (
            <button
              key={o.label}
              onClick={() => {
                setSlippage(o.bps);
                setCustomSlip("");
              }}
              className={`rounded-lg px-2 py-1 font-semibold transition ${
                slippage === o.bps && customSlip === ""
                  ? "bg-venom-500/15 text-venom-400"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {o.label}
            </button>
          ))}
          <div className="flex items-center gap-1 rounded-lg bg-obsidian-950 px-2 py-1">
            <input
              className="w-10 bg-transparent text-right font-mono text-white outline-none placeholder:text-white/25"
              placeholder="0.5"
              inputMode="decimal"
              value={customSlip}
              onChange={(e) => onCustomSlip(e.target.value)}
            />
            <span className="text-white/40">%</span>
          </div>
        </div>
      )}

      {/* Amount */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-obsidian-900/60 p-4">
        <div className="flex items-center gap-3">
          <input
            className="min-w-0 flex-1 bg-transparent text-3xl font-semibold text-white outline-none placeholder:text-white/20"
            placeholder="0"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <span className="chip shrink-0">{isBuy ? NATIVE_SYMBOL : token.symbol}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-white/40">
          <span>{isBuy && usdIn > 0 ? `≈ $${usdIn.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}</span>
          {!isBuy && address && (
            <button className="hover:text-venom-400" onClick={() => pickPct(100)}>
              Balance: {fmt(balance)} — max
            </button>
          )}
        </div>
      </div>

      {/* Quick chips */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {isBuy
          ? ethUsd > 0
            ? USD_PRESETS.map((u) => (
                <button
                  key={u}
                  onClick={() => pickUsd(u)}
                  className="rounded-xl border border-white/10 py-1.5 text-xs font-semibold text-white/60 transition hover:border-venom-500/40 hover:text-venom-400"
                >
                  ${u}
                </button>
              ))
            : ETH_PRESETS.map((e) => (
                <button
                  key={e}
                  onClick={() => setAmount(e)}
                  className="rounded-xl border border-white/10 py-1.5 text-xs font-semibold text-white/60 transition hover:border-venom-500/40 hover:text-venom-400"
                >
                  {e} {NATIVE_SYMBOL}
                </button>
              ))
          : PCT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => pickPct(p)}
                className="rounded-xl border border-white/10 py-1.5 text-xs font-semibold text-white/60 transition hover:border-venom-500/40 hover:text-venom-400"
              >
                {p}%
              </button>
            ))}
      </div>

      {/* Quote */}
      {amountWei > 0n && isConnected && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-obsidian-900/50 px-3 py-2 text-xs">
          <span className="text-white/40">You receive (est.)</span>
          <span className="font-mono font-semibold text-white">
            {quotedOut > 0n ? fmt(quotedOut) : simError ? "—" : "…"}{" "}
            {isBuy ? token.symbol : NATIVE_SYMBOL}
          </span>
        </div>
      )}

      {/* Action */}
      <div className="mt-3">
        {!isConnected ? (
          <div className="flex justify-center py-1">
            <WalletButton />
          </div>
        ) : needsApproval ? (
          <button className="btn-primary w-full justify-center" disabled={busy} onClick={approve}>
            {busy ? "Approving…" : `Approve ${token.symbol}`}
          </button>
        ) : (
          <button
            className={`w-full justify-center rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              isBuy
                ? "bg-venom-500 text-obsidian-950 hover:bg-venom-400"
                : "bg-red-500/90 text-white hover:bg-red-500"
            }`}
            disabled={busy || amountWei === 0n || quotedOut === 0n}
            onClick={swap}
          >
            {busy
              ? "Confirming…"
              : flash ?? (isBuy ? `Buy $${token.symbol}` : `Sell $${token.symbol}`)}
          </button>
        )}
      </div>

      {(writeError || (simError && amountWei > 0n)) && (
        <p className="mt-2 text-center text-[11px] text-red-400">
          {(writeError as { shortMessage?: string })?.shortMessage ??
            (simError ? "Couldn't quote this trade — check the amount." : "Transaction failed.")}
        </p>
      )}

      <p className="mt-3 text-center text-[11px] text-white/30">
        Routed through the Uniswap v4 pool via Coil Swap ·{" "}
        <Link href={`/swap?token=${token.address}`} className="text-venom-400 hover:underline">
          open full swap ↗
        </Link>
      </p>
    </div>
  );
}
