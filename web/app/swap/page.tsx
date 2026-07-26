import type { Metadata } from "next";
import { SwapWidget } from "@/components/SwapWidget";
import { SwapIntro, SwapNotes } from "@/components/SwapIntro";

export const metadata: Metadata = {
  title: "Swap — Coil",
  description:
    "Trade Coil tokens on Robinhood Chain and Arc. Native per-swap fees, no fee-on-transfer.",
};

export default function SwapPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <SwapIntro />

      {/* The widget stays narrow — a trade form reads better in one column — but the page around
          it does not have to be, so the notes below can sit three-up instead of in a 32rem gutter. */}
      <div className="mx-auto max-w-lg">
        <SwapWidget />
      </div>

      <SwapNotes />
    </div>
  );
}
