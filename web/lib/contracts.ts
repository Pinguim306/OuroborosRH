import { encodeAbiParameters, keccak256 } from "viem";
import type { Address } from "./types";

/**
 * Deployed contract addresses. NEXT_PUBLIC_LAUNCHPAD_ADDRESS accepts a comma-
 * separated list: the FIRST address is the primary launchpad (new launches go
 * there); the rest are legacy launchpads whose markets are still read and merged
 * into the listings, so upgrading the contract never wipes the site's history.
 * While unset/zero the app runs entirely on the mock-data layer.
 */
export const LAUNCHPADS: Address[] = (process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.startsWith("0x") && s.length === 42) as Address[];

export const CONTRACTS = {
  launchpad: (LAUNCHPADS[0] ?? "0x0000000000000000000000000000000000000000") as Address,
};

export const isDeployed = (a: Address) =>
  a !== "0x0000000000000000000000000000000000000000";

export const LIVE = isDeployed(CONTRACTS.launchpad);

/**
 * The v4 Swap tab. `NEXT_PUBLIC_COIL_SWAP_ROUTER` is the deployed CoilSwapRouter; while unset the
 * Swap tab shows a "not live yet" state. Coil (v4) tokens are the hook itself, so their pool is
 * fully determined by the token address — see `coilPoolKey`.
 */
export const COIL_SWAP_ROUTER = ((process.env.NEXT_PUBLIC_COIL_SWAP_ROUTER ?? "").trim() ||
  "0x0000000000000000000000000000000000000000") as Address;

export const SWAP_LIVE = isDeployed(COIL_SWAP_ROUTER);

/** The v3 interface-fee wrapper (CoilSwapRouterV3). When set, non-Coil (v3) tokens route through
 *  it so the interface fee is charged on any token; otherwise they route through SwapRouter02
 *  directly (no fee). */
export const COIL_SWAP_ROUTER_V3 = ((process.env.NEXT_PUBLIC_COIL_SWAP_ROUTER_V3 ?? "").trim() ||
  "0x0000000000000000000000000000000000000000") as Address;

export const V3_FEE_LIVE = isDeployed(COIL_SWAP_ROUTER_V3);

export const coilSwapRouterV3Abi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "poolFee", type: "uint24" },
      { name: "minAmountOut", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "poolFee", type: "uint24" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** The standard Uniswap v3 fee tiers (in hundredths of a bip). The swap UI probes all four
 *  against the token/WETH pair and routes through whichever pool exists (deepest liquidity wins),
 *  so a token launched in ANY tier is tradeable — not just the 1% instant-launch tier. */
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;

/** Minimal Uniswap v3 factory ABI — `getPool` returns the pool address for a (tokenA, tokenB, fee)
 *  triple, or the zero address when no pool was ever created at that tier. */
export const uniswapV3FactoryAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

/** Minimal Uniswap v3 pool ABI — `liquidity` is the in-range liquidity, used to pick the deepest
 *  pool when a token has pools in more than one fee tier. */
export const uniswapV3PoolAbi = [
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

/** CoilHook pool constants (immutable in the contract): the LP fee is 0 (all capture via the
 *  hook), tickSpacing is 200, and the hook IS the token, so `hooks == token`. */
export const COIL_POOL_FEE = 0;
export const COIL_TICK_SPACING = 200;
const ETH_CURRENCY = "0x0000000000000000000000000000000000000000" as Address;

/** Build the v4 PoolKey for a Coil token (currency0 = native ETH < currency1 = the token). */
export function coilPoolKey(token: Address) {
  return {
    currency0: ETH_CURRENCY,
    currency1: token,
    fee: COIL_POOL_FEE,
    tickSpacing: COIL_TICK_SPACING,
    hooks: token, // the CoilHook is the token
  } as const;
}

/** The v4 PoolId of a Coil token's pool: keccak256(abi.encode(poolKey)). Used both to filter the
 *  PoolManager's Swap events and to derive the pool's storage slots for extsload reads. */
export function coilPoolId(token: Address): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "currency0", type: "address" },
            { name: "currency1", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "tickSpacing", type: "int24" },
            { name: "hooks", type: "address" },
          ],
        },
      ],
      [coilPoolKey(token)],
    ),
  );
}

