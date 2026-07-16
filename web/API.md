# Ouroboros Launchpad Trade API (v1)

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

## Conventions

- **Uniswap-v4 tokens** (`market.mode === "v4"`): they trade through the CoilSwapRouter, not a
  bonding curve. Quotes are simulated from your own funded address (`from` is required on
  `/quote`, `/tx/buy` and `/tx/sell`); sells approve the **router** (returned as `spender`).
- All on-chain amounts (in and out) are **integer wei strings** (e.g. `"1000000000000000000"` = 1 ETH).
- Responses are JSON with an `ok` boolean. Errors: `{ "ok": false, "error": "..." }`.
- Before contracts are deployed the read endpoints return demo data flagged with
  `"demo": true`; the `tx/*` endpoints return `503`.

## Endpoints

### `GET /api/v1`
Service index (chain id, native symbol, endpoint list).

### `GET /api/v1/markets?limit=50`
List markets with live stats (price, marketcap, supply, graduation progress, …).

### `GET /api/v1/markets/{token}`
A single market by token address.

### `GET /api/v1/quote?token=0x..&side=buy|sell&amount=<wei>`
- `side=buy`: `amount` is native (wei) in → `{ tokensOut, fee }`
- `side=sell`: `amount` is token (wei) in → `{ nativeOut, fee }`

Returns `409` if the token has graduated (trade the DEX pair instead).

### `POST /api/v1/tx/buy`
```json
{ "token": "0x..", "amount": "<nativeWei>", "slippageBps": 500, "minTokensOut": "optional" }
```
→ `{ quote, minTokensOut, transaction: { chainId, to, data, value } }`

### `POST /api/v1/tx/sell`
```json
{ "token": "0x..", "amount": "<tokenWei>", "from": "0x..(optional)", "slippageBps": 500, "minNativeOut": "optional" }
```
→ `{ quote, minNativeOut, needsApproval, approval, transaction }`

When `from` is supplied and its allowance is insufficient, `approval` is an unsigned
approve tx to sign and mine **before** `transaction`.

### `POST /api/v1/tx/approve`
```json
{ "token": "0x..", "amount": "optional (defaults to unlimited)" }
```
→ `{ spender, transaction }`

## Bot flow

1. `GET /markets` to discover tokens.
2. `GET /quote` to preview a trade.
3. `POST /tx/buy` (or `/tx/sell`) to get an unsigned tx.
4. Sign with the bot's key and broadcast to the chain RPC.
5. For sells, submit `approval` first if `needsApproval` is true.

## Config

| Env var | Purpose |
|---------|---------|
| `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` | Deployed launchpad address (enables live mode). |
| `RH_RPC_URL` | Optional RPC override (defaults to the Robinhood Chain public RPC). |
| `LAUNCHPAD_API_KEY` | Optional API key; when set, required on every request. |
