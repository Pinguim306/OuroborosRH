import { checkAuth, fail, ok } from "@/lib/server/api";
import { fetchMarkets } from "@/lib/server/launchpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/markets?limit=50 — list launchpad markets with live stats. */
export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  try {
    const { markets, demo } = await fetchMarkets(limit);
    return ok({ demo, count: markets.length, markets });
  } catch (e) {
    return fail(502, "failed to read markets", { detail: (e as Error).message });
  }
}
