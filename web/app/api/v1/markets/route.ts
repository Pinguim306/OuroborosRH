import { chainFromQuery, checkAuth, fail, ok } from "@/lib/server/api";
import { fetchMarkets } from "@/lib/server/launchpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/markets?limit=50&chain=<id> — list launchpad markets with live stats. */
export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  let chainId;
  try {
    chainId = chainFromQuery(req);
  } catch (e) {
    return fail(400, (e as Error).message);
  }

  try {
    const { markets, demo } = await fetchMarkets(limit, chainId);
    return ok({ chainId, demo, count: markets.length, markets });
  } catch (e) {
    return fail(502, "failed to read markets", { detail: (e as Error).message });
  }
}
