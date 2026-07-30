import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcChain, robinhoodChain, SUPPORTED_CHAINS } from "./chain";

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
 *
 * The transports point at the site's own /rpc/<chain> relays (see next.config.mjs), NOT at the
 * upstream RPC hosts, because ad-blockers running crypto filter lists block those hosts by name
 * and a blocked read silently degrades the UI — on Arc it removed the /create fee control. A
 * same-origin path is the one thing a content blocker never cuts. Only these browser transports
 * change: the server's clients (lib/server/rpc.ts) keep their absolute URLs, and the chain
 * definitions keep real RPCs so a wallet's "add network" prompt receives a usable endpoint.
 */
export const wagmiConfig = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: {
    [robinhoodChain.id]: http("/rpc/robinhood"),
    [arcChain.id]: http("/rpc/arc"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
