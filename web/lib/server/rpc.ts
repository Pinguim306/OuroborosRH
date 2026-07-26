import { createPublicClient, http, type PublicClient } from "viem";
import { chainConfig, DEFAULT_CHAIN_ID, arcChain } from "@/lib/chain";

/**
 * Server-side read clients, one per chain. The /api/* routes run on Vercel, where the browser's
 * NEXT_PUBLIC_* RPC is often the wrong endpoint (rate-limited, referer-gated), so each chain takes
 * a SERVER-only override: RH_RPC_URL keeps its historical name for the default chain, the others
 * follow <PREFIX>_RPC_URL. Unset falls through to the chain's public RPC.
 */
const SERVER_RPC: Record<number, string | undefined> = {
  [DEFAULT_CHAIN_ID]: process.env.RH_RPC_URL,
  [arcChain.id]: process.env.ARC_RPC_URL,
};

const clients = new Map<number, PublicClient>();

/** Read client for a chain id; unknown/omitted ids resolve to the default chain. Memoized — a new
 *  client per request would drop viem's batching. */
export function publicClientFor(chainId?: number): PublicClient {
  const chain = chainConfig(chainId).chain;
  const cached = clients.get(chain.id);
  if (cached) return cached;
  const client = createPublicClient({
    chain,
    transport: http(SERVER_RPC[chain.id] || chain.rpcUrls.default.http[0]),
  }) as PublicClient;
  clients.set(chain.id, client);
  return client;
}
