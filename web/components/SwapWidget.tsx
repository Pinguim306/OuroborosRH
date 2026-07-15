"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatEther, maxUint256, parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { Address } from "@/lib/types";
import { CHAIN_ID, NATIVE_SYMBOL, ROBINHOOD_CONTRACTS } from "@/lib/chain";
import {
  COIL_LAUNCHPAD,
  COIL_SWAP_ROUTER,
  COIL_SWAP_ROUTER_V3,
  LAUNCH_LIVE,
  SWAP_LIVE,
  V3_FEE_LIVE,
  V3_FEE_TIERS,
  coilLaunchpadV4Abi,
  coilPoolKey,
  coilSwapRouterAbi,
  coilSwapRouterV3Abi,
  isCoilToken,
  swapRouter02Abi,
  tokenAbi,
  uniswapV3FactoryAbi,
  uniswapV3PoolAbi,
  type CoilMarket,
} from "@/lib/contracts";
import { TokenSelect, type TokenChoice } from "./TokenSelect";
import { WalletButton } from "./WalletButton";

const SLIPPAGE_OPTIONS = [
  { label: "1%", bps: 100n },
  { label: "3%", bps: 300n },
  { label: "5%", bps: 500n },
];
const MAX_SLIPPAGE_PCT = 49; // hard ceiling on the custom slippage input

