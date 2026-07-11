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
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
      { name: "rewards", type: "address" },
    ],
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

export const rewardsAbi = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "earned",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "loyaltyMultiplier",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
