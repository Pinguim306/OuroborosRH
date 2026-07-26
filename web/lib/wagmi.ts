import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcChain, arcTestnet, robinhoodChain, SUPPORTED_CHAINS } from "./chain";

/**
 * wagmi config. EIP-6963 multi-injected discovery (on by default) surfaces every
 * installed browser wallet — MetaMask, Rabby, Trust, etc. — as its own connector,
 * so the user can pick which one to connect. The generic `injected()` is kept as a
 * fallback for wallets that don't announce themselves via EIP-6963. No external
 * WalletConnect dependency / projectId needed.
 *
 * Every registered chain gets a transport, so `useReadContract({ chainId })` can address any of
 * them. Robinhood Chain stays FIRST — it's wagmi's fallback chain and the one every write is still
 * pinned to, so nothing about the default flow changes.
 */
export const wagmiConfig = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: {
    [robinhoodChain.id]: http(),
    [arcChain.id]: http(),
    [arcTestnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
