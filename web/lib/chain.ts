import { defineChain } from "viem";

/**
 * Robinhood Chain network config. Values are placeholders where public constants
 * are not yet finalized — update `id`, `rpcUrls`, and `blockExplorers` for the
 * network you deploy to (testnet or mainnet).
 */
export const robinhoodChain = defineChain({
  id: 42070,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.robinhoodchain.example"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://explorer.robinhoodchain.example" },
  },
  testnet: false,
});

/** The native coin ticker shown throughout the UI. */
export const NATIVE_SYMBOL = robinhoodChain.nativeCurrency.symbol;
