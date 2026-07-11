"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, maxUint256, parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { TokenMarket } from "@/lib/types";
import { copy } from "@/lib/copy";
import { compact, rh } from "@/lib/format";
import { NATIVE_SYMBOL } from "@/lib/chain";
import { LIVE, curveAbi, tokenAbi } from "@/lib/contracts";

// Total per-trade fee. The internal split (liquidity / holders / platform) lives
// in the contract and is intentionally not itemized in the UI.
const FEE = 0.015; // 1.5%
const SLIPPAGE_BPS = 500n; // 5% max slippage on live trades

function safeParseEther(v: string): bigint {
  try {
    return v ? parseEther(v) : 0n;
  } catch {
    return 0n;
  }
}

export function TradeWidget({ token }: { token: TokenMarket }) {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [simBalance, setSimBalance] = useState(0); // demo-mode balance
  const [flash, setFlash] = useState<string | null>(null);

  const num = parseFloat(amount) || 0;
  const amountWei = safeParseEther(amount);

  // --- Live reads (gated; hooks always run) ---
  const balanceQ = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: LIVE && !!address },
  });
  const allowanceQ = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "allowance",
    args: [address ?? "0x0000000000000000000000000000000000000000", token.curve],
    query: { enabled: LIVE && !!address && mode === "sell" },
  });
  const quoteBuyQ = useReadContract({
    address: token.curve,
    abi: curveAbi,
    functionName: "quoteBuy",
    args: [amountWei],
    query: { enabled: LIVE && mode === "buy" && amountWei > 0n },
  });
  const quoteSellQ = useReadContract({
    address: token.curve,
    abi: curveAbi,
    functionName: "quoteSell",
    args: [amountWei],
    query: { enabled: LIVE && mode === "sell" && amountWei > 0n },
  });

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const liveBalance = LIVE ? Number(formatEther((balanceQ.data as bigint) ?? 0n)) : simBalance;
  const balanceWei = (balanceQ.data as bigint) ?? 0n;
  const allowance = (allowanceQ.data as bigint) ?? 0n;
  const needsApproval = mode === "sell" && amountWei > 0n && allowance < amountWei;

  // Refresh + notify on a confirmed tx.
  useEffect(() => {
    if (!isSuccess) return;
    setFlash(mode === "buy" ? "Buy confirmed" : needsApproval ? "Approved" : "Sell confirmed");
    if (!needsApproval) setAmount("");
    balanceQ.refetch?.();
    allowanceQ.refetch?.();
    const t = setTimeout(() => {
      setFlash(null);
      reset();
    }, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const quote = useMemo(() => {
    if (mode === "buy") {
      const net = num * (1 - FEE);
      const tokensOut = token.priceRh > 0 ? net / token.priceRh : 0;
      return { fee: num * FEE, outLabel: `${compact(tokensOut, 2)} ${token.symbol}` };
    }
    const gross = num * token.priceRh;
    return { fee: gross * FEE, outLabel: rh(gross * (1 - FEE), 4) };
  }, [mode, num, token.priceRh, token.symbol]);

  function minusSlippage(x: bigint): bigint {
    return (x * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  }

  function submit() {
    if (num <= 0 || token.graduated) return;

    if (!LIVE) {
      if (mode === "buy") {
        const out = num * (1 - FEE) / (token.priceRh || 1);
        setSimBalance((b) => b + out);
        setFlash(`Bought ${compact(out, 2)} ${token.symbol}`);
      } else {
        setSimBalance((b) => Math.max(0, b - num));
        setFlash(`Sold for ${rh(num * token.priceRh * (1 - FEE), 4)}`);
      }
      setAmount("");
      setTimeout(() => setFlash(null), 2600);
      return;
    }

    if (mode === "buy") {
      const expected = (quoteBuyQ.data as readonly [bigint, bigint] | undefined)?.[0] ?? 0n;
      writeContract({
        address: token.curve,
        abi: curveAbi,
        functionName: "buy",
        args: [minusSlippage(expected)],
        value: amountWei,
      });
      return;
    }

    // sell: approve first if needed, else sell.
    if (needsApproval) {
      writeContract({
        address: token.address,
        abi: tokenAbi,
        functionName: "approve",
        args: [token.curve, maxUint256],
      });
      return;
    }
    const expectedOut = (quoteSellQ.data as readonly [bigint, bigint] | undefined)?.[0] ?? 0n;
    writeContract({
      address: token.curve,
      abi: curveAbi,
      functionName: "sell",
      args: [amountWei, minusSlippage(expectedOut)],
    });
  }

  const busy = LIVE && (isPending || confirming);

  function actionLabel(): string {
    if (token.graduated) return copy.token.graduated;
    if (busy) return "Confirming…";
    if (mode === "buy") return `${copy.token.buy} ${token.symbol}`;
    if (needsApproval) return `Approve ${token.symbol}`;
    return `${copy.token.sell} ${token.symbol}`;
  }

  return (
    <div className="glass-strong p-5">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-obsidian-900 p-1">
        {(["buy", "sell"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 text-sm font-semibold capitalize transition ${
              mode === m
                ? m === "buy"
                  ? "bg-venom-500 text-obsidian-950"
                  : "bg-red-500 text-white"
                : "text-white/50 hover:text-white"
            }`}
          >
            {m === "buy" ? copy.token.buy : copy.token.sell}
          </button>
        ))}
      </div>

      <label className="label">
        {mode === "buy" ? `You pay (${NATIVE_SYMBOL})` : `You sell (${token.symbol})`}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          inputMode="decimal"
          className="field font-mono text-lg"
        />
        <span className="chip shrink-0">{mode === "buy" ? NATIVE_SYMBOL : token.symbol}</span>
      </div>

      <div className="mt-2 flex gap-1.5">
        {(mode === "buy" ? [0.1, 0.5, 1, 5] : [25, 50, 75, 100]).map((v) => (
          <button
            key={v}
            onClick={() =>
              setAmount(
                mode === "buy"
                  ? String(v)
                  : LIVE
                    ? formatEther((balanceWei * BigInt(v)) / 100n)
                    : String((simBalance * v) / 100),
              )
            }
            className="flex-1 rounded-lg border border-white/10 py-1 text-xs text-white/50 hover:border-venom-500/40 hover:text-white"
          >
            {mode === "buy" ? `${v}` : `${v}%`}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-obsidian-900/60 p-3 text-xs">
        <Row label="You receive (est.)" value={quote.outLabel} strong />
        <Row label="Trade fee" value={rh(quote.fee, 4)} />
        <p className="border-t border-white/5 pt-2 text-white/40">
          Fees fund permanent liquidity and holder rewards.
        </p>
      </div>

      <button
        onClick={submit}
        disabled={num <= 0 || token.graduated || busy || (LIVE && !isConnected)}
        className={`mt-4 w-full ${mode === "buy" ? "btn-primary" : "btn-danger"}`}
      >
        {actionLabel()}
      </button>

      {flash && (
        <div className="mt-3 rounded-lg border border-venom-500/30 bg-venom-500/10 px-3 py-2 text-center text-xs font-medium text-venom-400">
          ✓ {flash}
        </div>
      )}
      {LIVE && error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">
          {(error as { shortMessage?: string }).shortMessage ?? "Transaction failed."}
        </div>
      )}

      <div className="mt-3 flex justify-between text-xs text-white/40">
        <span>Your balance</span>
        <span className="font-mono">
          {compact(liveBalance, 2)} {token.symbol}
        </span>
      </div>
      {!isConnected && (
        <p className="mt-2 text-center text-[11px] text-white/30">
          {LIVE
            ? "Connect a wallet to trade on-chain."
            : "Demo mode — connect a wallet and deploy contracts to trade for real."}
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span className={`font-mono ${strong ? "text-sm font-semibold text-white" : "text-white/70"}`}>
        {value}
      </span>
    </div>
  );
}
