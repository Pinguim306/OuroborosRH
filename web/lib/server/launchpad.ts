import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  maxUint256,
  type Address,
} from "viem";
import { robinhoodChain, ROBINHOOD_CONTRACTS } from "@/lib/chain";
import {
  CONTRACTS,
  LIVE,
  launchpadAbi,
  curveAbi,
  tokenAbi,
  COIL_LAUNCHPAD,
  LAUNCH_LIVE,
  COIL_SWAP_ROUTER,
  coilLaunchpadV4Abi,
  coilSwapRouterAbi,
  coilPoolKey,
  coilSlot0Slot,
  v4PriceFromPackedSlot0,
  v4PoolManagerAbi,
  isCoilToken,
  type CoilMarket,
} from "@/lib/contracts";
import { MOCK_TOKENS } from "@/lib/mock/data";

/**
 * Server-side launchpad reader + transaction builder. Powers the public trade API
 * (`/api/v1/*`) that Telegram trade bots integrate against: bots read markets and
 * quotes, ask this API to *build* unsigned buy/sell/approve transactions, then sign
 * and broadcast them with their own keys. We never hold keys or sign anything.
 */

const RPC_URL =
  process.env.RH_RPC_URL || robinhoodChain.rpcUrls.default.http[0];

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(RPC_URL),
});

export const CHAIN_ID = robinhoodChain.id;
export const NATIVE_SYMBOL = robinhoodChain.nativeCurrency.symbol;

export function normalizeAddress(a: string | undefined | null): Address | null {
  if (!a || !isAddress(a)) return null;
  return a as Address;
}

/** A market as exposed by the API. All amounts are strings to stay JSON-safe. */
export interface ApiMarket {
  /** Present (as "v4") for Uniswap-v4 hook tokens — they trade through the CoilSwapRouter, not a
   *  bonding curve; `curve` then just mirrors the token address. Absent for curve/V3 markets. */
  mode?: "v4";
  token: Address;
  curve: Address;
  creator: Address;
  name: string;
  symbol: string;
  metadataURI: string;
  createdAt: number;
  priceEth: string;
  marketCapEth: string;
  totalSupply: string;
  realNativeRaisedEth: string;
  graduationProgress: number;
  graduated: boolean;
  pair: Address | null;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

interface RawMarket {
  token: Address;
  curve: Address;
  creator: Address;
  name: string;
  symbol: string;
  metadataURI: string;
  createdAt: bigint;
}

function curveStatsCalls(m: RawMarket) {
  return [
    { address: m.curve, abi: curveAbi, functionName: "currentPrice" },
    { address: m.curve, abi: curveAbi, functionName: "graduationProgress" },
    { address: m.curve, abi: curveAbi, functionName: "graduated" },
    { address: m.curve, abi: curveAbi, functionName: "realNativeRaised" },
    { address: m.token, abi: tokenAbi, functionName: "totalSupply" },
    { address: m.curve, abi: curveAbi, functionName: "pair" },
  ] as const;
}

function toApiMarket(m: RawMarket, r: readonly { result?: unknown }[]): ApiMarket {
  const price = (r[0]?.result as bigint) ?? 0n;
  const supply = (r[4]?.result as bigint) ?? 0n;
  const priceEth = Number(formatEther(price));
  const supplyNum = Number(formatEther(supply));
  const pairRaw = r[5]?.result as Address | undefined;
  return {
    token: m.token,
    curve: m.curve,
    creator: m.creator,
    name: m.name,
    symbol: m.symbol,
    metadataURI: m.metadataURI,
    createdAt: Number(m.createdAt),
    priceEth: String(priceEth),
    marketCapEth: String(priceEth * supplyNum),
    totalSupply: String(supplyNum),
    realNativeRaisedEth: formatEther((r[3]?.result as bigint) ?? 0n),
    graduationProgress: Number((r[1]?.result as bigint) ?? 0n) / 1e18,
    graduated: Boolean(r[2]?.result),
    pair: pairRaw && pairRaw !== ZERO ? pairRaw : null,
  };
}

const V4_POOL_MANAGER = ROBINHOOD_CONTRACTS.v4PoolManager as Address;
const V4_DEADLINE_SECONDS = 20 * 60;

function v4Deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + V4_DEADLINE_SECONDS);
}

function v4ToApiMarket(m: CoilMarket, supply: bigint, priceEth: number): ApiMarket {
  const supplyNum = Number(formatEther(supply));
  return {
    mode: "v4",
    token: m.token,
    curve: m.token, // the token IS the pool/hook — kept for shape-compat with curve markets
    creator: m.creator,
    name: m.name,
    symbol: m.symbol,
    metadataURI: m.metadataURI,
    createdAt: Number(m.createdAt),
    priceEth: String(priceEth),
    marketCapEth: String(priceEth * supplyNum),
    totalSupply: String(supplyNum),
    realNativeRaisedEth: "0",
    graduationProgress: 0,
    graduated: false,
    pair: null,
  };
}

