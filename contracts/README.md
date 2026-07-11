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
| `src/Launchpad.sol` | Factory. `createToken()` (payable — charges the creation fee) deploys token + curve, wired together. Holds `feeRecipient` (developer) + `creationFee`, both owner-configurable. |
| `src/BondingCurve.sol` | Constant-product virtual-reserve curve. `buy`/`sell` with a 3-way fee split: developer / permanent liquidity / holders. Graduates at a native-raised target. |
| `src/OuroToken.sol` | **Dividend token.** Holders earn a share of trading fees (native coin) **just by holding — no staking** — and `claim()` anytime. Dividend-paying-token accumulator with per-transfer corrections and address exclusions (the curve is excluded). |
| `src/interfaces/` | `IERC20`, `IDexRouter` (graduation target interface). |
| `src/utils/` | Minimal `ERC20` (with a virtual `_update` hook), `Ownable`, `ReentrancyGuard` (no external deps). |

## Fee model (defaults, all configurable)

Per-trade fee **1.5%**, as basis points of trade volume:
`devFeeBps = 50` (0.5% → developer), `liqFeeBps = 60` (0.6% → permanent liquidity),
`holderFeeBps = 40` (0.4% → holders). Plus a fixed **creation fee** in native coin
charged on every launch (set it to ≈$10–20 for the current native price; adjust via
`setCreationFee`). The developer wallet is `feeRecipient` (`setFeeRecipient`).

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
export PRIVATE_KEY=0x...
export RPC=https://rpc.robinhood-chain...   # Robinhood Chain RPC
forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
```

The deploy script sets `feeRecipient` to the developer wallet
`0x1c06a7dE6951d62CbaD36FC449770BEE2d8c2b23` and a creation fee of `0.006` native
(≈$15 near $2.5k native). Copy the printed `Launchpad` address into
`web/lib/contracts.ts` (or `NEXT_PUBLIC_LAUNCHPAD_ADDRESS`).
