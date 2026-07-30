import { chainConfig } from "./chain";

/**
 * USD rate for a chain's native coin, callable from inside async loaders (the hooks' load()
 * functions can't use useEthPrice — it's a React hook).
 *
 * This is what makes cross-chain AGGREGATION honest: leaderboard and profile totals sum trades
 * from chains whose native coins differ by three orders of magnitude (ETH ≈ thousands of dollars,
 * Arc's USDC ≡ 1). Summing raw native amounts would count a $1 Arc trade as an "ETH" — the boards
 * would be nonsense the moment the first Arc trade landed. Per-trade DISPLAY can stay native
 * (each row knows its token's chain); anything summed across chains converts here first.
 *
 * Stable-gas chains short-circuit to 1. Oracle chains go through our own /api/eth-price route
 * (server-cached, fallback source) — the same one useEthPrice uses, so the two can't disagree.
 */
const cache = new Map<number, { usd: number; at: number }>();
const TTL_MS = 60_000;

export async function nativeUsdOf(chainId: number): Promise<number> {
  if (chainConfig(chainId).nativeUsd.kind === "stable") return 1;
  const hit = cache.get(chainId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.usd;
  try {
    const r = await fetch(`/api/eth-price?chain=${chainId}`, { cache: "no-store" });
    const j = (await r.json()) as { usd?: number };
    if (typeof j.usd === "number" && j.usd > 0) {
      cache.set(chainId, { usd: j.usd, at: Date.now() });
      return j.usd;
    }
  } catch {
    /* fall through */
  }
  // Better a stale rate than dropping a chain from the boards; 0 only when never fetched.
  return hit?.usd ?? 0;
}
