"use client";
import { IconBolt } from "@/components/Icon";

import { useEffect, useMemo, useState } from "react";
import { formatEther, formatUnits, maxUint256, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address, TokenMarket } from "@/lib/types";
import { copy } from "@/lib/copy";
import { compact } from "@/lib/format";
import { asSupportedChainId, chainConfig, v3QuoteOf } from "@/lib/chain";
import { arcSwapRouterAbi, coilContracts, erc20Abi, tokenAbi } from "@/lib/contracts";

/**
 * Trade widget for instant-V3 tokens on facade-quoted chains (Arc). USDC there is the native coin
 * mirrored by a 6-decimal ERC20 facade, so the whole flow is plain ERC20: approve the input
 * currency to the ArcSwapRouter once, then exact-in swaps whose output goes pool → wallet direct.
 * No wrapping, no msg.value — the same approve-and-transferFrom pattern every external terminal
 * already uses on this chain.
 */
const V3_FEE_TIER = 10000; // 1% — the tier every instant-V3 pool is created with
const V3_POOL_FEE = 0.01;
const INTERFACE_FEE = 0.002; // the router's 0.2% input skim
const SLIPPAGE_BPS = 600n; // ~6% floor under the slot0-derived estimate

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function ArcV3TradeWidget({ token }: { token: TokenMarket }) {
  const { address, isConnected } = useAccount();
  const chainId = asSupportedChainId(token.chainId);
  const quote = v3QuoteOf(chainId); // gated by the caller; bail quietly if absent
  const router = coilContracts(chainId).coilSwapRouterV3;
  const routerLive = router !== ZERO;
  const symbol = chainConfig(chainId).nativeSymbol;

  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const num = parseFloat(amount) || 0;
  // Input units differ per side: USDC in facade decimals (6) on buys, token 18-dec on sells.
  const amountIn = useMemo(() => {
    try {
      if (num <= 0) return 0n;
      return mode === "buy" ? parseUnits(num.toFixed(6), quote?.decimals ?? 6) : parseEther(num.toFixed(18));
    } catch {
      return 0n;
    }
  }, [num, mode, quote?.decimals]);

  const spender: Address = router;
  const inputToken: Address | undefined = mode === "buy" ? quote?.address : token.address;

  const usdcBalanceQ = useReadContract({
    address: quote?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    chainId,
    query: { enabled: !!quote && !!address },
  });
  const tokenBalanceQ = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    chainId,
    query: { enabled: !!address },
  });
  const allowanceQ = useReadContract({
    address: inputToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? ZERO, spender],
    chainId,
    query: { enabled: !!inputToken && !!address && routerLive },
  });

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const allowance = (allowanceQ.data as bigint) ?? 0n;
  const needsApproval = amountIn > 0n && allowance < amountIn;
  const usdcBalance = Number(formatUnits((usdcBalanceQ.data as bigint) ?? 0n, quote?.decimals ?? 6));
  const tokenBalance = Number(formatEther((tokenBalanceQ.data as bigint) ?? 0n));
  const tokenBalanceWei = (tokenBalanceQ.data as bigint) ?? 0n;

  useEffect(() => {
    if (!isSuccess) return;
    setFlash(needsApproval ? "Approved" : mode === "buy" ? "Buy confirmed" : "Sell confirmed");
    if (!needsApproval) setAmount("");
    usdcBalanceQ.refetch?.();
    tokenBalanceQ.refetch?.();
    allowanceQ.refetch?.();
    const t = setTimeout(() => {
      setFlash(null);
      reset();
    }, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  // Estimate off the live slot0-derived price: both fees off the input, then the spot rate.
  // priceRh is USDC-per-token (the chain's native IS the dollar), already facade-rescaled.
  const feeFactor = (1 - INTERFACE_FEE) * (1 - V3_POOL_FEE);
  const estOut = useMemo(() => {
    if (num <= 0 || token.priceRh <= 0) return 0;
    return mode === "buy" ? (num * feeFactor) / token.priceRh : num * token.priceRh * feeFactor;
  }, [num, mode, token.priceRh, feeFactor]);

  const receiveLabel =
    estOut > 0
      ? mode === "buy"
        ? `${compact(estOut, 2)} ${token.symbol}`
        : `${estOut.toFixed(4)} ${symbol}`
      : "—";

  function submit() {
    if (num <= 0 || !address || !quote || !routerLive) return;

    if (needsApproval) {
      writeContract({
        chainId,
        address: inputToken!,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      });
      return;
    }

    // Min-out with the slippage buffer, in the OUTPUT side's units.
    const minOut =
      mode === "buy"
        ? (parseEther(estOut > 0 ? estOut.toFixed(18) : "0") * (10_000n - SLIPPAGE_BPS)) / 10_000n
        : (parseUnits(estOut > 0 ? estOut.toFixed(6) : "0", quote.decimals) * (10_000n - SLIPPAGE_BPS)) /
          10_000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    writeContract({
      chainId,
      address: router,
      abi: arcSwapRouterAbi,
      functionName: "swapExactIn",
      args: [token.address, V3_FEE_TIER, mode === "buy", amountIn, minOut, address, deadline],
    });
  }

  const busy = isPending || confirming;
  const disabled = num <= 0 || busy || !isConnected || !routerLive;

  function actionLabel(): string {
    if (busy) return "Confirming…";
    if (needsApproval) return `Approve ${mode === "buy" ? symbol : token.symbol}`;
    if (mode === "buy") return `${copy.token.buy} ${token.symbol}`;
    return `${copy.token.sell} ${token.symbol}`;
  }

  if (!quote) return null;

  return (
    <div className="glass-strong p-5">
      <div className="mb-3 rounded-lg border border-coil-500/20 bg-coil-500/5 px-3 py-2 text-[11px] text-coil-400/90">
        <IconBolt size={12} className="inline align-[-2px]" /> Trades route through the Uniswap V3
        pool (1% pool fee) — also tradable on external terminals.
      </div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-obsidian-900 p-1">
        {(["buy", "sell"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 text-sm font-semibold capitalize transition ${
              mode === m
                ? m === "buy"
                  ? "bg-coil-500 text-obsidian-950"
                  : "bg-down text-white"
                : "text-ink-3 hover:text-white"
            }`}
          >
            {m === "buy" ? copy.token.buy : copy.token.sell}
          </button>
        ))}
      </div>

      <label className="label">
        {mode === "buy" ? `You pay (${symbol})` : `You sell (${token.symbol})`}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          inputMode="decimal"
          className="field font-mono text-lg"
        />
        <span className="chip shrink-0">{mode === "buy" ? symbol : token.symbol}</span>
      </div>

      <div className="mt-2 flex gap-1.5">
        {(mode === "buy" ? [1, 5, 10, 50] : [25, 50, 75, 100]).map((v) => (
          <button
            key={v}
            onClick={() =>
              setAmount(
                mode === "buy" ? String(v) : formatEther((tokenBalanceWei * BigInt(v)) / 100n),
              )
            }
            className="flex-1 rounded-lg border border-white/10 py-1 text-xs text-ink-3 hover:border-coil-500/40 hover:text-white"
          >
            {mode === "buy" ? `$${v}` : `${v}%`}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-obsidian-900/60 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-ink-3">You receive (est.)</span>
          <span className="font-mono text-sm font-semibold text-white">{receiveLabel}</span>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={disabled}
        className={`mt-4 w-full ${mode === "buy" ? "btn-primary" : "btn-danger"}`}
      >
        {actionLabel()}
      </button>

      {flash && (
        <div className="mt-3 rounded-lg border border-coil-500/30 bg-coil-500/10 px-3 py-2 text-center text-xs font-medium text-coil-400">
          ✓ {flash}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-center text-xs text-down">
          {(error as { shortMessage?: string }).shortMessage ?? "Transaction failed."}
        </div>
      )}

      <div className="mt-3 space-y-1 text-xs text-ink-4">
        <div className="flex justify-between">
          <span>Your balance</span>
          <span className="font-mono">
            {compact(tokenBalance, 2)} {token.symbol}
          </span>
        </div>
        <div className="flex justify-between">
          <span>{symbol} balance</span>
          <span className="font-mono">{usdcBalance.toFixed(2)}</span>
        </div>
      </div>
      {!isConnected && (
        <p className="mt-2 text-center text-[11px] text-ink-4">Connect a wallet to trade on-chain.</p>
      )}
    </div>
  );
}
