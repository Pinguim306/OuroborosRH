# 🐍 Ouroboros — Robinhood Chain Token Launchpad

**Trade → Fees → Liquidity → Rewards → Trade.** A launchpad where trading fees
don't leave the ecosystem — they become **permanent liquidity**, and holders
collect a share of them **proportional to how much and how long they hold**.

Ouroboros is a pump.fun-style launchpad for [Robinhood Chain](https://robinhood.com/us/en/chain/):
launch a token on a fair bonding curve, trade instantly, and graduate to a DEX
once the curve fills. The twist is the **loop** — the self-feeding flywheel that
turns every trade into deeper liquidity and loyalty rewards.

## The loop (what makes it different)

1. **Trade** — every buy/sell on the bonding curve charges a small fee (default 1%).
2. **Fees → Liquidity** — the fee is *not* skimmed to a treasury. It is converted
   into **permanent, locked liquidity**, deepening the market and lifting the floor.
3. **Liquidity → Rewards** — a stream of that fee inflow funds a per-token rewards
   vault paid in the chain's native coin.
4. **Rewards → Holders** — holders stake their tokens and earn from the vault via a
   Synthetix-style accumulator (amount × time), **boosted by a loyalty multiplier**
   that ramps from **1.0× to 3.0× over 90 days** of continuous staking. Hold more,
   hold longer, earn more.

## Monorepo layout

| Path         | What                                                                 |
|--------------|----------------------------------------------------------------------|
| `contracts/` | Foundry Solidity contracts (bonding curve, launchpad, holder rewards) — **reference, unaudited** |
| `web/`       | Next.js + TypeScript + Tailwind + wagmi/viem front-end               |

## Quick start

```bash
# Contracts
cd contracts
forge build
forge test -vvv

# Web app
cd web
npm install
npm run dev   # http://localhost:3000
```

The web app ships with a **mock-data layer**, so every page is fully browsable
before any contract is deployed. Once you deploy the contracts, drop the addresses
into `web/lib/contracts.ts` and the wagmi hooks read live on-chain state.

## ⚠️ Disclaimer

The contracts here are a **reference implementation and have NOT been audited**.
Do not deploy them with real funds without a professional security review.
