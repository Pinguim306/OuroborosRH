import type { Metadata } from "next";
import { SwapWidget } from "@/components/SwapWidget";

export const metadata: Metadata = {
  title: "Swap — Coil",
  description: "Trade Coil tokens on Robinhood Chain. Native per-swap fees, no fee-on-transfer.",
};

export default function SwapPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="text-gradient">Swap</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/50">
          Trade any token on Robinhood Chain against ETH. Coil (v4) tokens route through their
          native-fee pool; everything else routes through Uniswap v3 — the tab picks automatically.
        </p>
      </div>

      <SwapWidget />

      <div className="mt-6 space-y-2 text-center text-xs text-white/30">
        <p>Paste any token address to trade it against <span className="text-white/50">ETH</span>.</p>
      </div>
    </div>
  );
}
