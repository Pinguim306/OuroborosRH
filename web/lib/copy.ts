/**
 * Centralized English copy. Everything user-facing lives here so the wording is
 * easy to tune without touching components. Written from scratch — distinct from
 * any reference launchpad.
 */
export const copy = {
  brand: "Coil",
  tagline: "The launchpad where every trade winds the coil.",
  // Official Coil social handles (no @). Used for the sidebar/site links.
  social: {
    x: "coiltrading",
  },
  nav: {
    explore: "Explore",
    create: "Launch",
    rewards: "Rewards",
    docs: "How it works",
  },
  hero: {
    kicker: "Robinhood Chain · Fair-launch protocol",
    title: "Every trade feeds the loop.",
    subtitle:
      "Launch a token straight into a Uniswap v4 pool — tradable the second the tx confirms, with the entire supply locked as liquidity forever. A native per-swap fee is split on-chain every trade: holders earn a share just by holding, and a slice buys and burns $COIL.",
    ctaPrimary: "Launch a token",
    ctaSecondary: "Explore the market",
  },
  loop: {
    title: "The Coil loop",
    subtitle: "A self-feeding flywheel. Four steps, no leaks.",
    steps: [
      {
        label: "Trade",
        text: "Buy and sell on a live Uniswap v4 pool from second one. Every swap pays a small native fee, taken by the hook inside the trade — not a fee-on-transfer, so aggregators and bots route it fine.",
      },
      {
        label: "Locked liquidity",
        text: "The entire supply is minted as the pool's liquidity, owned by the hook itself, which renounces ownership at launch — locked forever and un-ruggable by construction.",
      },
      {
        label: "Fees → Split",
        text: "The per-swap fee is split on-chain the instant it's taken: holders, the protocol, and a burn slice that buys and burns $COIL. No harvest button — it happens on every trade.",
      },
      {
        label: "Rewards → Holders",
        text: "Just hold the token. Your share of the fees accrues automatically — connect your wallet and claim anytime. No staking.",
      },
    ],
  },
  differentiator: {
    title: "Hold the token. Claim the fees. That's it.",
    points: [
      {
        title: "No staking — just hold",
        text: "Rewards accrue to your wallet automatically, proportional to your balance. Nothing to lock, nothing to unstake — connect and claim whenever you want. Hold longer and you're simply present for more fee inflows.",
      },
      {
        title: "Liquidity locked forever",
        text: "The entire supply is minted into the Uniswap v4 pool and the position is owned by the hook, which renounces ownership at launch. There is no withdraw function — the market can never be rug-pulled out.",
      },
      {
        title: "Paid on-chain, in ETH",
        text: "A dividend accumulator credits your fee share on every swap and keeps it correct as balances move. No snapshots to game, no team switch to flip.",
      },
    ],
  },
  create: {
    title: "Launch your token",
    subtitle:
      "One transaction deploys your token straight into a live Uniswap v4 pool — tradable instantly, liquidity locked forever, all wired into the loop.",
    fields: {
      name: "Token name",
      symbol: "Ticker",
      description: "Description",
      image: "Image (emoji or URL)",
      x: "X / Twitter",
      telegram: "Telegram",
      website: "Website",
    },
    submit: "Deploy to the loop",
    submitting: "Deploying…",
  },
  token: {
    buy: "Buy",
    sell: "Sell",
    claim: "Claim rewards",
    graduated: "Graduated to DEX",
    progress: "Bonding curve progress",
  },
  rewards: {
    title: "Your rewards",
    subtitle:
      "Fees you've earned across every token you hold — accrued automatically, no staking. Connect and claim.",
    claimAll: "Claim all",
    empty: "You're not holding any Coil tokens yet. Buy one and fees start accruing to your wallet automatically.",
  },
  footer: {
    docs: "Docs",
    terms: "Terms",
    disclaimer:
      "Coil is an unaudited reference protocol. Nothing here is financial advice. Trade responsibly.",
  },
} as const;
