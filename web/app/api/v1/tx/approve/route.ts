import { checkAuth, fail, ok, parseBig, parseChain } from "@/lib/server/api";
import { buildApproveTx, fetchMarket, normalizeAddress } from "@/lib/server/launchpad";
import { maxUint256 } from "viem";
import { coilContracts } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tx/approve
 * Body: { token, chain?, amount? } — approves the token's spender for `amount`
 * (defaults to unlimited). Sign + broadcast before selling.
 */
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "invalid JSON body");
  }

  let chainId;
  try {
    chainId = parseChain(body.chain);
  } catch (e) {
    return fail(400, (e as Error).message);
  }
  const { coilSwapRouter: COIL_SWAP_ROUTER, anyLive } = coilContracts(chainId);
  if (!anyLive) {
    return fail(503, "contracts not deployed on this chain — tx building unavailable", { chainId });
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

  const market = await fetchMarket(token, chainId);
  if (!market) return fail(404, "market not found", { chainId });

  // v4 tokens are spent by the CoilSwapRouter; curve/V3 tokens by their curve.
  const spender = market.mode === "v4" ? COIL_SWAP_ROUTER : market.curve;
  return ok({
    chainId,
    spender,
    transaction: buildApproveTx(token, spender, amount, chainId),
  });
}
