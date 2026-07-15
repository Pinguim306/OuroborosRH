import type { Metadata } from "next";
import { LaunchWidget } from "@/components/LaunchWidget";

export const metadata: Metadata = {
  title: "Launch v4 — Coil",
  description: "Launch a token straight into a Uniswap v4 pool with a native per-swap fee.",
};

export default function LaunchPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-16">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Launch <span className="text-gradient">v4</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/50">
          One transaction deploys your token into a live Uniswap v4 pool — tradable instantly,
          liquidity locked forever, and every trade winds the coil with a native per-swap fee (no
          fee-on-transfer, no harvest).
        </p>
      </div>

      <LaunchWidget />
    </div>
  );
}
