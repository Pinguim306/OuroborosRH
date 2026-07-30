/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // wagmi/viem pull in optional wallet deps (React Native storage, loggers) that
  // aren't used on the web target — stub them so the build stays warning-free.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
  /**
   * Same-origin JSON-RPC relays, one per chain, so the BROWSER never talks to a third-party RPC
   * host directly. This is an ad-blocker countermeasure, not a convenience: crypto filter lists
   * block RPC providers by hostname (rpc.blockdaemon.mainnet.arc.io is on them — observed as
   * `blocked:other` in devtools, which on Arc silently removed the /create fee control, and on the
   * default chain would blank every market list). Ad-blockers do not touch same-origin fetches, so
   * the site's own domain is the one endpoint that is always reachable.
   *
   * The NEXT_PUBLIC_*RPC_URL env vars keep working — they now steer the relay's destination
   * (resolved here at build time) instead of the browser's target. Wallet writes are unaffected:
   * transactions go through the wallet's own RPC, not these transports.
   */
  rewrites: async () => [
    {
      source: "/rpc/robinhood",
      destination:
        (process.env.NEXT_PUBLIC_RPC_URL ?? "").trim() ||
        "https://rpc.mainnet.chain.robinhood.com",
    },
    {
      source: "/rpc/arc",
      destination:
        (process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "").trim() ||
        "https://rpc.blockdaemon.mainnet.arc.io",
    },
  ],
};

export default nextConfig;
