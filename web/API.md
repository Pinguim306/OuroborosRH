# Coil Launchpad Trade API (v1)

A small REST API for integrating bonding-curve trading into external clients —
built for **Telegram trade bots**. It runs as Next.js route handlers under
`/api/v1/*`, so it deploys with the web app (no separate service).

**The API is non-custodial.** It reads on-chain state and *builds unsigned
transactions*; the bot signs and broadcasts them with its own keys. The API never
holds keys or signs anything.

## Auth

If the `LAUNCHPAD_API_KEY` env var is set, every request must send it:

```
Authorization: Bearer <key>
# or
x-api-key: <key>
```

If it is unset, the API is open (local/demo). **Set a key before pointing bots at
production.**

## Chains

Coil is multi-chain, and **every endpoint takes an optional chain selector**:

| | |
|---|---|
| GET endpoints | `?chain=<id>` |
| POST endpoints | `"chain": <id>` in the JSON body |

**Omitting it means the default chain (`4663`, Robinhood Chain)** — exactly what the API did
before it was multi-chain, so an existing integration needs no changes at all.

`GET /api/v1` lists every chain this deployment serves, each with its `chainId`, `nativeSymbol`
and whether Coil is `live` there. An **unknown** chain id is rejected with `400` rather than
falling back to the default: a bot asking for a chain we don't serve has a bug, and answering it
with another chain's prices is the worst way to find that out.

Two things follow from this and are worth stating plainly:

- **Amounts are always in the target chain's native gas coin.** That is ETH on Robinhood Chain and
  **USDC on Arc** — the field names still say `native`/`nativeOut`, but the unit follows the chain.
  Arc's native USDC is scaled to 18 decimals on-chain, so wei math is identical on both.
- **Broadcast each transaction on the `chainId` it carries.** Every `transaction` and `approval`
  object states its own chain; the addresses inside are only valid there.

```bash
# default chain — unchanged from v1 day one
curl "$BASE/api/v1/markets?limit=5"

# the same call against Arc
curl "$BASE/api/v1/markets?limit=5&chain=5042"

curl -X POST "$BASE/api/v1/tx/buy" -H 'content-type: application/json' \
  -d '{"token":"0x…","amount":"1000000000000000","chain":5042,"from":"0x…"}'
```

## Conventions

- **Uniswap-v4 tokens** (`market.mode === "v4"`): they trade through the CoilSwapRouter, not a
  bonding curve. Quotes are simulated from your own funded address (`from` is required on
  `/quote`, `/tx/buy` and `/tx/sell`); sells approve the **router** (returned as `spender`).
- All on-chain amounts (in and out) are **integer wei strings** (e.g. `"1000000000000000000"` = 1 ETH).
- Responses are JSON with an `ok` boolean. Errors: `{ "ok": false, "error": "..." }`.
- Before contracts are deployed **on the requested chain**, the read endpoints return demo data
  flagged with `"demo": true`; the `tx/*` endpoints return `503` with the `chainId` that isn't
  deployed.
- Every response echoes the `chainId` it was served from, and every market carries its own
  `chainId`. A token address alone is not unique across chains — hook-flag mining makes the same
  address on two chains a deliberate possibility — so **key any cache or position by
  `(chainId, token)`**, never by the address alone.

## Endpoints

### `GET /api/v1`
Service index: default chain, native symbol, the `chains` this deployment serves, and the
endpoint list.

### `GET /api/v1/markets?limit=50&chain=<id>`
List markets with live stats (price, marketcap, supply, graduation progress, …).

### `GET /api/v1/markets/{token}?chain=<id>`
A single market by token address.

### `GET /api/v1/quote?token=0x..&side=buy|sell&amount=<wei>&chain=<id>`
- `side=buy`: `amount` is native (wei) in → `{ tokensOut, fee }`
- `side=sell`: `amount` is token (wei) in → `{ nativeOut, fee }`

Returns `409` if the token has graduated (trade the DEX pair instead).

### `POST /api/v1/tx/buy`
```json
{ "token": "0x..", "amount": "<nativeWei>", "chain": 4663, "slippageBps": 500, "minTokensOut": "optional" }
```
→ `{ quote, minTokensOut, transaction: { chainId, to, data, value } }`

### `POST /api/v1/tx/sell`
```json
{ "token": "0x..", "amount": "<tokenWei>", "chain": 4663, "from": "0x..(optional)", "slippageBps": 500, "minNativeOut": "optional" }
```
→ `{ quote, minNativeOut, needsApproval, approval, transaction }`

When `from` is supplied and its allowance is insufficient, `approval` is an unsigned
approve tx to sign and mine **before** `transaction`.

### `POST /api/v1/tx/approve`
```json
{ "token": "0x..", "chain": 4663, "amount": "optional (defaults to unlimited)" }
```
→ `{ spender, transaction }`

## Bot flow

1. `GET /api/v1` once, to learn which chains this deployment serves.
2. `GET /markets` (per chain) to discover tokens.
3. `GET /quote` to preview a trade.
4. `POST /tx/buy` (or `/tx/sell`) to get an unsigned tx.
5. Sign with the bot's key and broadcast to **the RPC of the `chainId` on the transaction**.
6. For sells, submit `approval` first if `needsApproval` is true.

## Config

| Env var | Purpose |
|---------|---------|
| `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` | Curve launchpad on the default chain (enables live mode there). |
| `NEXT_PUBLIC_COIL_LAUNCHPAD` | v4 launchpad on the default chain. |
| `NEXT_PUBLIC_ARC_COIL_LAUNCHPAD` | v4 launchpad on Arc. Chain-prefixed; same pattern for every non-default chain. |
| `RH_RPC_URL` | Optional server-side RPC override for the default chain. |
| `ARC_RPC_URL` | Optional server-side RPC override for Arc. |
| `LAUNCHPAD_API_KEY` | Optional API key; when set, required on every request. |

A chain with no launchpad configured is still listed by `GET /api/v1`, with `live: false` — reads
return demo data and `tx/*` returns `503`, so a bot can detect the state rather than guess at it.
