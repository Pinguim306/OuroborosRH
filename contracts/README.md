# Ouroboros Contracts

Reference Solidity for the Ouroboros launchpad — **unaudited**. The loop:

```
        buy / sell
   ┌───────────────────┐
   │                   ▼
Holders            BondingCurve ──fee──► (60%) permanent liquidity
   ▲                   │                 (40%) ─┐
   │                   │                        ▼
   └──── claim ──── HolderRewards ◄── native stream (amount × time + loyalty boost)
```

## Contracts

| File | Role |
|------|------|
| `src/Launchpad.sol` | Factory. `createToken()` deploys token + curve + rewards, wired together. Holds a registry for the frontend. |
| `src/BondingCurve.sol` | Constant-product virtual-reserve curve. `buy`/`sell` with fee; splits the fee into permanent liquidity + a reward stream; graduates at a native-raised target. |
| `src/HolderRewards.sol` | Synthetix-style reward accumulator (amount × time) plus a **loyalty multiplier** that ramps 1.0×→3.0× over 90 days of continuous staking (reset on withdraw). `stake`/`withdraw`/`claim`/`poke`. |
| `src/OuroToken.sol` | Fixed-supply ERC20 minted once to the curve. |
| `src/interfaces/` | `IERC20`, `IDexRouter` (graduation target interface). |
| `src/utils/` | Minimal `ERC20`, `Ownable`, `ReentrancyGuard` (no external deps). |

## Build & test

```bash
forge build
forge test -vvv
```

### About dependencies
The contracts are intentionally **dependency-free** so they build in a clean
environment. `contracts/lib/forge-std/` is a **minimal vendored shim** of forge-std
covering only the cheatcodes/asserts the tests use. To swap in the real thing:

```bash
rm -rf lib/forge-std && forge install foundry-rs/forge-std
```

If `forge` isn't installed: `curl -L https://foundry.paradigm.xyz | bash && foundryup`.

The full accounting is also cross-checked by a standalone JS simulation kept in the
PR notes; every reward-split expectation in `test/HolderRewards.t.sol` was verified
against it.

## Deploy

```bash
export PRIVATE_KEY=0x...
export RPC=https://rpc.robinhood-chain...   # Robinhood Chain RPC
forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
```

Then copy the printed `Launchpad` address into `web/lib/contracts.ts`.

Default params (`script/Deploy.s.sol`): 1B supply, 30 native virtual seed, 1% fee,
60% of the fee → liquidity, graduate at 400 native raised. Tune in `Launchpad.setParams`.
