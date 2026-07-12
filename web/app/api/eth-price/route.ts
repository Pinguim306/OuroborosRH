import { NextResponse } from "next/server";

/**
 * Server-side ETH/USD price. Fetching from the browser hits CoinGecko's public
 * rate limits (429) and CORS, which made prices intermittently fall back to ETH
 * instead of $. Doing it here (cached ~60s, with a fallback source) keeps the
 * USD values reliable for every visitor.
 */

export const revalidate = 60;

async function fromCoinGecko(): Promise<number | null> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 60 } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.ethereum?.usd;
    return typeof p === "number" && p > 0 ? p : null;
  } catch {
    return null;
  }
}

async function fromCoinbase(): Promise<number | null> {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
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

export async function GET() {
  const price = (await fromCoinGecko()) ?? (await fromCoinbase());
  return NextResponse.json(
    { usd: price ?? 0 },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
