import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChain } from "./chain";

/**
 * wagmi config. EIP-6963 multi-injected discovery (on by default) surfaces every
 * installed browser wallet — MetaMask, Rabby, Trust, etc. — as its own connector,
 * so the user can pick which one to connect. The generic `injected()` is kept as a
 * fallback for wallets that don't announce themselves via EIP-6963. No external
 * WalletConnect dependency / projectId needed.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: {
    [robinhoodChain.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
