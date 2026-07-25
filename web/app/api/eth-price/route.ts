import { NextRequest, NextResponse } from "next/server";
import { chainConfig, parseChainParam } from "@/lib/chain";

/**
 * Server-side USD price of a chain's NATIVE coin. Fetching from the browser hits CoinGecko's
 * public rate limits (429) and CORS, which made prices intermittently fall back to ETH instead of
 * $. Doing it here (cached ~60s, with a fallback source) keeps the USD values reliable for every
 * visitor.
 *
 * `?chain=<id>` picks the coin; absent = the default chain, i.e. ETH/USD as before. The route name
 * is kept so already-deployed clients keep working.
 */

export const revalidate = 60;

async function fromCoinGecko(id: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { next: { revalidate: 60 } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.[id]?.usd;
    return typeof p === "number" && p > 0 ? p : null;
  } catch {
    return null;
  }
}

async function fromCoinbase(pair: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const p = Number(j?.data?.amount);
    return isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const source = chainConfig(parseChainParam(req.nextUrl.searchParams.get("chain"))).nativeUsd;
  // Gas paid in USDC is already a dollar — no oracle, no failure mode.
  const price =
    source.kind === "stable"
      ? 1
      : (await fromCoinGecko(source.coingeckoId)) ?? (await fromCoinbase(source.coinbasePair));
  return NextResponse.json(
    { usd: price ?? 0 },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
