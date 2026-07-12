import { checkAuth, fail, ok, parseBig } from "@/lib/server/api";
import {
  allowanceOf,
  applySlippage,
  buildApproveTx,
  buildSellTx,
  fetchMarket,
  normalizeAddress,
  quoteSell,
} from "@/lib/server/launchpad";
import { LIVE } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tx/sell
 * Body: { token, amount (token wei in), from?, slippageBps?=500, minNativeOut? }
 * Selling requires the curve to hold an allowance for the seller's tokens. When
 * `from` is supplied we check it and, if needed, return an `approval` transaction
 * that must be signed and mined before the `transaction`.
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

  let amount: bigint;
  try {
    amount = parseBig(body.amount, "amount");
  } catch (e) {
    return fail(400, (e as Error).message);
  }
  if (amount === 0n) return fail(400, "amount must be greater than 0");

  const from = body.from != null ? normalizeAddress(body.from as string) : null;
  if (body.from != null && !from) return fail(400, "invalid from address");
  const slippageBps = Number(body.slippageBps ?? 500);

  const market = await fetchMarket(token);
  if (!market) return fail(404, "market not found");
  if (market.graduated) {
    return fail(409, "token has graduated — trade on the DEX pair", { pair: market.pair });
  }

  try {
    const { nativeOut, totalFee } = await quoteSell(market.curve, amount);
    let minNativeOut: bigint;
    if (body.minNativeOut != null) {
      minNativeOut = parseBig(body.minNativeOut, "minNativeOut");
    } else {
      minNativeOut = applySlippage(nativeOut, slippageBps);
    }

    let approval = null;
    let needsApproval = false;
    if (from) {
      const allowance = await allowanceOf(token, from, market.curve);
      if (allowance < amount) {
        needsApproval = true;
        approval = buildApproveTx(token, market.curve);
      }
    }

    return ok({
      quote: { nativeOut: nativeOut.toString(), fee: totalFee.toString() },
      minNativeOut: minNativeOut.toString(),
      needsApproval,
      approval, // sign + mine this first when needsApproval is true
      transaction: buildSellTx(market.curve, amount, minNativeOut),
    });
  } catch (e) {
    return fail(502, "failed to build sell tx", { detail: (e as Error).message });
  }
}
