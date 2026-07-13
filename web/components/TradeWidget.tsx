"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, maxUint256, parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address, TokenMarket } from "@/lib/types";
import { copy } from "@/lib/copy";
import { compact, rh } from "@/lib/format";
import { NATIVE_SYMBOL, ROBINHOOD_CONTRACTS } from "@/lib/chain";
import { LIVE, curveAbi, tokenAbi, routerAbi } from "@/lib/contracts";

// Total per-trade fee on the curve. The internal split lives in the contract.
const FEE = 0.015; // 1.5%
const SLIPPAGE_BPS = 500n; // 5% max slippage on curve trades
// Post-graduation DEX trades go through a fee-on-transfer token (1% tax) + the
// AMM's own fee, so a wider min-out buffer avoids spurious reverts.
const GRAD_SLIPPAGE_BPS = 600n; // ~6%

const ROUTER = ROBINHOOD_CONTRACTS.uniswapV2Router as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

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
  const graduated = token.graduated; // trade on the DEX pair via the router
  const spender: Address = graduated ? ROUTER : token.curve; // who needs the sell allowance

  // --- Live reads (gated; hooks always run) ---
  const balanceQ = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    query: { enabled: LIVE && !!address },
  });
  const allowanceQ = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "allowance",
    args: [address ?? ZERO, spender],
    query: { enabled: LIVE && !!address && mode === "sell" },
  });
  // Curve quotes (pre-graduation).
  const quoteBuyQ = useReadContract({
    address: token.curve,
    abi: curveAbi,
    functionName: "quoteBuy",
    args: [amountWei],
    query: { enabled: LIVE && !graduated && mode === "buy" && amountWei > 0n },
  });
  const quoteSellQ = useReadContract({
    address: token.curve,
    abi: curveAbi,
    functionName: "quoteSell",
    args: [amountWei],
    query: { enabled: LIVE && !graduated && mode === "sell" && amountWei > 0n },
  });
  // Router leg (post-graduation): resolve WETH + quote via getAmountsOut.
  const wethQ = useReadContract({
    address: ROUTER,
    abi: routerAbi,
    functionName: "WETH",
    query: { enabled: LIVE && graduated },
  });
  const weth = wethQ.data as Address | undefined;
  const buyPath = weth ? ([weth, token.address] as const) : undefined;
  const sellPath = weth ? ([token.address, weth] as const) : undefined;
  const gradBuyQ = useReadContract({
    address: ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [amountWei, (buyPath ?? []) as readonly Address[]],
    query: { enabled: LIVE && graduated && mode === "buy" && amountWei > 0n && !!buyPath },
  });
  const gradSellQ = useReadContract({
    address: ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [amountWei, (sellPath ?? []) as readonly Address[]],
    query: { enabled: LIVE && graduated && mode === "sell" && amountWei > 0n && !!sellPath },
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

  const outAmount = (q: { data: unknown }): bigint => {
    const a = q.data as readonly bigint[] | undefined;
    return a && a.length > 1 ? a[a.length - 1] : 0n;
  };

  const receiveLabel = useMemo(() => {
    if (LIVE && graduated) {
      if (mode === "buy") {
        const t = outAmount(gradBuyQ);
        return t > 0n ? `${compact(Number(formatEther(t)), 2)} ${token.symbol}` : "—";
      }
      const e = outAmount(gradSellQ);
      return e > 0n ? rh(Number(formatEther(e)), 4) : "—";
    }
    // Curve / demo estimate.
    if (mode === "buy") {
      const net = num * (1 - FEE);
      const tokensOut = token.priceRh > 0 ? net / token.priceRh : 0;
      return `${compact(tokensOut, 2)} ${token.symbol}`;
    }
    const gross = num * token.priceRh;
    return rh(gross * (1 - FEE), 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graduated, mode, gradBuyQ.data, gradSellQ.data, num, token.priceRh, token.symbol]);

  function minOut(x: bigint): bigint {
    const bps = graduated ? GRAD_SLIPPAGE_BPS : SLIPPAGE_BPS;
    return (x * (10_000n - bps)) / 10_000n;
  }

  function submit() {
    if (num <= 0) return;

    if (!LIVE) {
      if (mode === "buy") {
        const out = (num * (1 - FEE)) / (token.priceRh || 1);
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

    // Sell always needs an allowance to the active spender (curve or router).
    if (mode === "sell" && needsApproval) {
      writeContract({
        address: token.address,
        abi: tokenAbi,
        functionName: "approve",
        args: [spender, maxUint256],
      });
      return;
    }

    if (graduated) {
      if (!address || !weth || !buyPath || !sellPath) return;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min
      if (mode === "buy") {
        writeContract({
          address: ROUTER,
          abi: routerAbi,
          functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
          args: [minOut(outAmount(gradBuyQ)), buyPath as readonly Address[], address, deadline],
          value: amountWei,
        });
      } else {
        writeContract({
          address: ROUTER,
          abi: routerAbi,
          functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
          args: [amountWei, minOut(outAmount(gradSellQ)), sellPath as readonly Address[], address, deadline],
        });
      }
      return;
    }

    // Bonding-curve trade.
    if (mode === "buy") {
      const expected = (quoteBuyQ.data as readonly [bigint, bigint] | undefined)?.[0] ?? 0n;
      writeContract({
        address: token.curve,
        abi: curveAbi,
        functionName: "buy",
        args: [minOut(expected)],
        value: amountWei,
      });
      return;
    }
    const expectedOut = (quoteSellQ.data as readonly [bigint, bigint] | undefined)?.[0] ?? 0n;
    writeContract({
      address: token.curve,
      abi: curveAbi,
      functionName: "sell",
      args: [amountWei, minOut(expectedOut)],
    });
  }

  const busy = LIVE && (isPending || confirming);
  const gradNotReady = LIVE && graduated && !weth;
  const disabled = num <= 0 || busy || (LIVE && !isConnected) || gradNotReady;

  function actionLabel(): string {
    if (busy) return "Confirming…";
    if (mode === "sell" && needsApproval) return `Approve ${token.symbol}`;
    if (mode === "buy") return `${copy.token.buy} ${token.symbol}`;
    return `${copy.token.sell} ${token.symbol}`;
  }

  return (
    <div className="glass-strong p-5">
      {graduated && (
        <div className="mb-3 rounded-lg border border-venom-500/20 bg-venom-500/5 px-3 py-2 text-[11px] text-venom-400/90">
          ✦ Graduated — trades route through the Uniswap pair (1% fee-on-transfer applies).
        </div>
      )}
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

      <div className="mt-4 rounded-xl bg-obsidian-900/60 p-3 text-xs">
        <Row label="You receive (est.)" value={receiveLabel} strong />
      </div>

      <button
        onClick={submit}
        disabled={disabled}
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
