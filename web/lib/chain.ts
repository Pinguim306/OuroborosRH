import { defineChain } from "viem";

/**
 * Robinhood Chain mainnet — an Arbitrum L2 with ETH as the native gas token.
 * Source: chainlist.org/chain/4663 and docs.robinhood.com/chain.
 * For the testnet, swap in its chain id + RPC (faucet at
 * faucet.testnet.chain.robinhood.com) — recommended for first deploys.
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
  testnet: false,
});

/** The native coin ticker shown throughout the UI. */
export const NATIVE_SYMBOL = robinhoodChain.nativeCurrency.symbol;
