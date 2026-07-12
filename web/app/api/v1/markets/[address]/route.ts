import { checkAuth, fail, ok } from "@/lib/server/api";
import { fetchMarket, normalizeAddress } from "@/lib/server/launchpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/markets/{tokenAddress} — a single market's live stats. */
export async function GET(req: Request, { params }: { params: { address: string } }) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const token = normalizeAddress(params.address);
  if (!token) return fail(400, "invalid token address");

  try {
    const market = await fetchMarket(token);
    if (!market) return fail(404, "market not found");
    return ok({ market });
  } catch (e) {
    return fail(502, "failed to read market", { detail: (e as Error).message });
  }
}