/** Uniswap-v4 (CoilLaunchpad) markets, priced from the PoolManager's slot0 via extsload. */
async function fetchV4Markets(limit = 50): Promise<ApiMarket[]> {
  if (!LAUNCH_LIVE) return [];
  const raw = (await publicClient.readContract({
    address: COIL_LAUNCHPAD,
    abi: coilLaunchpadV4Abi,
    functionName: "getMarkets",
    args: [0n, BigInt(limit)],
  })) as readonly CoilMarket[];
  if (raw.length === 0) return [];
  const calls = raw.flatMap((m) => [
    { address: m.token, abi: tokenAbi, functionName: "totalSupply" },
    {
      address: V4_POOL_MANAGER,
      abi: v4PoolManagerAbi,
      functionName: "extsload",
      args: [coilSlot0Slot(m.token)],
    },
  ]);
  const res = (await publicClient.multicall({ contracts: calls as never })) as {
    result?: unknown;
  }[];
  return raw.map((m, i) =>
    v4ToApiMarket(m, (res[i * 2]?.result as bigint) ?? 0n, v4PriceFromPackedSlot0(res[i * 2 + 1]?.result)),
  );
}

async function fetchV4Market(token: Address): Promise<ApiMarket | null> {
  if (!LAUNCH_LIVE) return null;
  const idx = (await publicClient.readContract({
    address: COIL_LAUNCHPAD,
    abi: coilLaunchpadV4Abi,
    functionName: "marketIndexByToken",
    args: [token],
  })) as bigint;
  if (idx === 0n) return null;
  const m = (await publicClient.readContract({
    address: COIL_LAUNCHPAD,
    abi: coilLaunchpadV4Abi,
    functionName: "markets",
    args: [idx - 1n],
  })) as readonly [Address, Address, boolean, string, string, string, bigint];
  const market: CoilMarket = {
    token: m[0],
    creator: m[1],
    creatorRewards: m[2],
    name: m[3],
    symbol: m[4],
    metadataURI: m[5],
    createdAt: m[6],
  };
  const res = (await publicClient.multicall({
    contracts: [
      { address: token, abi: tokenAbi, functionName: "totalSupply" },
      {
        address: V4_POOL_MANAGER,
        abi: v4PoolManagerAbi,
        functionName: "extsload",
        args: [coilSlot0Slot(token)],
      },
    ] as never,
  })) as { result?: unknown }[];
  return v4ToApiMarket(market, (res[0]?.result as bigint) ?? 0n, v4PriceFromPackedSlot0(res[1]?.result));
}

/**
 * Quote a v4 swap by simulating the real CoilSwapRouter call from `from`'s account (the router
 * has no view quoter). `from` must exist and, for buys, hold the ETH being quoted — bots quote
 * with the same funded wallet they trade with.
 */
export async function quoteV4(
  token: Address,
  isBuy: boolean,
  amountIn: bigint,
  from: Address,
): Promise<bigint> {
  const { result } = await publicClient.simulateContract({
    address: COIL_SWAP_ROUTER,
    abi: coilSwapRouterAbi,
    functionName: "swapExactInSingle",
    args: [coilPoolKey(token), isBuy, amountIn, 0n, from, v4Deadline()],
    value: isBuy ? amountIn : 0n,
    account: from,
  });
  return result as bigint;
}

export function buildV4BuyTx(
  token: Address,
  nativeInWei: bigint,
  minTokensOut: bigint,
  recipient: Address,
): TxRequest {
  return {
    chainId: CHAIN_ID,
    to: COIL_SWAP_ROUTER,
    data: encodeFunctionData({
      abi: coilSwapRouterAbi,
      functionName: "swapExactInSingle",
      args: [coilPoolKey(token), true, nativeInWei, minTokensOut, recipient, v4Deadline()],
    }),
    value: nativeInWei.toString(),
  };
}

export function buildV4SellTx(
  token: Address,
  tokenInWei: bigint,
  minNativeOut: bigint,
  recipient: Address,
): TxRequest {
  return {
    chainId: CHAIN_ID,
    to: COIL_SWAP_ROUTER,
    data: encodeFunctionData({
      abi: coilSwapRouterAbi,
      functionName: "swapExactInSingle",
      args: [coilPoolKey(token), false, tokenInWei, minNativeOut, recipient, v4Deadline()],
    }),
    value: "0",
  };
}

