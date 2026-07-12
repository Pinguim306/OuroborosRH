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
        const r = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
          { cache: "no-store" },
        );
        const j = await r.json();
        const p = j?.ethereum?.usd;
        if (alive && typeof p === "number") setPrice(p);
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
