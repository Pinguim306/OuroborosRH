import { ok } from "@/lib/server/api";
import { CHAIN_ID, NATIVE_SYMBOL } from "@/lib/server/launchpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1 — service index for integrators (e.g. Telegram trade bots). */
export async function GET() {
  return ok({
    service: "Ouroboros Launchpad Trade API",
    version: "1",
    chainId: CHAIN_ID,
    nativeSymbol: NATIVE_SYMBOL,
    auth: "Send the API key as `Authorization: Bearer <key>` or `x-api-key` when LAUNCHPAD_API_KEY is configured.",
    amounts: "All on-chain amounts are integer wei strings.",
    endpoints: {
      "GET /api/v1/markets": "List markets with live stats. ?limit=1..100",
      "GET /api/v1/markets/{token}": "One market by token address.",
      "GET /api/v1/quote": "?token&side=buy|sell&amount=<wei>. Buy: native in→tokens out. Sell: tokens in→native out.",
      "POST /api/v1/tx/buy": "Body {token, amount(nativeWei), slippageBps?, minTokensOut?} → unsigned buy tx.",
      "POST /api/v1/tx/sell": "Body {token, amount(tokenWei), from?, slippageBps?, minNativeOut?} → optional approval + unsigned sell tx.",
      "POST /api/v1/tx/approve": "Body {token, amount?} → unsigned approve tx for the curve.",
    },
    note: "Transactions are returned unsigned ({chainId,to,data,value}); bots sign and broadcast with their own keys. The API never holds keys.",
  });
}