/** Demo fallback so bots can integrate before contracts are deployed. */
function mockMarket(t: (typeof MOCK_TOKENS)[number]): ApiMarket {
  return {
    token: t.address,
    curve: t.curve,
    creator: t.creator,
    name: t.name,
    symbol: t.symbol,
    metadataURI: t.image,
    createdAt: t.createdAt,
    priceEth: String(t.priceRh),
    marketCapEth: String(t.marketCapRh),
    totalSupply: "1000000000",
    realNativeRaisedEth: String(t.liquidityRh),
    graduationProgress: t.graduationProgress,
    graduated: t.graduated,
    pair: t.pair ?? null,
  };
}

export async function fetchMarkets(limit = 50): Promise<{ markets: ApiMarket[]; demo: boolean }> {
  if (!LIVE) return { markets: MOCK_TOKENS.slice(0, limit).map(mockMarket), demo: true };

  const [raw, v4Markets] = await Promise.all([
    publicClient.readContract({
      address: CONTRACTS.launchpad,
      abi: launchpadAbi,
      functionName: "getMarkets",
      args: [0n, BigInt(limit)],
    }) as Promise<readonly RawMarket[]>,
    fetchV4Markets(limit).catch(() => [] as ApiMarket[]),
  ]);

  let markets: ApiMarket[] = [];
  if (raw.length > 0) {
    const calls = raw.flatMap(curveStatsCalls);
    const results = (await publicClient.multicall({
      contracts: calls as never,
    })) as { result?: unknown }[];
    const per = 6;
    markets = raw.map((m, i) => toApiMarket(m, results.slice(i * per, i * per + per)));
  }

  const merged = [...markets, ...v4Markets]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  return { markets: merged, demo: false };
}

export async function fetchMarket(token: Address): Promise<ApiMarket | null> {
  if (!LIVE) {
    const t = MOCK_TOKENS.find((x) => x.address.toLowerCase() === token.toLowerCase());
    return t ? mockMarket(t) : null;
  }

  // v4 hook tokens are recognizable from their flag-encoded address alone.
  if (isCoilToken(token)) {
    const v4 = await fetchV4Market(token).catch(() => null);
    if (v4) return v4;
  }

  const idx = (await publicClient.readContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "marketIndexByToken",
    args: [token],
  })) as bigint;
  if (idx === 0n) return null;

  const m = (await publicClient.readContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "markets",
    args: [idx - 1n],
  })) as readonly [Address, Address, Address, string, string, string, bigint];

  const raw: RawMarket = {
    token: m[0],
    curve: m[1],
    creator: m[2],
    name: m[3],
    symbol: m[4],
    metadataURI: m[5],
    createdAt: m[6],
  };
  const results = (await publicClient.multicall({
    contracts: curveStatsCalls(raw) as never,
  })) as { result?: unknown }[];
  return toApiMarket(raw, results);
}

export async function quoteBuy(curve: Address, nativeInWei: bigint) {
  const [tokensOut, totalFee] = (await publicClient.readContract({
    address: curve,
    abi: curveAbi,
    functionName: "quoteBuy",
    args: [nativeInWei],
  })) as readonly [bigint, bigint];
  return { tokensOut, totalFee };
}

export async function quoteSell(curve: Address, tokenInWei: bigint) {
  const [nativeOut, totalFee] = (await publicClient.readContract({
    address: curve,
    abi: curveAbi,
    functionName: "quoteSell",
    args: [tokenInWei],
  })) as readonly [bigint, bigint];
  return { nativeOut, totalFee };
}

/** An unsigned EIP-1559-style transaction request the bot signs and broadcasts. */
export interface TxRequest {
  chainId: number;
  to: Address;
  data: `0x${string}`;
  value: string; // decimal wei string
}

export function buildBuyTx(curve: Address, nativeInWei: bigint, minTokensOut: bigint): TxRequest {
  return {
    chainId: CHAIN_ID,
    to: curve,
    data: encodeFunctionData({ abi: curveAbi, functionName: "buy", args: [minTokensOut] }),
    value: nativeInWei.toString(),
  };
}

export function buildSellTx(curve: Address, tokenInWei: bigint, minNativeOut: bigint): TxRequest {
  return {
    chainId: CHAIN_ID,
    to: curve,
    data: encodeFunctionData({
      abi: curveAbi,
      functionName: "sell",
      args: [tokenInWei, minNativeOut],
    }),
    value: "0",
  };
}

export function buildApproveTx(token: Address, spender: Address, amount = maxUint256): TxRequest {
  return {
    chainId: CHAIN_ID,
    to: token,
    data: encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [spender, amount] }),
    value: "0",
  };
}

export async function allowanceOf(token: Address, owner: Address, spender: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: tokenAbi,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;
}

/** Apply a slippage tolerance (bps) to a minimum-out amount. */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))));
  return (amount * (10_000n - bps)) / 10_000n;
}