/** CoilHook (v4 token) holder-dividend getter. Claiming uses the shared `claim()` from tokenAbi —
 *  same signature on both v3 dividend tokens and the v4 hook — but the pending-rewards read
 *  differs: v3 exposes `claimableRewardOf` (ETH only), the hook exposes `pendingOf` (ETH + token). */
export const coilHookAbi = [
  {
    type: "function",
    name: "pendingOf",
    stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [
      { name: "owedETH", type: "uint256" },
      { name: "owedTOKEN", type: "uint256" },
    ],
  },
  // Accrued buy&burn slice waiting inside the hook + the permissionless push to the treasury.
  { type: "function", name: "treasuryAccruedETH", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sweepTreasury", stateMutability: "nonpayable", inputs: [], outputs: [] },
  // Accrued creator slice (Creator Rewards mode) + the permissionless push to the creator.
  { type: "function", name: "creatorAccruedETH", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "creatorAccruedTOKEN", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sweepCreator", stateMutability: "nonpayable", inputs: [], outputs: [] },
  // Emitted on every swap with the fee split — summing `holders` gives the lifetime rewards pool.
  {
    type: "event",
    name: "FeeTaken",
    inputs: [
      { name: "isEth", type: "bool", indexed: true },
      { name: "protocol", type: "uint256", indexed: false },
      { name: "holders", type: "uint256", indexed: false },
      { name: "burn", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Uniswap v4 PoolManager storage: `mapping(PoolId => Pool.State) _pools` lives at slot 6
 *  (v4-core StateLibrary.POOLS_SLOT); `slot0` is the first word of Pool.State. */
const V4_POOLS_SLOT = 6n;

/** Storage slot of a Coil token's pool `slot0` inside the v4 PoolManager (for extsload reads). */
export function coilSlot0Slot(token: Address): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [coilPoolId(token), V4_POOLS_SLOT],
    ),
  );
}

/** Token price in ETH from the packed slot0 word (sqrtPriceX96 = low 160 bits). The Coil pool is
 *  (currency0 = native ETH, currency1 = token), so (sqrtP/2^96)^2 = tokens-per-ETH and the token's
 *  ETH price is its inverse. Both sides are 18 decimals — no scaling needed. */
export function v4PriceFromPackedSlot0(word: unknown): number {
  if (typeof word !== "string" || !word.startsWith("0x")) return 0;
  let sqrtP: bigint;
  try {
    sqrtP = BigInt(word) & ((1n << 160n) - 1n);
  } catch {
    return 0;
  }
  if (sqrtP === 0n) return 0;
  const ratio = Number(sqrtP) / 2 ** 96;
  const tokensPerEth = ratio * ratio;
  return tokensPerEth > 0 ? 1 / tokensPerEth : 0;
}

/** Minimal v4 PoolManager ABI: the Swap event (for activity/volume) and extsload (state reads). */
export const v4PoolManagerAbi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "amount0", type: "int128", indexed: false },
      { name: "amount1", type: "int128", indexed: false },
      { name: "sqrtPriceX96", type: "uint160", indexed: false },
      { name: "liquidity", type: "uint128", indexed: false },
      { name: "tick", type: "int24", indexed: false },
      { name: "fee", type: "uint24", indexed: false },
    ],
  },
  {
    type: "function",
    name: "extsload",
    stateMutability: "view",
    inputs: [{ name: "slot", type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export const coilSwapRouterAbi = [
  {
    type: "function",
    name: "swapExactInSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "interfaceFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * The v4 launch factory (CoilLaunchpad). `NEXT_PUBLIC_COIL_LAUNCHPAD` is the deployed address;
 * while unset the browser launch flow shows a "not live yet" state.
 */
export const COIL_LAUNCHPAD = ((process.env.NEXT_PUBLIC_COIL_LAUNCHPAD ?? "").trim() ||
  "0x0000000000000000000000000000000000000000") as Address;

export const LAUNCH_LIVE = isDeployed(COIL_LAUNCHPAD);

/**
 * The $COIL buyback & burn. `NEXT_PUBLIC_COIL_BURNER` is the deployed CoilBuybackBurner (it
 * receives every token's BURN fee slice as ETH and swaps it for $COIL to the dead address);
 * `NEXT_PUBLIC_COIL_TOKEN` is the official $COIL token, used to link the burn stats to its page.
 * While the burner is unset the burn ticker simply doesn't render.
 */
export const COIL_BURNER = ((process.env.NEXT_PUBLIC_COIL_BURNER ?? "").trim() ||
  "0x0000000000000000000000000000000000000000") as Address;
export const BURNER_LIVE = isDeployed(COIL_BURNER);

export const COIL_TOKEN = ((process.env.NEXT_PUBLIC_COIL_TOKEN ?? "").trim() ||
  "0x0000000000000000000000000000000000000000") as Address;

export const coilBurnerAbi = [
  { type: "function", name: "coil", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalEthSpent", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalCoilBurned", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "buybackAndBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "minCoilOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "burned", type: "uint256" }],
  },
] as const;

/** The BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA flag bits every CoilHook address encodes in its
 *  low 14 bits (0x88). A token launched by the CoilLaunchpad IS its hook, so this alone tells a
 *  Coil (v4) token from any other token — no RPC call needed. */
export const COIL_HOOK_FLAGS = 0x88n;
export const HOOK_FLAG_MASK = 0x3fffn; // low 14 bits

export function isCoilToken(token: Address): boolean {
  return (BigInt(token) & HOOK_FLAG_MASK) === COIL_HOOK_FLAGS;
}

/** Token addresses that must never surface anywhere on the site — listings, trending, search, the
 *  swap token picker, and their own /token/<address> page. Sourced from a hardcoded always-hidden
 *  list (internal/test tokens) plus NEXT_PUBLIC_HIDDEN_TOKENS (comma-separated). Case-insensitive.
 *  The tokens still exist on-chain; this only removes them from the UI. */
const ALWAYS_HIDDEN: string[] = [
  "0x14557a71a1851317949e99e1ba0e6cd51b9d0088", // MPC — internal test token
  "0x4a5ceb9d6b094c4bfb08c93cadebdf19d944c088", // COIL v1 — launched with the wrong price range; superseded by the relaunch
  "0xa1ef5c2d858d15f8e1bc30058ef9bac0f6924088", // COIL v2 — launched with a 1M supply (launchpad misconfig); superseded by the relaunch
];

const HIDDEN_TOKENS = new Set(
  [
    ...ALWAYS_HIDDEN,
    ...(process.env.NEXT_PUBLIC_HIDDEN_TOKENS ?? "").split(","),
  ]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isHiddenToken(address?: string): boolean {
  return !!address && HIDDEN_TOKENS.has(address.toLowerCase());
}

export const coilLaunchpadV4Abi = [
  {
    type: "function",
    name: "createTokenV4",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "salt", type: "bytes32" },
      { name: "creatorRewards", type: "bool" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "positionId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "hookInitCodeHash",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "creator", type: "address" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  { type: "function", name: "creationFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "marketsCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getMarkets",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "creator", type: "address" },
          { name: "creatorRewards", type: "bool" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "metadataURI", type: "string" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
  // Single-market lookups (auto-getters on `Market[] public markets` + `mapping public
  // marketIndexByToken`). Used to resolve a v4 token's /token/<address> page.
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "creator", type: "address" },
      { name: "creatorRewards", type: "bool" },
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "createdAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "marketIndexByToken",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }], // index + 1 (0 = unknown)
  },
] as const;

export type CoilMarket = {
  token: Address;
  creator: Address;
  creatorRewards: boolean;
  name: string;
  symbol: string;
  metadataURI: string;
  createdAt: bigint;
};

/** Minimal ABIs — only the entrypoints the frontend calls. The create functions
 *  appear twice: the 4-arg overload matches v1 launchpads, the 5-arg one (with the
 *  Loop/Creator rewards flag) matches v2+ — viem picks the overload by arg count. */
export const launchpadAbi = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "devBuy", type: "uint256" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
    ],
  },
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "devBuy", type: "uint256" },
      { name: "creatorFees", type: "bool" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
    ],
  },
  {
    type: "function",
    name: "createTokenV3",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "devBuy", type: "uint256" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "pool", type: "address" },
    ],
  },
  {
    type: "function",
    name: "createTokenV3",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "devBuy", type: "uint256" },
      { name: "creatorFees", type: "bool" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "pool", type: "address" },
    ],
  },
  {
    type: "function",
    name: "LAUNCHPAD_VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isCreatorFeeToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "isV3Token",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  { type: "function", name: "weth", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "feeLocker", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "creationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "params",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "totalSupply", type: "uint256" },
      { name: "virtualNative", type: "uint256" },
      { name: "devFeeBps", type: "uint256" },
      { name: "liqFeeBps", type: "uint256" },
      { name: "holderFeeBps", type: "uint256" },
      { name: "graduationTarget", type: "uint256" },
      { name: "maxBuyBps", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "feeRecipient",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "marketsCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "marketIndexByToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
      { name: "creator", type: "address" },
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "createdAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "TokenLaunched",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "curve", type: "address", indexed: false },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
    ],
  },
  {
    type: "function",
    name: "getMarkets",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "curve", type: "address" },
          { name: "creator", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "metadataURI", type: "string" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export const curveAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "minTokensOut", type: "uint256" }],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "uint256" },
      { name: "minNativeOut", type: "uint256" },
    ],
    outputs: [{ name: "nativeOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [{ name: "nativeIn", type: "uint256" }],
    outputs: [
      { name: "tokensOut", type: "uint256" },
      { name: "totalFee", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteSell",
    stateMutability: "view",
    inputs: [{ name: "tokenIn", type: "uint256" }],
    outputs: [
      { name: "nativeOut", type: "uint256" },
      { name: "totalFee", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "currentPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduationProgress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "graduated", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "pair", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "realNativeRaised",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduationTarget",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Trade",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "nativeAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "newPrice", type: "uint256", indexed: false },
    ],
  },
] as const;

/** The token itself pays dividends — holders claim by balance, no staking. */
export const tokenAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "claimableRewardOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalRewardsDistributed",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "metadataURI", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Minimal Uniswap-V2 router ABI for post-graduation DEX trades (fee-on-transfer
 *  aware — Coil tokens take a 1% tax on DEX trades, so standard swaps revert). */
export const routerAbi = [
  { type: "function", name: "WETH", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactETHForTokensSupportingFeeOnTransferTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "swapExactTokensForETHSupportingFeeOnTransferTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/** Uniswap V3 pool — price slot + Swap events for instant-V3 markets. */
export const v3PoolAbi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount0", type: "int256", indexed: false },
      { name: "amount1", type: "int256", indexed: false },
      { name: "sqrtPriceX96", type: "uint160", indexed: false },
      { name: "liquidity", type: "uint128", indexed: false },
      { name: "tick", type: "int24", indexed: false },
    ],
  },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

/** Uniswap SwapRouter02 — V3 swaps for instant-V3 tokens. exactInputSingle has no
 *  deadline field on router02; sells use multicall(swap -> unwrapWETH9) so the
 *  seller receives native ETH instead of WETH. */
export const swapRouter02Abi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "unwrapWETH9",
    stateMutability: "payable",
    inputs: [
      { name: "amountMinimum", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

/** FeeLocker — harvest a V3 position's accrued pool fees (permissionless). */
export const feeLockerAbi = [
  {
    type: "function",
    name: "holderShareBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "collect",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "ethSide", type: "uint256" },
      { name: "tokenSide", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "PositionLocked",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
    ],
  },
] as const;
