import { checkAuth, fail, ok, parseBig } from "@/lib/server/api";
import {
  applySlippage,
  buildBuyTx,
  fetchMarket,
  normalizeAddress,
  quoteBuy,
} from "@/lib/server/launchpad";
import { LIVE } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tx/buy
 * Body: { token, amount (native wei in), slippageBps?=500, minTokensOut? }
 * Returns an unsigned buy transaction for the bot to sign and broadcast, plus the
 * quote used to derive minTokensOut.
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

  const slippageBps = Number(body.slippageBps ?? 500);

  const market = await fetchMarket(token);
  if (!market) return fail(404, "market not found");
  if (market.graduated) {
    return fail(409, "token has graduated — trade on the DEX pair", { pair: market.pair });
  }

  try {
    const { tokensOut, totalFee } = await quoteBuy(market.curve, amount);
    let minTokensOut: bigint;
    if (body.minTokensOut != null) {
      minTokensOut = parseBig(body.minTokensOut, "minTokensOut");
    } else {
      minTokensOut = applySlippage(tokensOut, slippageBps);
    }
    return ok({
      quote: { tokensOut: tokensOut.toString(), fee: totalFee.toString() },
      minTokensOut: minTokensOut.toString(),
      transaction: buildBuyTx(market.curve, amount, minTokensOut),
    });
  } catch (e) {
    return fail(502, "failed to build buy tx", { detail: (e as Error).message });
  }
}
