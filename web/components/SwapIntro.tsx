"use client";

import { chainConfig } from "@/lib/chain";
import { useSelectedChainId } from "@/lib/useSelectedChain";

/**
 * The Swap page's heading and blurb. A client component purely so the network and its gas coin
 * are named correctly: the page itself is a server component (it exports `metadata`), and its copy
 * used to hardcode "Robinhood Chain" and "ETH" — which reads as simply wrong once the picker is on
 * Arc, where gas is USDC.
 */
export function SwapIntro() {
  const chainId = useSelectedChainId();
  const { chain, nativeSymbol } = chainConfig(chainId);

  return (
    <div className="mb-8 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        <span className="text-gradient">Swap</span>
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-3">
        Trade any token on {chain.name} against {nativeSymbol}. Coil (v4) tokens route through their
        native-fee pool; everything else routes through Uniswap v3 — the tab picks automatically.
      </p>
    </div>
  );
}

/** The three notes under the widget — same reason, same per-chain gas coin. */
export function SwapNotes() {
  const nativeSymbol = chainConfig(useSelectedChainId()).nativeSymbol;

  const notes: [string, string][] = [
    [
      "Any token",
      `Paste a contract address to trade it against ${nativeSymbol} — not just coins launched on Coil.`,
    ],
    [
      "One fee",
      "Coil coins pay a native per-swap fee taken inside the trade. No fee-on-transfer, ever.",
    ],
    [
      "Routed for you",
      "The tab picks the v4 hook pool or Uniswap v3 automatically, whichever the token uses.",
    ],
  ];

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      {notes.map(([title, body]) => (
        <div key={title} className="glass p-4">
          <div className="text-sm font-semibold text-ink-2">{title}</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">{body}</p>
        </div>
      ))}
    </div>
  );
}
