import { checkAuth, fail, ok, parseBig } from "@/lib/server/api";
import {
  allowanceOf,
  applySlippage,
  buildApproveTx,
  buildSellTx,
  buildV4SellTx,
  fetchMarket,
  normalizeAddress,
  quoteSell,
  quoteV4,
} from "@/lib/server/launchpad";
import { COIL_SWAP_ROUTER, LIVE } from "@/lib/contracts";

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

  // v4 hook tokens sell through the CoilSwapRouter (the spender for the approval). `from` is
  // required: it is the recipient, the allowance owner, and the simulated quote account.
  if (market.mode === "v4") {
    if (!from) return fail(400, "v4 sells require from=<your address>");
    try {
      const allowance = await allowanceOf(token, from, COIL_SWAP_ROUTER);
      const needsApproval = allowance < amount;
      const approval = needsApproval ? buildApproveTx(token, COIL_SWAP_ROUTER) : null;

      let minNativeOut: bigint | null = null;
      let quoted: bigint | null = null;
      if (body.minNativeOut != null) {
        minNativeOut = parseBig(body.minNativeOut, "minNativeOut");
      } else if (!needsApproval) {
        // Simulating the sell needs the allowance in place; with it, quote then apply slippage.
        quoted = await quoteV4(token, false, amount, from);
        minNativeOut = applySlippage(quoted, slippageBps);
      }

      return ok({
        mode: "v4",
        router: COIL_SWAP_ROUTER,
        needsApproval,
        approval, // sign + mine this first when needsApproval is true
        quote: quoted != null ? { nativeOut: quoted.toString() } : null,
        minNativeOut: minNativeOut != null ? minNativeOut.toString() : null,
        // Without an allowance the quote can't simulate — approve first, then call again
        // (or pass minNativeOut explicitly to get the swap tx in the same call).
        transaction:
          minNativeOut != null ? buildV4SellTx(token, amount, minNativeOut, from) : null,
      });
    } catch (e) {
      return fail(502, "failed to build v4 sell tx", { detail: (e as Error).message });
    }
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
