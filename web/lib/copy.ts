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
        text: "Buy and sell on a transparent bonding curve. A flat 1% fee on every trade.",
      },
      {
        label: "Fees → Liquidity",
        text: "The majority of every fee is locked as permanent liquidity — deepening the market and lifting the floor.",
      },
      {
        label: "Liquidity → Rewards",
        text: "The rest streams into a rewards vault, paid in RH, the chain's native coin.",
      },
      {
        label: "Rewards → Holders",
        text: "Stake your tokens and collect fees weighted by amount × time, boosted up to 3× for loyalty.",
      },
    ],
  },
  differentiator: {
    title: "Hold more. Hold longer. Earn more.",
    points: [
      {
        title: "Fees become liquidity",
        text: "60% of every trading fee is folded back into the curve as permanent, locked liquidity. The market gets deeper with every swap — it can never be rug-pulled out.",
      },
      {
        title: "Loyalty multiplier",
        text: "Your reward weight ramps from 1.0× to 3.0× over 90 days of continuous staking. Diamond hands are paid for their patience.",
      },
      {
        title: "Amount × time, on-chain",
        text: "A Synthetix-style accumulator splits fees by your staked share across every inflow. No snapshots to game, no team switch to flip.",
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
    stake: "Stake",
    unstake: "Unstake",
    claim: "Claim rewards",
    graduated: "Graduated to DEX",
    progress: "Bonding curve progress",
  },
  rewards: {
    title: "Your rewards",
    subtitle:
      "Fees you've earned across every token you hold, weighted by how much and how long you've staked.",
    claimAll: "Claim all",
    empty: "You're not staking anything yet. Buy a token and stake it to start earning.",
  },
  footer: {
    disclaimer:
      "Ouroboros is an unaudited reference protocol. Nothing here is financial advice. Trade responsibly.",
  },
} as const;
