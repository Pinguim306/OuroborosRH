"use client";

import { useEffect, useState } from "react";

/**
 * Live ETH/USD price for displaying fiat values. Uses CoinGecko's public API and
 * refreshes each minute. Returns 0 until loaded (callers fall back to ETH).
 */
export function useEthPrice(): number {
  const [price, setPrice] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        // Our own route (server-side, cached, with a fallback source) — avoids the
        // browser CoinGecko rate limits/CORS that made $ values drop back to ETH.
        const r = await fetch("/api/eth-price", { cache: "no-store" });
        const j = await r.json();
        const p = j?.usd;
        if (alive && typeof p === "number" && p > 0) setPrice(p);
      } catch {
        // Ignore — callers fall back to showing ETH.
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return price;
}
