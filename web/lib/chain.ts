import { defineChain, type Chain } from "viem";
import type { Address } from "./types";

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

/** Build the embeddable DexScreener chart URL for a graduated token's pair.
 *  Null on chains DexScreener doesn't index, so callers already handle the no-chart case. */
export function dexscreenerEmbedUrl(pair?: string, chainId?: number): string | null {
  const slug = chainConfig(chainId).dexscreenerSlug;
  if (!slug || !pair || pair.toLowerCase() === ZERO_ADDR) return null;
  const params = new URLSearchParams({
    embed: "1",
    theme: "dark",
    trades: "0",
    info: "0",
  });
  return `https://dexscreener.com/${slug}/${pair}?${params.toString()}`;
}

/** Public DexScreener page for a pair (used for the "open on DexScreener" link). */
export function dexscreenerPageUrl(pair?: string, chainId?: number): string | null {
  const slug = chainConfig(chainId).dexscreenerSlug;
  if (!slug || !pair || pair.toLowerCase() === ZERO_ADDR) return null;
  return `https://dexscreener.com/${slug}/${pair}`;
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

/* ------------------------------------------------------------------------- *
 * Multi-chain registry (additive — the default chain above is unchanged).
 * ------------------------------------------------------------------------- */

/** Per-chain RPC override. The default chain keeps the unprefixed NEXT_PUBLIC_RPC_URL it has
 *  always used; every other chain takes the same name behind its chain prefix. Next.js inlines
 *  NEXT_PUBLIC_* only at *literal* `process.env.X` sites, so each var is spelled out — a computed
 *  `process.env[key]` reads as undefined in the browser bundle. Public defaults ship below, so
 *  nothing has to be configured for reads to work. */
const ARC_RPC_URL = (process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "").trim() || "https://5042.rpc.thirdweb.com";
const ARC_TESTNET_RPC_URL =
  (process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ?? "").trim() || "https://rpc.testnet.arc.network";

/**
 * Circle's Arc — gas is paid in USDC. The EVM scales Arc's native USDC to 18 decimals (verified
 * on-chain against the node), NOT the 6 decimals of the ERC-20, so formatEther/parseEther are the
 * correct units for every native balance and msg.value on Arc — same math as an ETH chain.
 */
export const arcChain = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://arcscan.app" },
  },
  testnet: false,
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

/** Optional address from env — undefined (not zero) when unset, so "not deployed here" is a
 *  distinct state from "deployed at 0x0". */
const optAddr = (v?: string): Address | undefined => {
  const s = (v ?? "").trim();
  return s.startsWith("0x") && s.length === 42 ? (s as Address) : undefined;
};

/** The Uniswap deployment a chain trades on. Every field is optional: a chain that lacks one
 *  simply can't offer that route, and the call sites already gate on the address. */
export type UniswapContracts = {
  uniswapV2Router?: Address;
  uniswapV2Factory?: Address;
  uniswapV3Factory?: Address;
  swapRouter02?: Address;
  /** Uniswap v4 PoolManager — every v4 pool + Swap event lives in this singleton. */
  v4PoolManager?: Address;
};

/** How the native coin's USD value is sourced. Arc's gas token IS USDC, so it's pegged and needs
 *  no oracle; ETH chains query the price route. This is the seam every fiat figure hangs off. */
export type NativeUsdSource =
  | { kind: "stable" }
  | { kind: "oracle"; coingeckoId: string; coinbasePair: string };

/** Everything that varies per chain but is NOT a Coil deployment (those live in contracts.ts). */
export type ChainConfig = {
  chain: Chain;
  /** Ticker + long name of the gas token, as rendered in the UI ("ETH"/"Ether", "USDC"/"USD Coin").
   *  Decimals live on `chain.nativeCurrency` — 18 on every chain here, Arc included. */
  nativeSymbol: string;
  nativeName: string;
  nativeUsd: NativeUsdSource;
  /** Explorer root, no trailing slash — see `explorerUrl`. */
  explorerBase: string;
  /** DexScreener's slug, or null on chains it doesn't index (Arc). */
  dexscreenerSlug: string | null;
  uniswap: UniswapContracts;
};

