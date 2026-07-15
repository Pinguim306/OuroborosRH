"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatEther, isAddress, maxUint256, parseEther } from "viem";
import {
  useAccount,
  useReadContract,
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
  coilLaunchpadV4Abi,
  coilPoolKey,
  coilSwapRouterAbi,
  coilSwapRouterV3Abi,
  isCoilToken,
  swapRouter02Abi,
  tokenAbi,
  type CoilMarket,
} from "@/lib/contracts";
import { WalletButton } from "./WalletButton";

const SLIPPAGE_OPTIONS = [
  { label: "1%", bps: 100n },
  { label: "3%", bps: 300n },
  { label: "5%", bps: 500n },
];

const SWAP02 = ROBINHOOD_CONTRACTS.swapRouter02 as Address;
const V3_FEE_TIER = 10000; // 1% tier — the tier instant-V3 pools are created with
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address; // SwapRouter02 sentinel

function safeParseEther(v: string): bigint {
  try {
    return v ? parseEther(v) : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Trade any token on Robinhood Chain. A Coil (v4) token — its address carries the hook flags — is
 * routed through the CoilSwapRouter, which skims the interface fee AND triggers the hook's own
 * per-swap fee. Any other token is routed through Uniswap's SwapRouter02 (v3). The quote comes from
 * an eth_call simulation of the actual swap, so it reflects real on-chain output.
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
  const isV4 = token ? isCoilToken(token) : false;
  const useV3Fee = !isV4 && V3_FEE_LIVE; // non-Coil token routed through the fee wrapper
  const spender = isV4 ? COIL_SWAP_ROUTER : useV3Fee ? COIL_SWAP_ROUTER_V3 : SWAP02;
  const feeCharged = isV4 || useV3Fee; // an interface fee applies on this route

  // --- Token picker: the Coil tokens launched by the v4 factory (newest first) ---
  const { data: marketsRaw } = useReadContract({
    chainId: CHAIN_ID,
    address: COIL_LAUNCHPAD,
    abi: coilLaunchpadV4Abi,
    functionName: "getMarkets",
    args: [0n, 24n],
    query: { enabled: LAUNCH_LIVE },
  });
  const markets = (marketsRaw as readonly CoilMarket[] | undefined) ?? [];
  const amountWei = safeParseEther(amount);
  const isBuy = mode === "buy";
  const deadline = useMemo(() => BigInt(Math.floor(Date.now() / 1000) + 1200), [amount, mode]);

  // A v4 token can only route once the CoilSwapRouter is configured; v3 always can.
  const routable = !!token && (!isV4 || SWAP_LIVE);

  // --- WETH (for the v3 path) ---
  const { data: weth } = useReadContract({
    chainId: CHAIN_ID,
    address: SWAP02,
    abi: swapRouter02Abi,
    functionName: "WETH",
    query: { enabled: !!token && !isV4 },
  });

  // --- Sell-side reads: balance + allowance to the active spender ---
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
  const quoteReady = routable && !!address && amountWei > 0n && (isBuy || !needsApproval);

  // --- v4 quote: simulate CoilSwapRouter.swapExactInSingle ---
  const { data: simV4, error: errV4 } = useSimulateContract({
    chainId: CHAIN_ID,
    address: COIL_SWAP_ROUTER,
    abi: coilSwapRouterAbi,
    functionName: "swapExactInSingle",
    args: token
      ? [coilPoolKey(token), isBuy, amountWei, 0n, address ?? COIL_SWAP_ROUTER, deadline]
      : undefined,
    value: isBuy ? amountWei : 0n,
    query: { enabled: quoteReady && isV4 },
  });

  // --- v3 quote: simulate SwapRouter02.exactInputSingle ---
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
              fee: V3_FEE_TIER,
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

  // --- v3 fee-wrapper quote: simulate CoilSwapRouterV3.buy/sell ---
  const { data: simV3Fee, error: errV3Fee } = useSimulateContract({
    chainId: CHAIN_ID,
    address: COIL_SWAP_ROUTER_V3,
    abi: coilSwapRouterV3Abi,
    functionName: isBuy ? "buy" : "sell",
    args: (token
      ? isBuy
        ? [token, 0n, address ?? COIL_SWAP_ROUTER_V3, deadline]
        : [token, amountWei, 0n, address ?? COIL_SWAP_ROUTER_V3, deadline]
      : undefined) as never,
    value: isBuy ? amountWei : 0n,
    query: { enabled: quoteReady && useV3Fee },
  });

  const quotedOut = ((isV4 ? simV4?.result : useV3Fee ? simV3Fee?.result : simV3?.result) as
    | bigint
    | undefined) ?? 0n;
  const simError = isV4 ? errV4 : useV3Fee ? errV3Fee : errV3;
  const minOut = (quotedOut * (10000n - slippage)) / 10000n;

  // --- Writes ---
  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      setFlash(isBuy ? "Bought ✓" : "Sold ✓");
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
      // Non-Coil token, but routed through the fee wrapper so the interface fee is charged.
      if (isBuy) {
        writeContract({
          chainId: CHAIN_ID,
          address: COIL_SWAP_ROUTER_V3,
          abi: coilSwapRouterV3Abi,
          functionName: "buy",
          args: [token, minOut, address, deadline],
          value: amountWei,
        });
      } else {
        writeContract({
          chainId: CHAIN_ID,
          address: COIL_SWAP_ROUTER_V3,
          abi: coilSwapRouterV3Abi,
          functionName: "sell",
          args: [token, amountWei, minOut, address, deadline],
        });
      }
      return;
    }
    // v3 via SwapRouter02 (no interface fee)
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
            fee: V3_FEE_TIER,
            recipient: address,
            amountIn: amountWei,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          },
        ],
        value: amountWei,
      });
    } else {
      // Sell: swap token→WETH into the router, then unwrap to ETH for the seller — one multicall.
      const swapData = encodeFunctionData({
        abi: swapRouter02Abi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: token,
            tokenOut: weth as Address,
            fee: V3_FEE_TIER,
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

  const inSym = isBuy ? NATIVE_SYMBOL : "token";
  const outSym = isBuy ? "token" : NATIVE_SYMBOL;
  const busy = isPending || confirming;

  return (
    <div className="glass-strong space-y-4 p-6">
      {/* direction toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setMode("buy")} className={`btn ${isBuy ? "btn-primary" : "btn-ghost"}`}>
          Buy
        </button>
        <button onClick={() => setMode("sell")} className={`btn ${!isBuy ? "btn-primary" : "btn-ghost"}`}>
          Sell
        </button>
      </div>

      <div>
        <label className="label">Token address</label>
        <input
          className="field mt-1 font-mono"
          placeholder="0x… any token on Robinhood Chain"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value.trim())}
          spellCheck={false}
        />
        {tokenInput && !token && <p className="mt-1 text-xs text-red-400">Not a valid address.</p>}
        {token && (
          <div className="mt-1.5">
            {isV4 ? (
              <span className="chip border-venom-500/60 text-white">Coil v4 · interface fee</span>
            ) : useV3Fee ? (
              <span className="chip border-venom-500/60 text-white">Uniswap v3 · interface fee</span>
            ) : (
              <span className="chip">Uniswap v3</span>
            )}
          </div>
        )}
        {token && isV4 && !SWAP_LIVE && (
          <p className="mt-1 text-xs text-amber-400">
            v4 router not configured — set <code>NEXT_PUBLIC_COIL_SWAP_ROUTER</code>.
          </p>
        )}
      </div>

      {/* Coil token picker */}
      {markets.length > 0 && (
        <div>
          <label className="label">Coil tokens</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {markets.map((m) => (
              <button
                key={m.token}
                onClick={() => setTokenInput(m.token)}
                title={m.name}
                className={`chip ${token?.toLowerCase() === m.token.toLowerCase() ? "border-venom-500/60 text-white" : ""}`}
              >
                {m.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label">You pay ({inSym})</label>
        <input
          className="field mt-1"
          placeholder="0.0"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {!isBuy && tokenBal !== undefined && (
          <button
            className="mt-1 text-xs text-white/40 hover:text-venom-400"
            onClick={() => setAmount(formatEther(tokenBal as bigint))}
          >
            Balance: {Number(formatEther(tokenBal as bigint)).toLocaleString()} — max
          </button>
        )}
      </div>

      {/* slippage */}
      <div>
        <label className="label">Max slippage</label>
        <div className="mt-1 flex flex-wrap gap-2">
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
      </div>

      {/* quote */}
      <div className="rounded-xl border border-white/5 bg-obsidian-900/60 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-white/40">Est. received ({outSym})</span>
          <span className="font-medium text-white">
            {quotedOut > 0n
              ? Number(formatEther(quotedOut)).toLocaleString(undefined, { maximumFractionDigits: 6 })
              : "—"}
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
        <button className="btn-primary w-full" disabled={busy || !routable} onClick={approve}>
          {busy ? "Approving…" : "Approve token"}
        </button>
      ) : (
        <button
          className="btn-primary w-full"
          disabled={busy || !routable || amountWei === 0n || quotedOut === 0n}
          onClick={swap}
        >
          {busy ? "Swapping…" : (flash ?? `Swap ${inSym} → ${outSym}`)}
        </button>
      )}

      {writeError && (
        <p className="text-xs text-red-400">
          {(writeError as { shortMessage?: string }).shortMessage ?? "Transaction failed."}
        </p>
      )}

      <p className="text-center text-[11px] text-white/30">
        {feeCharged
          ? "Routed through Coil · a small interface fee supports the protocol."
          : "Routed through Uniswap v3 on Robinhood Chain."}
      </p>
    </div>
  );
}
