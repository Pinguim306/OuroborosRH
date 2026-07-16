import { defineChain } from "viem";

/**
 * Robinhood Chain mainnet — an Arbitrum L2 with ETH as the native gas token.
 * Source: chainlist.org/chain/4663 and docs.robinhood.com/chain.
 * For the testnet, swap in its chain id + RPC (faucet at
 * faucet.testnet.chain.robinhood.com) — recommended for first deploys.
 */
/** Custom RPC override: set NEXT_PUBLIC_RPC_URL in the Vercel env to route every browser read
 *  and transaction through your own endpoint (private node, paid provider, etc.); unset falls
 *  back to the public Robinhood RPC. NEXT_PUBLIC_ vars are baked into the client bundle at build
 *  time — visible to anyone, so use an endpoint you're OK exposing (or key-gate it by referer). */
const RPC_URL =
  (process.env.NEXT_PUBLIC_RPC_URL ?? "").trim() || "https://rpc.mainnet.chain.robinhood.com";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
  testnet: false,
});

/** Chain id every transaction is pinned to (wagmi auto-prompts a network switch). */
export const CHAIN_ID = robinhoodChain.id;

/** The native coin ticker shown throughout the UI. */
export const NATIVE_SYMBOL = robinhoodChain.nativeCurrency.symbol;

/**
 * DexScreener's chain slug for Robinhood Chain (dexscreener.com/robinhood).
 * DexScreener only tracks tokens that have a live DEX pair, so this is used for
 * graduated tokens (which get a Uniswap V2 pair) — not bonding-curve tokens.
 */
export const DEXSCREENER_CHAIN = "robinhood";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** Build the embeddable DexScreener chart URL for a graduated token's pair. */
export function dexscreenerEmbedUrl(pair?: string): string | null {
  if (!pair || pair.toLowerCase() === ZERO_ADDR) return null;
  const params = new URLSearchParams({
    embed: "1",
    theme: "dark",
    trades: "0",
    info: "0",
  });
  return `https://dexscreener.com/${DEXSCREENER_CHAIN}/${pair}?${params.toString()}`;
}

/** Public DexScreener page for a pair (used for the "open on DexScreener" link). */
export function dexscreenerPageUrl(pair?: string): string | null {
  if (!pair || pair.toLowerCase() === ZERO_ADDR) return null;
  return `https://dexscreener.com/${DEXSCREENER_CHAIN}/${pair}`;
}

/**
 * Uniswap deployment addresses on Robinhood Chain (chain 4663), from
 * @uniswap/sdk-core. Curves migrate liquidity to the V2 router at graduation;
 * the others are handy for building "trade on Uniswap" links.
 */
export const ROBINHOOD_CONTRACTS = {
  uniswapV2Router: "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba",
  uniswapV2Factory: "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f",
  uniswapV3Factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  swapRouter02: "0xCaf681a66D020601342297493863E78C959E5cb2",
  v4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
} as const;
