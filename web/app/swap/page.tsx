import type { Metadata } from "next";
import { SwapWidget } from "@/components/SwapWidget";

export const metadata: Metadata = {
  title: "Swap — Coil",
  description: "Trade Coil tokens on Robinhood Chain. Native per-swap fees, no fee-on-transfer.",
};

export default function SwapPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="text-gradient">Swap</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-3">
          Trade any token on Robinhood Chain against ETH. Coil (v4) tokens route through their
          native-fee pool; everything else routes through Uniswap v3 — the tab picks automatically.
        </p>
      </div>

      {/* The widget stays narrow — a trade form reads better in one column — but the page around
          it does not have to be, so the notes below can sit three-up instead of in a 32rem gutter. */}
      <div className="mx-auto max-w-lg">
        <SwapWidget />
      </div>

      {/* The widget alone left most of the viewport empty. These are the three things a trader
          actually needs to know before routing an order here. */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Any token", "Paste a contract address to trade it against ETH — not just coins launched on Coil."],
          ["One fee", "Coil coins pay a native per-swap fee taken inside the trade. No fee-on-transfer, ever."],
          ["Routed for you", "The tab picks the v4 hook pool or Uniswap v3 automatically, whichever the token uses."],
        ].map(([title, body]) => (
          <div key={title} className="glass p-4">
            <div className="text-sm font-semibold text-ink-2">{title}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
