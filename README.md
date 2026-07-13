# 🐍 Ouroboros — Robinhood Chain Token Launchpad

**Trade → Fees → Liquidity → Rewards → Trade.** A launchpad where trading fees
don't leave the ecosystem — they become **permanent liquidity**, and holders
collect a share of them **just by holding**. Live at
[ouroborosrh.fun](https://ouroborosrh.fun/).

Ouroboros is a pump.fun-style launchpad for [Robinhood Chain](https://robinhood.com/us/en/chain/)
with **two launch modes**, picked on the Launch page:

| | 🌀 Bonding curve | ⚡ Instant V3 pool |
|---|---|---|
| Market | constant-product curve | Uniswap V3 pool, live the second the tx confirms |
| Trade fee | 1.5% (split: protocol / liquidity / holders) | 1% pool fee tier |
| Anti-whale | 2% max buy per tx | none (no V3 hook for it) |
| Graduation | at 4 ETH raised → Uniswap V2 pair, LP **burned** | n/a — born on the DEX |
| Post-DEX fee | 1% trade tax on the pair (capped 2%) → protocol | 1% pool fee, harvested |
| Liquidity | permanent (curve, then burned LP) | entire supply locked forever in the **FeeLocker** |
| Chart | on-chain candles, DexScreener after graduation | DexScreener from trade one |
| Dev buy | same tx, capped at 2% | pool's first swap — un-front-runnable |

## Holder rewards — no staking

Every token is a **dividend token**: rewards accrue automatically, proportional
to balance; connect a wallet and **claim anytime**.

- **Curve mode:** a slice of every trade fee streams into the token as ETH.
- **V3 mode:** the pool's 1% fee accrues in the locked position; a
  **permissionless Harvest** (button on the token page) collects it — the split
  is enforced on-chain (40% of the ETH side to holders, the rest + token side to
  the protocol; the caller gets nothing). With zero holders, the holder share
  waits as `pendingRewards` for the next buyer — it can never be drained.

At launch the creator picks a **rewards mode**, immutable forever
(`LAUNCHPAD_VERSION ≥ 2`; the site auto-detects and hides the option on v1
deployments):

- 🐍 **Loop Rewards** — the fee share streams to every holder (the classic loop);
- 👑 **Creator Rewards** — that same share is paid to the creator's wallet
  instead. Such tokens are badged on their page and accrue nothing to holders.

## Ouroboros Points (Season 1)

A reputation score computed **entirely from public on-chain events** — no
signup, no snapshots, verifiable by anyone (`/points`): 1,000 pts / ETH traded,
500 pts per launch, 100 pts / ETH of volume your tokens generate, 250 pts for
being one of a token's first 10 buyers, 2,000 pts per graduation. Volume only
counts on tokens ≥ 3 distinct wallets have traded (anti-wash). Points carry no
guaranteed monetary value or future entitlement.

## The FeeLocker

V3 position NFTs live in a locker with **no owner and a single value-moving
function**: `collect()`. The principal liquidity can never be withdrawn —
un-ruggable by construction, while fees stay harvestable.

## Monorepo layout

| Path         | What |
|--------------|------|
| `contracts/` | Foundry contracts — Launchpad (both modes), BondingCurve, OuroToken (dividends + post-grad tax), FeeLocker — **reference, unaudited** |
| `web/`       | Next.js + TypeScript + Tailwind + wagmi/viem front-end (Discover, launch, trading both modes, rewards + trading PnL, **Ouroboros Points**, leaderboard, live feed, docs/terms) |
| `web/API.md` | Public REST trade API (`/api/v1/*`) for bots — non-custodial, returns unsigned txs |

## Quick start

```bash
# Contracts
cd contracts
forge test -vvv                                     # unit suite
forge test -vvv --fork-url $ROBINHOOD_RPC           # REQUIRED before deploying (V3 math)
forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_RPC --broadcast

# Web
cd web && npm install && npm run dev
```

Deploy env (`contracts/.env`): `PRIVATE_KEY`, `FEE_RECIPIENT`, `DEX_ROUTER`
(V2 router), optional `V3_POSITION_MANAGER` / `V3_SWAP_ROUTER` (Robinhood Chain
defaults built in). The script prints the **Launchpad** and **FeeLocker**
addresses and configures V3 pricing (`setV3Config`, owner-updatable later).
The web app ships with a mock-data layer, so every page is browsable before any
contract is deployed.

### Web environment (Vercel)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` | Comma-separated: **first = primary** (new launches), rest = legacy launchpads still listed |
| `PINATA_JWT` | IPFS uploads (token image + metadata JSON with description/socials) — secret |
| `NEXT_PUBLIC_X_URL` | X/Twitter button in the footer |
| `NEXT_PUBLIC_HIDDEN_TOKENS` | Comma-separated token addresses hidden from listings |
| `LAUNCHPAD_API_KEY` | Optional auth for the public trade API |
| `TELEGRAM_BOT_TOKEN` | @BotFather bot token — enables auto-announcing every launch to a Telegram channel (secret) |
| `TELEGRAM_CHAT_ID` | Channel to announce in (`@channelname` or `-100…`); the bot must be a channel admin |
| `NEXT_PUBLIC_SITE_URL` | Public site origin used in announcement links (default `https://ouroborosrh.fun`) |

## ⚠️ Disclaimer

The contracts are a **reference implementation and have NOT been audited** — do
not commit funds you can't lose. Dividend authority is renounced after setup (no
one can freeze rewards); the trade tax is immutable and hard-capped at 2%; the
FeeLocker has no admin. Run the fork tests before any deploy.

*Not affiliated with Robinhood Markets, Inc.*
