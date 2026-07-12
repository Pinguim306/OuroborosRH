import type { Address } from "./types";

/**
 * Deployed contract addresses. Fill these in after running the Foundry deploy
 * script (`forge script script/Deploy.s.sol`). While they're the zero address the
 * app runs entirely on the mock-data layer so every page stays browsable.
 */
export const CONTRACTS = {
  launchpad: (process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as Address,
};

export const isDeployed = (a: Address) =>
  a !== "0x0000000000000000000000000000000000000000";

export const LIVE = isDeployed(CONTRACTS.launchpad);

/** Minimal ABIs — only the entrypoints the frontend calls. */
export const launchpadAbi = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
    ],
  },
  {
    type: "function",
    name: "creationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
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
