import { chainFromQuery, checkAuth, fail, ok } from "@/lib/server/api";
import { fetchMarket, normalizeAddress } from "@/lib/server/launchpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/markets/{tokenAddress}?chain=<id> — a single market's live stats. */
export async function GET(req: Request, { params }: { params: { address: string } }) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const token = normalizeAddress(params.address);
  if (!token) return fail(400, "invalid token address");

  let chainId;
  try {
    chainId = chainFromQuery(req);
  } catch (e) {
    return fail(400, (e as Error).message);
  }

  try {
    const market = await fetchMarket(token, chainId);
    if (!market) return fail(404, "market not found", { chainId });
    return ok({ chainId, market });
  } catch (e) {
    return fail(502, "failed to read market", { detail: (e as Error).message });
  }
}