export const CHAINS: Record<number, ChainConfig> = {
  [robinhoodChain.id]: {
    chain: robinhoodChain,
    nativeSymbol: robinhoodChain.nativeCurrency.symbol,
    nativeName: robinhoodChain.nativeCurrency.name,
    nativeUsd: { kind: "oracle", coingeckoId: "ethereum", coinbasePair: "ETH-USD" },
    explorerBase: robinhoodChain.blockExplorers.default.url,
    dexscreenerSlug: DEXSCREENER_CHAIN,
    uniswap: ROBINHOOD_CONTRACTS,
  },
  // Arc mainnet: Uniswap isn't deployed there yet, so every address is env-only — bringing the
  // chain up must not need a code change once the deployments land.
  [arcChain.id]: {
    chain: arcChain,
    nativeSymbol: arcChain.nativeCurrency.symbol,
    nativeName: "USD Coin",
    nativeUsd: { kind: "stable" },
    explorerBase: arcChain.blockExplorers.default.url,
    dexscreenerSlug: null,
    uniswap: {
      uniswapV2Router: optAddr(process.env.NEXT_PUBLIC_ARC_UNISWAP_V2_ROUTER),
      uniswapV2Factory: optAddr(process.env.NEXT_PUBLIC_ARC_UNISWAP_V2_FACTORY),
      uniswapV3Factory: optAddr(process.env.NEXT_PUBLIC_ARC_UNISWAP_V3_FACTORY),
      swapRouter02: optAddr(process.env.NEXT_PUBLIC_ARC_SWAP_ROUTER_02),
      v4PoolManager: optAddr(process.env.NEXT_PUBLIC_ARC_V4_POOL_MANAGER),
    },
  },
  [arcTestnet.id]: {
    chain: arcTestnet,
    nativeSymbol: arcTestnet.nativeCurrency.symbol,
    nativeName: "USD Coin",
    nativeUsd: { kind: "stable" },
    explorerBase: arcTestnet.blockExplorers.default.url,
    dexscreenerSlug: null,
    uniswap: {
      uniswapV2Router: optAddr(process.env.NEXT_PUBLIC_ARC_TESTNET_UNISWAP_V2_ROUTER),
      uniswapV2Factory: optAddr(process.env.NEXT_PUBLIC_ARC_TESTNET_UNISWAP_V2_FACTORY),
      uniswapV3Factory: optAddr(process.env.NEXT_PUBLIC_ARC_TESTNET_UNISWAP_V3_FACTORY),
      swapRouter02: optAddr(process.env.NEXT_PUBLIC_ARC_TESTNET_SWAP_ROUTER_02),
      // Known deployment — built in so the chain reads with zero configuration.
      v4PoolManager:
        optAddr(process.env.NEXT_PUBLIC_ARC_TESTNET_V4_POOL_MANAGER) ??
        "0x46Eb19af432954d126077E1764ef5F6A0013dE68",
    },
  },
};

/** The chain everything falls back to — identical to CHAIN_ID, which stays the pinned tx chain. */
export const DEFAULT_CHAIN_ID = CHAIN_ID;

/** Every chain the app knows about, default first (wagmi treats chains[0] as the fallback). */
export const SUPPORTED_CHAINS = [robinhoodChain, arcChain, arcTestnet] as const;

/** Narrow chain id — what wagmi's `switchChain`/`chainId` options accept. */
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

/**
 * URL CONVENTION for chain identity: `?chain=<id>`. Token/profile routes stay address-only —
 * `/token/0x…?chain=5042` — so every link ever shared keeps resolving, and an absent or unknown
 * param means the default chain. `parseChainParam` is the single decoder; `chainParam` the single
 * encoder (empty on the default chain, so today's URLs are byte-identical).
 */
export const CHAIN_PARAM = "chain";

export function parseChainParam(raw: string | null | undefined): SupportedChainId {
  const id = Number(raw);
  return raw && Number.isInteger(id) && CHAINS[id] ? (id as SupportedChainId) : DEFAULT_CHAIN_ID;
}

export function chainParam(chainId?: number): string {
  return chainId != null && chainId !== DEFAULT_CHAIN_ID ? `?${CHAIN_PARAM}=${chainId}` : "";
}

/** Cache/tally key for a token. An address alone is NOT unique across chains — CREATE2 hook-flag
 *  mining makes the same address on two chains a feature — so anything keyed per token (volume,
 *  PnL, stats) must key on the pair or it silently merges two different markets into one row. */
export function marketKey(m: { address: string; chainId?: number }): string {
  return `${m.chainId ?? DEFAULT_CHAIN_ID}:${m.address.toLowerCase()}`;
}

/** Config for a chain id; unknown/omitted ids resolve to the default chain, so callers that don't
 *  carry a chain id yet keep behaving exactly as they do today. */
export function chainConfig(chainId?: number): ChainConfig {
  return (chainId != null ? CHAINS[chainId] : undefined) ?? CHAINS[DEFAULT_CHAIN_ID];
}

/** Uniswap peripherals for a chain — the per-chain replacement for importing ROBINHOOD_CONTRACTS. */
export function uniswapContracts(chainId?: number): UniswapContracts {
  return chainConfig(chainId).uniswap;
}

/** The v4 PoolManager on a chain, or the zero address where v4 isn't deployed — reads against it
 *  come back empty, which is exactly how the callers already treat a pool that doesn't exist. */
export function v4PoolManagerOf(chainId?: number): Address {
  return chainConfig(chainId).uniswap.v4PoolManager ?? (ZERO_ADDR as Address);
}

/** Explorer deep link. Every chain here runs Blockscout, which shares the /tx /address /token
 *  path scheme, so one builder covers all of them. */
export function explorerUrl(
  kind: "tx" | "address" | "token",
  value: string,
  chainId?: number,
): string {
  return `${chainConfig(chainId).explorerBase}/${kind}/${value}`;
}
