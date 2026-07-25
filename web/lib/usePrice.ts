"use client";

import { useEffect, useState } from "react";
import { chainConfig } from "./chain";

/**
 * Live USD price of a chain's NATIVE coin, for displaying fiat values. Refreshes each minute and
 * returns 0 until loaded (callers fall back to showing the native amount).
 *
 * `chainId` omitted = the default chain, i.e. ETH/USD exactly as before. Chains whose gas token IS
 * a dollar (Arc pays gas in USDC) are marked `stable` in the registry and resolve to 1 with no
 * oracle call — otherwise every Arc market cap would come out ~4000x too high.
 */
export function useEthPrice(chainId?: number): number {
  const stable = chainConfig(chainId).nativeUsd.kind === "stable";
  const [price, setPrice] = useState(stable ? 1 : 0);

  useEffect(() => {
    if (stable) {
      setPrice(1);
      return;
    }
    let alive = true;
    async function load() {
      try {
        // Our own route (server-side, cached, with a fallback source) — avoids the
        // browser CoinGecko rate limits/CORS that made $ values drop back to ETH.
        const r = await fetch(`/api/eth-price?chain=${chainId ?? ""}`, { cache: "no-store" });
        const j = await r.json();
        const p = j?.usd;
        if (alive && typeof p === "number" && p > 0) setPrice(p);
      } catch {
        // Ignore — callers fall back to showing the native amount.
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [stable, chainId]);

  return price;
}
