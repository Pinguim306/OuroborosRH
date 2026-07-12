"use client";

import { dexscreenerEmbedUrl, dexscreenerPageUrl } from "@/lib/chain";

/**
 * Embedded DexScreener chart for a graduated token (one that migrated liquidity
 * to a Uniswap V2 pair). DexScreener only indexes tokens with a live DEX pair,
 * so this is only meaningful post-graduation — bonding-curve tokens fall back to
 * the on-chain MarketcapChart.
 */
export function DexScreenerChart({ pair, height = 460 }: { pair?: string; height?: number }) {
  const src = dexscreenerEmbedUrl(pair);
  const page = dexscreenerPageUrl(pair);

  if (!src) {
    return (
      <div className="grid h-44 place-items-center rounded-xl bg-obsidian-900/60 text-sm text-white/35">
        DexScreener chart is available once this token graduates to the DEX.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-obsidian-900/60">
      <div className="flex items-center justify-between px-3 pt-3 text-xs text-white/40">
        <span>DexScreener · live DEX chart</span>
        {page && (
          <a href={page} target="_blank" rel="noopener noreferrer" className="text-venom-400 hover:underline">
            Open on DexScreener ↗
          </a>
        )}
      </div>
      <div className="relative mt-2 w-full" style={{ height }}>
        <iframe
          src={src}
          title="DexScreener chart"
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}
