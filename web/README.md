# Ouroboros Web

Next.js (App Router) + TypeScript + Tailwind + wagmi/viem front-end for the
Ouroboros launchpad.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

## Pages
- `/` — hero, the loop explainer, stats, and the token market (trending / new / graduating).
- `/create` — launch a token with a live preview.
- `/token/[address]` — trade widget, loyalty-rewards panel, bonding-curve progress, trades, holders.
- `/rewards` — your portfolio of staked positions and claimable fees.

## Mock vs live
Everything renders from `lib/mock/data.ts` out of the box, so the whole app is
browsable with no chain. To go live:

1. Deploy the contracts (see `../contracts`).
2. Set `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` in `.env.local` (see `.env.example`).
3. Update the Robinhood Chain `id` / RPC / explorer in `lib/chain.ts`.

The write paths in `TradeWidget`, `RewardsPanel`, and `create` are marked with the
exact wagmi `useWriteContract` calls to swap in; ABIs live in `lib/contracts.ts`.

## Wallet
Uses wagmi's injected connector (MetaMask / browser wallets) — no WalletConnect
projectId required. The connect button lives in `components/WalletButton.tsx`.
