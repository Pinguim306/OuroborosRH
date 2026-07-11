/**
 * Centralized English copy. Everything user-facing lives here so the wording is
 * easy to tune without touching components. Written from scratch — distinct from
 * any reference launchpad.
 */
export const copy = {
  brand: "Ouroboros",
  tagline: "The launchpad where fees eat their own tail.",
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
      "Launch a token on a fair bonding curve in seconds. Trading fees don't leak to a treasury — they become permanent liquidity, and holders earn a share of them the longer and larger they hold.",
    ctaPrimary: "Launch a token",
    ctaSecondary: "Explore the market",
  },
  loop: {
    title: "The Ouroboros loop",
    subtitle: "A self-feeding flywheel. Four steps, no leaks.",
    steps: [
      {
        label: "Trade",
        text: "Buy and sell on a transparent bonding curve. A flat 1.5% fee on every trade.",
      },
      {
        label: "Fees → Liquidity",
        text: "Part of every fee is locked as permanent liquidity — deepening the market and lifting the floor.",
      },
      {
        label: "Liquidity → Rewards",
        text: "Another slice streams straight into the token, pooled in ETH, the chain's native coin.",
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
        title: "Fees become liquidity",
        text: "A share of every trading fee is folded back into the curve as permanent, locked liquidity. The market gets deeper with every swap — it can never be rug-pulled out.",
      },
      {
        title: "Paid on-chain, in ETH",
        text: "A dividend accumulator credits your fee share on every inflow and keeps it correct as balances move. No snapshots to game, no team switch to flip.",
      },
    ],
  },
  create: {
    title: "Launch your token",
    subtitle:
      "One transaction deploys your token, its bonding curve, and its rewards vault — all wired into the loop.",
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
    empty: "You're not holding any Ouroboros tokens yet. Buy one and fees start accruing to your wallet automatically.",
  },
  footer: {
    disclaimer:
      "Ouroboros is an unaudited reference protocol. Nothing here is financial advice. Trade responsibly.",
  },
} as const;
