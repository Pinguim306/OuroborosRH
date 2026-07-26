import { ok } from "@/lib/server/api";
import { CHAINS, DEFAULT_CHAIN_ID } from "@/lib/chain";
import { coilContracts } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1 — service index for integrators (e.g. Telegram trade bots). */
export async function GET() {
  const chains = Object.values(CHAINS).map((c) => ({
    chainId: c.chain.id,
    name: c.chain.name,
    nativeSymbol: c.nativeSymbol,
    default: c.chain.id === DEFAULT_CHAIN_ID,
    live: coilContracts(c.chain.id).anyLive,
  }));

  return ok({
    service: "Coil Launchpad Trade API",
    version: "1",
    // Kept at the top level, and still the default chain, so a client written before Coil was
    // multi-chain reads exactly what it always read.
    chainId: DEFAULT_CHAIN_ID,
    nativeSymbol: CHAINS[DEFAULT_CHAIN_ID].nativeSymbol,
    chains,
    chainParam:
      "Every endpoint takes an optional chain selector — `?chain=<id>` on GETs, `\"chain\"` in the JSON body on POSTs. Omit it for the default chain. Amounts are always in the target chain's native gas coin.",
    auth: "Send the API key as `Authorization: Bearer <key>` or `x-api-key` when LAUNCHPAD_API_KEY is configured.",
    amounts: "All on-chain amounts are integer wei strings.",
    endpoints: {
      "GET /api/v1/markets": "List markets with live stats. ?limit=1..100&chain=<id>",
      "GET /api/v1/markets/{token}": "One market by token address. ?chain=<id>",
      "GET /api/v1/quote": "?token&side=buy|sell&amount=<wei>&chain=<id>. Buy: native in\u2192tokens out. Sell: tokens in\u2192native out.",
      "POST /api/v1/tx/buy": "Body {token, amount(nativeWei), chain?, slippageBps?, minTokensOut?} \u2192 unsigned buy tx.",
      "POST /api/v1/tx/sell": "Body {token, amount(tokenWei), chain?, from?, slippageBps?, minNativeOut?} \u2192 optional approval + unsigned sell tx.",
      "POST /api/v1/tx/approve": "Body {token, chain?, amount?} \u2192 unsigned approve tx for the spender.",
    },
    note: "Transactions are returned unsigned ({chainId,to,data,value}); bots sign and broadcast with their own keys. Broadcast each one on the chainId it carries. The API never holds keys.",
  });
}
