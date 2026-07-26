"use client";

import { chainConfig } from "@/lib/chain";

/**
 * The chain a coin lives on, as a compact chip. Every listing shows one so a market is never
 * ambiguous about which network's liquidity it is — coins on different chains are different
 * markets, even when they share a name. The dot carries the chain's brand colour and the tint is
 * derived from it at low alpha, so adding a chain needs no palette work.
 */
export function ChainBadge({ chainId, className = "" }: { chainId?: number; className?: string }) {
  const cfg = chainConfig(chainId);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}
      style={{
        borderColor: `${cfg.accent}44`,
        backgroundColor: `${cfg.accent}14`,
        color: cfg.accent,
      }}
      title={`${cfg.chain.name} · gas in ${cfg.nativeSymbol}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.accent }} />
      {cfg.shortName}
    </span>
  );
}
