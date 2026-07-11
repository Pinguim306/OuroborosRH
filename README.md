# 🐍 Ouroboros — Robinhood Chain Token Launchpad

**Trade → Fees → Liquidity → Rewards → Trade.** A launchpad where trading fees
don't leave the ecosystem — they become **permanent liquidity**, and holders
collect a share of them **proportional to how much and how long they hold**.

Ouroboros is a pump.fun-style launchpad for [Robinhood Chain](https://robinhood.com/us/en/chain/):
launch a token on a fair bonding curve, trade instantly, and graduate to a DEX
once the curve fills. The twist is the **loop** — the self-feeding flywheel that
turns every trade into deeper liquidity and loyalty rewards.

## The loop (what makes it different)

1. **Trade** — every buy/sell on the bonding curve charges a flat **1.5% fee**.
2. **Fees → Liquidity** — a portion is folded back into the curve as **permanent,
   locked liquidity**, deepening the market and lifting the floor.
3. **Liquidity → Rewards** — a portion streams straight into the token, pooled in
   the chain's native coin (ETH).
4. **Rewards → Holders** — **no staking.** The token is a dividend token: fees
   accrue to every holder automatically, proportional to balance. Connect your
   wallet and **claim anytime**. Hold longer and you're simply present for more
   inflows.

### Protocol fees
A small protocol fee (part of the 1.5% trade fee) and a fixed **creation fee**
(0.01 ETH by default) support the platform. The fee split and recipient are
owner-configurable (`setParams`, `setFeeRecipient`, `setCreationFee`); the exact
per-destination split lives on-chain in the contract.

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
