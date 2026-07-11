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