const SWAP02 = ROBINHOOD_CONTRACTS.swapRouter02 as Address;
const V3_FACTORY = ROBINHOOD_CONTRACTS.uniswapV3Factory as Address;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function safeParseEther(v: string): bigint {
  try {
    return v ? parseEther(v) : 0n;
  } catch {
    return 0n;
  }
}
function fmt(x: bigint) {
  return Number(formatEther(x)).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/** A fixed ETH pill, or the selectable token pill. */
function Pill({ symbol, onClick }: { symbol: string | null; onClick?: () => void }) {
  const base = "flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold";
  if (!onClick) {
    return (
      <div className={`${base} bg-white/5 text-white`}>
        <span className="grid h-5 w-5 place-items-center rounded-full bg-venom-500/20 text-[10px] text-venom-400">
          {(symbol ?? "?").slice(0, 1)}
        </span>
        {symbol}
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${base} ${symbol ? "bg-white/5 text-white hover:bg-white/10" : "bg-venom-500 text-obsidian-950"}`}
    >
      {symbol ? (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-venom-500/20 text-[10px] text-venom-400">
          {symbol.slice(0, 1)}
        </span>
      ) : null}
      {symbol ?? "Select token"}
      <span className="text-xs opacity-70">▾</span>
    </button>
  );
}

/**
 * Uniswap-style swap: two panels (Vender / Comprar) with a token-select modal and a flip arrow.
 * Every trade is ETH ↔ token (the routers pair against ETH). A Coil (v4) token routes through the
 * CoilSwapRouter; any other token routes through the v3 fee wrapper (or SwapRouter02). The quote
 * comes from an eth_call simulation of the real swap.
 */
export function SwapWidget() {
  const { address, isConnected } = useAccount();
  const [token, setToken] = useState<Address | null>(null); // the non-ETH asset
  const [tokenSym, setTokenSym] = useState<string>("");
  const [dir, setDir] = useState<"buy" | "sell">("buy"); // buy = pay ETH; sell = pay token
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(300n);
  const [customSlip, setCustomSlip] = useState(""); // when non-empty, overrides the preset chips
  const [flash, setFlash] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isBuy = dir === "buy";
  const isV4 = token ? isCoilToken(token) : false;
  const useV3Fee = !isV4 && V3_FEE_LIVE;
  const spender = isV4 ? COIL_SWAP_ROUTER : useV3Fee ? COIL_SWAP_ROUTER_V3 : SWAP02;
  const feeCharged = isV4 || useV3Fee;
  const amountWei = safeParseEther(amount);
  const deadline = useMemo(() => BigInt(Math.floor(Date.now() / 1000) + 1200), [amount, dir]);

  // token picker list
  const { data: marketsRaw } = useReadContract({
    chainId: CHAIN_ID,
    address: COIL_LAUNCHPAD,
    abi: coilLaunchpadV4Abi,
    functionName: "getMarkets",
    args: [0n, 24n],
    query: { enabled: LAUNCH_LIVE },
  });
  const markets = (marketsRaw as readonly CoilMarket[] | undefined) ?? [];

  // on-chain symbol for a nicer label (esp. imported tokens)
  const { data: onchainSym } = useReadContract({
    chainId: CHAIN_ID,
    address: token ?? undefined,
    abi: tokenAbi,
    functionName: "symbol",
    query: { enabled: !!token },
  });
  const displaySym = (onchainSym as string) || tokenSym || "token";

  const { data: weth } = useReadContract({
    chainId: CHAIN_ID,
    address: SWAP02,
    abi: swapRouter02Abi,
    functionName: "WETH",
    query: { enabled: !!token && !isV4 },
  });

  // Auto-detect the v3 fee tier: probe the factory for a pool of this token in every standard
  // tier, then route through whichever pool has the deepest liquidity. This is what lets any token
  // launched in any tier (not just the 1% instant-launch tier) trade through the swap.
  const wethAddr = weth as Address | undefined;
  const { data: poolProbes } = useReadContracts({
    contracts:
      token && wethAddr
        ? V3_FEE_TIERS.map((fee) => ({
            chainId: CHAIN_ID,
            address: V3_FACTORY,
            abi: uniswapV3FactoryAbi,
            functionName: "getPool" as const,
            args: [token, wethAddr, fee] as const,
          }))
        : [],
    query: { enabled: !!token && !!wethAddr && !isV4 },
  });
  const foundPools = useMemo(
    () =>
      (poolProbes ?? [])
        .map((r, i) => ({ fee: V3_FEE_TIERS[i], pool: r?.result as Address | undefined }))
        .filter((p) => p.pool && p.pool.toLowerCase() !== ZERO_ADDR),
    [poolProbes],
  );
  const { data: liqProbes } = useReadContracts({
    contracts: foundPools.map((p) => ({
      chainId: CHAIN_ID,
      address: p.pool as Address,
      abi: uniswapV3PoolAbi,
      functionName: "liquidity" as const,
    })),
    query: { enabled: foundPools.length > 0 },
  });
  const bestFee = useMemo(() => {
    if (foundPools.length === 0) return V3_FEE_TIERS[V3_FEE_TIERS.length - 1]; // fallback (1%)
    let fee = foundPools[0].fee;
    let deepest = -1n;
    foundPools.forEach((p, i) => {
      const liq = (liqProbes?.[i]?.result as bigint | undefined) ?? 0n;
      if (liq > deepest) {
        deepest = liq;
        fee = p.fee;
      }
    });
    return fee;
  }, [foundPools, liqProbes]);
  const noPool = !!token && !isV4 && !!wethAddr && poolProbes !== undefined && foundPools.length === 0;
  const feeTierLabel = `${bestFee / 10000}%`;

  const { data: tokenBal } = useReadContract({
    chainId: CHAIN_ID,
    address: token ?? undefined,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!token && !!address && !isBuy },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    chainId: CHAIN_ID,
    address: token ?? undefined,
    abi: tokenAbi,
    functionName: "allowance",
    args: address ? [address, spender] : undefined,
    query: { enabled: !!token && !!address && !isBuy },
  });

  const needsApproval = !isBuy && amountWei > 0n && (allowance ?? 0n) < amountWei;
  const routable = !!token && (!isV4 || SWAP_LIVE);
  const quoteReady = routable && !!address && amountWei > 0n && (isBuy || !needsApproval);

  const { data: simV4, error: errV4 } = useSimulateContract({
    chainId: CHAIN_ID,
    address: COIL_SWAP_ROUTER,
    abi: coilSwapRouterAbi,
    functionName: "swapExactInSingle",
    args: token ? [coilPoolKey(token), isBuy, amountWei, 0n, address ?? COIL_SWAP_ROUTER, deadline] : undefined,
    value: isBuy ? amountWei : 0n,
    query: { enabled: quoteReady && isV4 },
  });
  const { data: simV3, error: errV3 } = useSimulateContract({
    chainId: CHAIN_ID,
    address: SWAP02,
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args:
      token && weth
        ? [
            {
              tokenIn: (isBuy ? weth : token) as Address,
              tokenOut: (isBuy ? token : weth) as Address,
              fee: bestFee,
              recipient: address ?? SWAP02,
              amountIn: amountWei,
              amountOutMinimum: 0n,
              sqrtPriceLimitX96: 0n,
            },
          ]
        : undefined,
    value: isBuy ? amountWei : 0n,
    query: { enabled: quoteReady && !isV4 && !useV3Fee && !!weth },
  });
  const { data: simV3Fee, error: errV3Fee } = useSimulateContract({
    chainId: CHAIN_ID,
    address: COIL_SWAP_ROUTER_V3,
    abi: coilSwapRouterV3Abi,
    functionName: isBuy ? "buy" : "sell",
    args: (token
      ? isBuy
        ? [token, bestFee, 0n, address ?? COIL_SWAP_ROUTER_V3, deadline]
        : [token, bestFee, amountWei, 0n, address ?? COIL_SWAP_ROUTER_V3, deadline]
      : undefined) as never,
    value: isBuy ? amountWei : 0n,
    query: { enabled: quoteReady && useV3Fee },
  });

  const quotedOut = ((isV4 ? simV4?.result : useV3Fee ? simV3Fee?.result : simV3?.result) as
    | bigint
    | undefined) ?? 0n;
  const simError = isV4 ? errV4 : useV3Fee ? errV3Fee : errV3;
  const minOut = (quotedOut * (10000n - slippage)) / 10000n;

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      setFlash("Done ✓");
      setAmount("");
      refetchAllowance();
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
  function pickPreset(bps: bigint) {
    setSlippage(bps);
    setCustomSlip("");
  }
  const highSlippage = slippage > 500n; // >5% — warn about MEV / bad fills

  function onPick(t: TokenChoice) {
    if (t.address === null) {
      setToken(null); // picked ETH → clear the token side
      setTokenSym("");
    } else {
      setToken(t.address);
      setTokenSym(t.symbol);
    }
  }

  function approve() {
    if (!token) return;
    writeContract({
      chainId: CHAIN_ID,
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [spender, maxUint256],
    });
  }

  function swap() {
    if (!token || !address) return;
    if (isV4) {
      writeContract({
        chainId: CHAIN_ID,
        address: COIL_SWAP_ROUTER,
        abi: coilSwapRouterAbi,
        functionName: "swapExactInSingle",
        args: [coilPoolKey(token), isBuy, amountWei, minOut, address, deadline],
        value: isBuy ? amountWei : 0n,
      });
      return;
    }
    if (useV3Fee) {
      if (isBuy) {
        writeContract({
          chainId: CHAIN_ID,
          address: COIL_SWAP_ROUTER_V3,
          abi: coilSwapRouterV3Abi,
          functionName: "buy",
          args: [token, bestFee, minOut, address, deadline],
          value: amountWei,
        });
      } else {
        writeContract({
          chainId: CHAIN_ID,
          address: COIL_SWAP_ROUTER_V3,
          abi: coilSwapRouterV3Abi,
          functionName: "sell",
          args: [token, bestFee, amountWei, minOut, address, deadline],
        });
      }
      return;
    }
    if (!weth) return;
    if (isBuy) {
      writeContract({
        chainId: CHAIN_ID,
        address: SWAP02,
        abi: swapRouter02Abi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: weth as Address,
            tokenOut: token,
            fee: bestFee,
            recipient: address,
            amountIn: amountWei,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          },
        ],
        value: amountWei,
      });
    } else {
      const swapData = encodeFunctionData({
        abi: swapRouter02Abi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: token,
            tokenOut: weth as Address,
            fee: bestFee,
            recipient: ADDRESS_THIS,
            amountIn: amountWei,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const unwrapData = encodeFunctionData({
        abi: swapRouter02Abi,
        functionName: "unwrapWETH9",
        args: [minOut, address],
      });
      writeContract({
        chainId: CHAIN_ID,
        address: SWAP02,
        abi: swapRouter02Abi,
        functionName: "multicall",
        args: [[swapData, unwrapData]],
      });
    }
  }

  const busy = isPending || confirming;
  // The token pill lives on the pay side when selling, the receive side when buying.
  const payPill = isBuy ? <Pill symbol={NATIVE_SYMBOL} /> : <Pill symbol={token ? displaySym : null} onClick={() => setPickerOpen(true)} />;
  const receivePill = isBuy ? <Pill symbol={token ? displaySym : null} onClick={() => setPickerOpen(true)} /> : <Pill symbol={NATIVE_SYMBOL} />;

  const cta = !isConnected
    ? null
    : !token
      ? "Select a token"
      : amountWei === 0n
        ? "Enter an amount"
        : needsApproval
          ? busy
            ? "Approving…"
            : `Approve ${displaySym}`
          : busy
            ? "Swapping…"
            : (flash ?? "Swap");

  return (
    <div className="glass-strong space-y-1.5 p-4">
      {/* PAY panel */}
      <div className="rounded-2xl border border-white/10 bg-obsidian-900/60 p-4">
        <div className="label">Vender</div>
        <div className="mt-2 flex items-center gap-3">
          <input
            className="min-w-0 flex-1 bg-transparent text-3xl font-semibold text-white outline-none placeholder:text-white/20"
            placeholder="0"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {payPill}
        </div>
        {!isBuy && tokenBal !== undefined && (
          <button
            className="mt-1 text-xs text-white/40 hover:text-venom-400"
            onClick={() => setAmount(formatEther(tokenBal as bigint))}
          >
            Balance: {fmt(tokenBal as bigint)} — max
          </button>
        )}
      </div>

      {/* flip */}
      <div className="relative z-10 -my-3.5 flex justify-center">
        <button
          onClick={() => setDir(isBuy ? "sell" : "buy")}
          className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-obsidian-850 text-white/70 transition hover:text-venom-400"
          aria-label="Flip"
        >
          ↓
        </button>
      </div>

      {/* RECEIVE panel */}
      <div className="rounded-2xl border border-white/10 bg-obsidian-900/60 p-4">
        <div className="label">Comprar</div>
        <div className="mt-2 flex items-center gap-3">
          <div className="min-w-0 flex-1 truncate text-3xl font-semibold text-white/90">
            {quotedOut > 0n ? fmt(quotedOut) : "0"}
          </div>
          {receivePill}
        </div>
        {token && (
          <div className="mt-1 flex items-center justify-between text-xs">
            <span>
              {isV4 ? (
                <span className="text-venom-400">Coil v4 · interface fee</span>
              ) : useV3Fee ? (
                <span className="text-venom-400">Uniswap v3 · {feeTierLabel} · interface fee</span>
              ) : (
                <span className="text-white/40">Uniswap v3 · {feeTierLabel}</span>
              )}
            </span>
            {minOut > 0n && <span className="text-white/40">min {fmt(minOut)}</span>}
          </div>
        )}
      </div>

      {/* slippage */}
      <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
        <span className="label">Max slippage</span>
        {SLIPPAGE_OPTIONS.map((o) => (
          <button
            key={o.label}
            onClick={() => pickPreset(o.bps)}
            className={`chip ${slippage === o.bps && !customSlip ? "border-venom-500/60 text-white" : ""}`}
          >
            {o.label}
          </button>
        ))}
        <span
          className={`chip flex items-center gap-1 !py-0 ${customSlip ? "border-venom-500/60 text-white" : ""}`}
        >
          <input
            inputMode="decimal"
            placeholder="Custom"
            value={customSlip}
            onChange={(e) => onCustomSlip(e.target.value)}
            className="w-16 bg-transparent py-1.5 text-center outline-none placeholder:text-white/30"
          />
          <span className="text-white/40">%</span>
        </span>
      </div>
      {highSlippage && (
        <p className="px-1 text-[11px] text-amber-400">
          High slippage ({(Number(slippage) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%) —
          you may receive far less. Max {MAX_SLIPPAGE_PCT}%.
        </p>
      )}

      {token && isV4 && !SWAP_LIVE && (
        <p className="px-1 text-xs text-amber-400">
          v4 router not configured — set <code>NEXT_PUBLIC_COIL_SWAP_ROUTER</code>.
        </p>
      )}
      {noPool ? (
        <p className="px-1 text-xs text-amber-400">
          No Uniswap v3 pool found for this token in any fee tier on Robinhood Chain.
        </p>
      ) : (
        simError &&
        amountWei > 0n &&
        !needsApproval && (
          <p className="px-1 text-xs text-amber-400">No route for this token, or amount exceeds its liquidity.</p>
        )
      )}

      {/* action */}
      <div className="pt-1">
        {!isConnected ? (
          <WalletButton />
        ) : needsApproval ? (
          <button className="btn-primary w-full" disabled={busy || !routable} onClick={approve}>
            {cta}
          </button>
        ) : (
          <button
            className="btn-primary w-full"
            disabled={busy || !routable || amountWei === 0n || quotedOut === 0n}
            onClick={swap}
          >
            {cta}
          </button>
        )}
      </div>

      {writeError && (
        <p className="px-1 text-xs text-red-400">
          {(writeError as { shortMessage?: string }).shortMessage ?? "Transaction failed."}
        </p>
      )}

      <p className="pt-1 text-center text-[11px] text-white/30">
        {feeCharged
          ? "Routed through Coil · a small interface fee supports the protocol."
          : "Routed on Robinhood Chain."}
      </p>

      {pickerOpen && <TokenSelect markets={markets} onSelect={onPick} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
