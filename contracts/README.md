# Ouroboros Contracts

Reference Solidity for the Ouroboros launchpad — **unaudited**. The loop:

```
              buy / sell (1.5% fee)
   ┌──────────────────────────────────┐
   │                                  ▼
Holders  ◄── claim (native) ──  OuroToken (dividend token)
   ▲                                  ▲
   │                                  │ 0.4% holders
   └────────── just hold ──────  BondingCurve ──► 0.6% permanent liquidity
                                      │
                                      └──────────► 0.5% developer wallet
                                                   + fixed creation fee at launch
```

## Contracts

| File | Role |
|------|------|
| `src/Launchpad.sol` | Factory. `createToken(name, symbol, metadataURI, devBuy)` (payable — charges the creation fee) deploys token + curve, wired together. An optional `devBuy` lets the creator buy their own launch in the same transaction (capped at the `maxBuyBps` anti-whale limit). Holds `feeRecipient` + `creationFee`, both owner-configurable. |
| `src/BondingCurve.sol` | Constant-product virtual-reserve curve. `buy`/`buyFor`/`sell` with a 3-way fee split: liquidity / holders / platform. `buyFor` delivers to a recipient (used for the creator's dev buy). At the graduation target it **migrates all remaining tokens + real ETH into a Uniswap-V2 pair, burns the LP** (permanent liquidity), and locks the curve. Migration is grief-resistant: if the pair was pre-created at a skewed ratio, the router's ETH refund is accepted and swept to holders as rewards, and leftover tokens are burned (excluded from dividends) — a pre-seeded pair can't brick or strand the launch. |
| `src/OuroToken.sol` | **Dividend token.** Holders earn a share of trading fees (native coin) **just by holding — no staking** — and `claim()` anytime. Dividend-paying-token accumulator with per-transfer corrections and address exclusions (the curve is excluded). |
| `src/interfaces/` | `IERC20`, `IDexRouter` (graduation target interface). |
| `src/utils/` | Minimal `ERC20` (with a virtual `_update` hook), `Ownable`, `ReentrancyGuard` (no external deps). |

## Fee model

Per-trade fee **1.5%**, split three ways between permanent liquidity, holder
rewards, and a platform fee. Plus a fixed **creation fee** in the native coin (ETH)
charged on every launch — `0.01 ETH` by default.

Launch defaults also include a **graduation target of 4 ETH** raised and an
**anti-whale max buy of 2% of supply per transaction** during the curve
(`maxBuyBps = 200`; set 0 to disable). All configurable via `setParams`.

The exact per-destination split (`devFeeBps` / `liqFeeBps` / `holderFeeBps`) and the
fee recipient are set at deploy time (see `script/Deploy.s.sol`) and are
owner-configurable on-chain via `setParams`, `setFeeRecipient`, and
`setCreationFee`.

## Build & test

```bash
forge build
forge test -vvv
```

### About dependencies
The contracts are **dependency-free** so they build in a clean environment.
`contracts/lib/forge-std/` is a **minimal vendored shim** of forge-std covering only
the cheatcodes/asserts the tests use. To swap in the real thing:

```bash
rm -rf lib/forge-std && forge install foundry-rs/forge-std
```

If `forge` isn't installed: `curl -L https://foundry.paradigm.xyz | bash && foundryup`.

The dividend accounting is also cross-checked by a standalone JS simulation (equal
split, proportional-to-balance, transfer moves future rewards, pending flush,
exclusions); every expectation in `test/OuroToken.t.sol` was verified against it.

## Deploy

```bash
export PRIVATE_KEY=0x...                              # a funded deployer key
export FEE_RECIPIENT=0x...                            # wallet that collects fees
export DEX_ROUTER=0x...                               # Uniswap V2 router on Robinhood Chain
export RPC=https://rpc.mainnet.chain.robinhood.com    # Robinhood Chain (id 4663)
forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
```

> The router **must** be set before any curve reaches graduation (migration calls
> it). Find the Uniswap V2 router for Robinhood Chain on the Uniswap deployments
> page; it's also updatable later via `Launchpad.setRouter`.

> Tip: deploy to the **testnet first** (faucet at
> `faucet.testnet.chain.robinhood.com`) — these contracts are unaudited.

The deploy script reads `FEE_RECIPIENT` from the environment (falling back to the
deployer) and sets a creation fee of `0.01 ETH`. Copy the printed `Launchpad`
address into `web/lib/contracts.ts` (or `NEXT_PUBLIC_LAUNCHPAD_ADDRESS`).
