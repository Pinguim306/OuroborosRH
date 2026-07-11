"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { TokenMarket } from "@/lib/types";
import { copy } from "@/lib/copy";
import { compact, rh } from "@/lib/format";
import { NATIVE_SYMBOL } from "@/lib/chain";
import { LIVE } from "@/lib/contracts";

// Per-trade fee split (fractions of trade volume): total 1.5%.
const DEV_FEE = 0.005; // 0.5% to the developer
const LIQ_FEE = 0.006; // 0.6% becomes permanent liquidity
const HOLDER_FEE = 0.004; // 0.4% streamed to holders
const FEE = DEV_FEE + LIQ_FEE + HOLDER_FEE; // 1.5%

export function TradeWidget({ token }: { token: TokenMarket }) {
  const { isConnected } = useAccount();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(0); // simulated token balance
  const [flash, setFlash] = useState<string | null>(null);

  const num = parseFloat(amount) || 0;

  const quote = useMemo(() => {
    if (mode === "buy") {
      const fee = num * FEE;
      const net = num - fee;
      const tokensOut = net / token.priceRh;
      return { fee, out: tokensOut, outLabel: `${compact(tokensOut, 2)} ${token.symbol}` };
    }
    const gross = num * token.priceRh;
    const fee = gross * FEE;
    const net = gross - fee;
    return { fee, out: net, outLabel: rh(net, 4) };
  }, [mode, num, token.priceRh, token.symbol]);

  function submit() {
    if (num <= 0) return;
    // In a live deployment this calls curve.buy / curve.sell via wagmi's
    // useWriteContract. Here we simulate so the flow is fully demoable.
    if (mode === "buy") {
      setBalance((b) => b + quote.out);
      setFlash(`Bought ${quote.outLabel}`);
    } else {
      setBalance((b) => Math.max(0, b - num));
      setFlash(`Sold for ${quote.outLabel}`);
    }
    setAmount("");
    setTimeout(() => setFlash(null), 2600);
  }

  const base = mode === "buy" ? num : num * token.priceRh;
  const feeToDev = base * DEV_FEE;
  const feeToLiq = base * LIQ_FEE;
  const feeToRewards = base * HOLDER_FEE;

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
              setAmount(mode === "buy" ? String(v) : String((balance * v) / 100))
            }
            className="flex-1 rounded-lg border border-white/10 py-1 text-xs text-white/50 hover:border-venom-500/40 hover:text-white"
          >
            {mode === "buy" ? `${v}` : `${v}%`}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-obsidian-900/60 p-3 text-xs">
        <Row label="You receive" value={quote.outLabel} strong />
        <Row label="Fee (1.5%)" value={rh(quote.fee, 4)} />
        <div className="space-y-2 border-t border-white/5 pt-2">
          <Row label="→ Permanent liquidity" value={rh(feeToLiq, 4)} accent />
          <Row label="→ Holder rewards" value={rh(feeToRewards, 4)} accent />
          <Row label="→ Developer" value={rh(feeToDev, 4)} />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={num <= 0 || token.graduated}
        className={`mt-4 w-full ${mode === "buy" ? "btn-primary" : "btn-danger"}`}
      >
        {token.graduated
          ? copy.token.graduated
          : mode === "buy"
            ? `${copy.token.buy} ${token.symbol}`
            : `${copy.token.sell} ${token.symbol}`}
      </button>

      {flash && (
        <div className="mt-3 rounded-lg border border-venom-500/30 bg-venom-500/10 px-3 py-2 text-center text-xs font-medium text-venom-400">
          ✓ {flash}
        </div>
      )}

      <div className="mt-3 flex justify-between text-xs text-white/40">
        <span>Your balance</span>
        <span className="font-mono">
          {compact(balance, 2)} {token.symbol}
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
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span
        className={`font-mono ${
          strong ? "text-sm font-semibold text-white" : accent ? "text-venom-400" : "text-white/70"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
