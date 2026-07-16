import { checkAuth, fail, ok, parseBig } from "@/lib/server/api";
import { fetchMarket, normalizeAddress, quoteBuy, quoteSell, quoteV4 } from "@/lib/server/launchpad";
import { COIL_SWAP_ROUTER, LIVE } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Format a float as a plain (non-exponential) non-negative integer string. */
function intStr(x: number): string {
  return Math.max(0, Math.floor(x)).toLocaleString("fullwide", { useGrouping: false });
}

/**
 * GET /api/v1/quote?token=0x..&side=buy|sell&amount=<wei>
 *   - side=buy:  amount is native (wei) in  → returns tokensOut + fee
 *   - side=sell: amount is token  (wei) in  → returns nativeOut + fee
 */
export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const token = normalizeAddress(searchParams.get("token"));
  const side = searchParams.get("side");
  if (!token) return fail(400, "invalid or missing token address");
  if (side !== "buy" && side !== "sell") return fail(400, 'side must be "buy" or "sell"');

  let amount: bigint;
  try {
    amount = parseBig(searchParams.get("amount"), "amount");
  } catch (e) {
    return fail(400, (e as Error).message);
  }
  if (amount === 0n) return fail(400, "amount must be greater than 0");

  const market = await fetchMarket(token);
  if (!market) return fail(404, "market not found");
  if (market.graduated) {
    return fail(409, "token has graduated — trade on the DEX pair", { pair: market.pair });
  }

  // Demo mode: contracts aren't deployed, so return a first-order estimate from the
  // mock price rather than an on-chain quote. Formatted as a plain wei integer.
  if (!LIVE) {
    const price = Number(market.priceEth) || 0;
    const fee = 0.015;
    if (side === "buy") {
      const net = Number(amount) * (1 - fee);
      const tokensOut = price > 0 ? net / price : 0;
      return ok({ demo: true, estimate: true, side, tokensOut: intStr(tokensOut) });
    }
    const gross = Number(amount) * price;
    return ok({ demo: true, estimate: true, side, nativeOut: intStr(gross * (1 - fee)) });
  }

  // v4 hook tokens: the router has no view quoter, so the quote is a simulation of the real
  // swap from the caller's own (funded) address — pass it as ?from=0x…
  if (market.mode === "v4") {
    const from = normalizeAddress(searchParams.get("from"));
    if (!from) {
      return fail(400, "v4 quotes are simulated — pass from=<your funded address>", {
        router: COIL_SWAP_ROUTER,
      });
    }
    try {
      const out = await quoteV4(token, side === "buy", amount, from);
      return ok(
        side === "buy"
          ? { side, mode: "v4", router: COIL_SWAP_ROUTER, tokensOut: out.toString() }
          : { side, mode: "v4", router: COIL_SWAP_ROUTER, nativeOut: out.toString() },
      );
    } catch (e) {
      return fail(502, "failed to quote v4 swap (does `from` hold the input amount?)", {
        detail: (e as Error).message,
      });
    }
  }

  try {
    if (side === "buy") {
      const { tokensOut, totalFee } = await quoteBuy(market.curve, amount);
      return ok({ side, tokensOut: tokensOut.toString(), fee: totalFee.toString() });
    }
    const { nativeOut, totalFee } = await quoteSell(market.curve, amount);
    return ok({ side, nativeOut: nativeOut.toString(), fee: totalFee.toString() });
  } catch (e) {
    return fail(502, "failed to quote", { detail: (e as Error).message });
  }
}
