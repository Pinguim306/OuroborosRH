import { checkAuth, fail, ok, parseBig } from "@/lib/server/api";
import { buildApproveTx, fetchMarket, normalizeAddress } from "@/lib/server/launchpad";
import { maxUint256 } from "viem";
import { COIL_SWAP_ROUTER, LIVE } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tx/approve
 * Body: { token, amount? } — approves the token's curve to spend `amount`
 * (defaults to unlimited). Sign + broadcast before selling.
 */
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  if (!LIVE) return fail(503, "contracts not deployed — tx building unavailable");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "invalid JSON body");
  }

  const token = normalizeAddress(body.token as string);
  if (!token) return fail(400, "invalid or missing token address");

  let amount = maxUint256;
  if (body.amount != null) {
    try {
      amount = parseBig(body.amount, "amount");
    } catch (e) {
      return fail(400, (e as Error).message);
    }
  }

  const market = await fetchMarket(token);
  if (!market) return fail(404, "market not found");

  // v4 tokens are spent by the CoilSwapRouter; curve/V3 tokens by their curve.
  const spender = market.mode === "v4" ? COIL_SWAP_ROUTER : market.curve;
  return ok({
    spender,
    transaction: buildApproveTx(token, spender, amount),
  });
}
