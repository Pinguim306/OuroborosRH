import { encodeFunctionData, formatEther, isAddress, maxUint256, type Address } from "viem";
import {
  chainConfig,
  DEFAULT_CHAIN_ID,
  robinhoodChain,
  v4PoolManagerOf,
  type SupportedChainId,
} from "@/lib/chain";
import { publicClientFor } from "@/lib/server/rpc";
import {
  coilContracts,
  launchpadAbi,
  curveAbi,
  tokenAbi,
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
 *
 * MULTI-CHAIN: every function here takes an optional `chainId` and defaults to the default chain,
 * so an existing integration that never passes one keeps its exact behaviour. Addresses, the read
 * client and the `chainId` stamped on returned transactions all follow that argument — a bot must
 * never be handed a transaction built from one chain's router and told to broadcast it on another.
 */

/** Read client for the DEFAULT chain. Chain-aware callers use `publicClientFor(id)` instead. */
export const publicClient = publicClientFor(robinhoodChain.id);

export const CHAIN_ID = robinhoodChain.id;
export const NATIVE_SYMBOL = robinhoodChain.nativeCurrency.symbol;

/** The API's chain argument. Absent = the default chain, which is what every v1 client sent. */
export type ApiChainId = SupportedChainId;

export function normalizeAddress(a: string | undefined | null): Address | null {
  if (!a || !isAddress(a)) return null;
  return a as Address;
}

/** A market as exposed by the API. All amounts are strings to stay JSON-safe. */
export interface ApiMarket {
  /** Present (as "v4") for Uniswap-v4 hook tokens — they trade through the CoilSwapRouter, not a
   *  bonding curve; `curve` then just mirrors the token address. Absent for curve/V3 markets. */
  mode?: "v4";
  /** Which chain this market lives on; undefined = the default chain. */
  chainId?: number;
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

function toApiMarket(m: RawMarket, r: readonly { result?: unknown }[], chainId: ApiChainId): ApiMarket {
  const price = (r[0]?.result as bigint) ?? 0n;
  const supply = (r[4]?.result as bigint) ?? 0n;
  const priceEth = Number(formatEther(price));
  const supplyNum = Number(formatEther(supply));
  const pairRaw = r[5]?.result as Address | undefined;
  return {
    chainId,
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

const V4_DEADLINE_SECONDS = 20 * 60;

function v4Deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + V4_DEADLINE_SECONDS);
}

function v4ToApiMarket(
  m: CoilMarket,
  supply: bigint,
  priceEth: number,
  chainId: ApiChainId,
): ApiMarket {
  const supplyNum = Number(formatEther(supply));
  return {
    mode: "v4",
    chainId,
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
async function fetchV4Markets(limit: number, chainId: ApiChainId): Promise<ApiMarket[]> {
  const { coilLaunchpad, launchLive } = coilContracts(chainId);
  if (!launchLive) return [];
  const client = publicClientFor(chainId);
  const poolManager = v4PoolManagerOf(chainId);
  const raw = (await client.readContract({
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "getMarkets",
    args: [0n, BigInt(limit)],
  })) as readonly CoilMarket[];
  if (raw.length === 0) return [];
  const calls = raw.flatMap((m) => [
    { address: m.token, abi: tokenAbi, functionName: "totalSupply" },
    {
      address: poolManager,
      abi: v4PoolManagerAbi,
      functionName: "extsload",
      args: [coilSlot0Slot(m.token)],
    },
  ]);
  const res = (await client.multicall({ contracts: calls as never })) as {
    result?: unknown;
  }[];
  return raw.map((m, i) =>
    v4ToApiMarket(
      m,
      (res[i * 2]?.result as bigint) ?? 0n,
      v4PriceFromPackedSlot0(res[i * 2 + 1]?.result),
      chainId,
    ),
  );
}

async function fetchV4Market(token: Address, chainId: ApiChainId): Promise<ApiMarket | null> {
  const { coilLaunchpad, launchLive } = coilContracts(chainId);
  if (!launchLive) return null;
  const client = publicClientFor(chainId);
  const poolManager = v4PoolManagerOf(chainId);
  const idx = (await client.readContract({
    address: coilLaunchpad,
    abi: coilLaunchpadV4Abi,
    functionName: "marketIndexByToken",
    args: [token],
  })) as bigint;
  if (idx === 0n) return null;
  const m = (await client.readContract({
    address: coilLaunchpad,
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
  const res = (await client.multicall({
    contracts: [
      { address: token, abi: tokenAbi, functionName: "totalSupply" },
      {
        address: poolManager,
        abi: v4PoolManagerAbi,
        functionName: "extsload",
        args: [coilSlot0Slot(token)],
      },
    ] as never,
  })) as { result?: unknown }[];
  return v4ToApiMarket(
    market,
    (res[0]?.result as bigint) ?? 0n,
    v4PriceFromPackedSlot0(res[1]?.result),
    chainId,
  );
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
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): Promise<bigint> {
  const { result } = await publicClientFor(chainId).simulateContract({
    address: coilContracts(chainId).coilSwapRouter,
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
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): TxRequest {
  return {
    chainId,
    to: coilContracts(chainId).coilSwapRouter,
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
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): TxRequest {
  return {
    chainId,
    to: coilContracts(chainId).coilSwapRouter,
    data: encodeFunctionData({
      abi: coilSwapRouterAbi,
      functionName: "swapExactInSingle",
      args: [coilPoolKey(token), false, tokenInWei, minNativeOut, recipient, v4Deadline()],
    }),
    value: "0",
  };
}

/** Demo fallback so bots can integrate before contracts are deployed. */
function mockMarket(t: (typeof MOCK_TOKENS)[number], chainId: ApiChainId): ApiMarket {
  return {
    chainId,
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

export async function fetchMarkets(
  limit = 50,
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): Promise<{ markets: ApiMarket[]; demo: boolean }> {
  const { launchpad, live, anyLive } = coilContracts(chainId);
  // `anyLive`, not `live`: `live` means the CURVE launchpad specifically, which only exists on
  // Robinhood Chain. Gating on it would have made a v4-only chain (Arc) serve mock data to bots
  // even with its launchpad deployed.
  if (!anyLive) {
    return { markets: MOCK_TOKENS.slice(0, limit).map((t) => mockMarket(t, chainId)), demo: true };
  }

  const client = publicClientFor(chainId);
  const [raw, v4Markets] = await Promise.all([
    live
      ? (client.readContract({
          address: launchpad,
          abi: launchpadAbi,
          functionName: "getMarkets",
          args: [0n, BigInt(limit)],
        }) as Promise<readonly RawMarket[]>)
      : Promise.resolve([] as readonly RawMarket[]),
    fetchV4Markets(limit, chainId).catch(() => [] as ApiMarket[]),
  ]);

  let markets: ApiMarket[] = [];
  if (raw.length > 0) {
    const calls = raw.flatMap(curveStatsCalls);
    const results = (await client.multicall({
      contracts: calls as never,
    })) as { result?: unknown }[];
    const per = 6;
    markets = raw.map((m, i) => toApiMarket(m, results.slice(i * per, i * per + per), chainId));
  }

  const merged = [...markets, ...v4Markets]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  return { markets: merged, demo: false };
}

export async function fetchMarket(
  token: Address,
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): Promise<ApiMarket | null> {
  const { launchpad, live, anyLive } = coilContracts(chainId);
  if (!anyLive) {
    const t = MOCK_TOKENS.find((x) => x.address.toLowerCase() === token.toLowerCase());
    return t ? mockMarket(t, chainId) : null;
  }

  // v4 hook tokens are recognizable from their flag-encoded address alone.
  if (isCoilToken(token, chainId)) {
    const v4 = await fetchV4Market(token, chainId).catch(() => null);
    if (v4) return v4;
  }
  if (!live) return null; // v4-only chain: no curve launchpad to fall back to

  const client = publicClientFor(chainId);
  const idx = (await client.readContract({
    address: launchpad,
    abi: launchpadAbi,
    functionName: "marketIndexByToken",
    args: [token],
  })) as bigint;
  if (idx === 0n) return null;

  const m = (await client.readContract({
    address: launchpad,
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
  const results = (await client.multicall({
    contracts: curveStatsCalls(raw) as never,
  })) as { result?: unknown }[];
  return toApiMarket(raw, results, chainId);
}

export async function quoteBuy(
  curve: Address,
  nativeInWei: bigint,
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
) {
  const [tokensOut, totalFee] = (await publicClientFor(chainId).readContract({
    address: curve,
    abi: curveAbi,
    functionName: "quoteBuy",
    args: [nativeInWei],
  })) as readonly [bigint, bigint];
  return { tokensOut, totalFee };
}

export async function quoteSell(
  curve: Address,
  tokenInWei: bigint,
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
) {
  const [nativeOut, totalFee] = (await publicClientFor(chainId).readContract({
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

export function buildBuyTx(
  curve: Address,
  nativeInWei: bigint,
  minTokensOut: bigint,
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): TxRequest {
  return {
    chainId,
    to: curve,
    data: encodeFunctionData({ abi: curveAbi, functionName: "buy", args: [minTokensOut] }),
    value: nativeInWei.toString(),
  };
}

export function buildSellTx(
  curve: Address,
  tokenInWei: bigint,
  minNativeOut: bigint,
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): TxRequest {
  return {
    chainId,
    to: curve,
    data: encodeFunctionData({
      abi: curveAbi,
      functionName: "sell",
      args: [tokenInWei, minNativeOut],
    }),
    value: "0",
  };
}

export function buildApproveTx(
  token: Address,
  spender: Address,
  amount = maxUint256,
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): TxRequest {
  return {
    chainId,
    to: token,
    data: encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [spender, amount] }),
    value: "0",
  };
}

export async function allowanceOf(
  token: Address,
  owner: Address,
  spender: Address,
  chainId: ApiChainId = DEFAULT_CHAIN_ID,
): Promise<bigint> {
  return (await publicClientFor(chainId).readContract({
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
