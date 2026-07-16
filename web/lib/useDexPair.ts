"use client";

import { useEffect, useState } from "react";
import { DEXSCREENER_CHAIN } from "./chain";

/**
 * Probe DexScreener's public API for a pair/pool id on our chain. Uniswap v4 pools have no
 * standalone contract — DexScreener indexes them by PoolId (bytes32) — and whether a given chain's
 * v4 deployment is indexed at all varies, so callers use this to decide between the embedded
 * DexScreener chart and the on-chain candle fallback. Returns:
 *   - undefined while loading (or with no id);
 *   - true when DexScreener knows the pair;
 *   - false when it doesn't (or the API errored).
 */
export function useDexPair(pairId?: string): boolean | undefined {
  const [found, setFound] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setFound(undefined);
    if (!pairId) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `https://api.dexscreener.com/latest/dex/pairs/${DEXSCREENER_CHAIN}/${pairId}`,
          { cache: "no-store" },
        );
        const j = await r.json();
        const pairs = (j?.pairs ?? (j?.pair ? [j.pair] : [])) as unknown[];
        if (alive) setFound(Array.isArray(pairs) && pairs.length > 0);
      } catch {
        if (alive) setFound(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pairId]);

  return found;
}
