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

/** Developer wallet that receives the creation fee and per-trade dev fee. */
export const FEE_RECIPIENT =
  "0x1c06a7dE6951d62CbaD36FC449770BEE2d8c2b23" as Address;

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
] as const;
