import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChain } from "./chain";

/**
 * wagmi config. Uses the injected connector (MetaMask / browser wallets) so there's
 * no external WalletConnect dependency or projectId to configure. Add more connectors
 * here as needed.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
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
