# contracts-v4 — o motor de lucro do Coil em Uniswap v4

Módulo v4 do Coil (a evolução do launchpad v3 deste repositório). Isolado num projeto Foundry
próprio porque usa solc 0.8.26 + o stack Uniswap v4 (`v4-core`, `v4-periphery`, `permit2`,
`solady`), enquanto os contratos v3 em `../contracts` usam 0.8.24 + utils próprios. Os dois
convivem — tokens v3 antigos seguem funcionando; lançamentos novos saem em v4.

## Por que v4 (vs. o fluxo v3 que ele substitui)

| v3 (bonding curve / instant-V3) | v4 (`CoilHook` + `CoilLaunchpad`) |
| --- | --- |
| Captura de volume via `FeeLocker.collect()` **manual** + `postGradTaxBps` (fee-on-transfer) | Taxa cobrada **dentro do swap** (`beforeSwap` + `beforeSwapReturnDelta`) |
| Fee-on-transfer **quebra** em muitos routers/agregadores | Limpo — funciona com Uniswap, 1inch, agregadores, bots |
| Precisa de botão de harvest | **Automático** — a taxa sai a cada trade |
| `FeeLocker` guarda a posição | O **hook é dono** e trava a liquidez no `seed()`, e renuncia ownership |

## A cascata (1% do swap, dividido on-chain)

```
Swap  →  1% sobre o input (ETH nas compras, token nas vendas)  →  no hook:
    ├─ 0,50%  PROTOCOLO  → feeRecipient (carteira do protocolo)   ← lucro por volume
    ├─ 0,30%  HOLDERS    → dividendos pro-rata por saldo (Loop) OU pro criador (Creator)
    └─ 0,20%  BURN       → platformTreasury (buy&burn do COIL)
```

`POOL_FEE = 0` → o trader nunca paga taxa dupla. Config imutável por token (teto de 5%).
Dois modos fixados no launch: **Loop Rewards** (`creator = 0`, dividendo pra todos os holders) e
**Creator Rewards** (`creator != 0`, a fatia de holders vai pro criador via `sweepCreator()`).

## Contratos

- `src/CoilHook.sol` — o token v4: É o ERC-20, o dono da liquidez e o roteador de taxa nativa.
- `src/CoilLaunchpad.sol` — a fábrica: `createTokenV4()` deploya o hook num endereço CREATE2
  minerado, chama `seed()` (pool + liquidez de um lado + renúncia) e registra o market.
  `LAUNCHPAD_VERSION = 3`.
- `src/CoilSwapRouter.sol` — a metade on-chain da **aba de Swap**: executa swaps v4 exact-input e
  **desvia uma interface fee** (bps do input, default 0,20%, teto 1%) pra carteira do protocolo.
  Em token do Coil, empilha com a taxa do hook (interface fee + fee de protocolo, as duas pra
  você); em qualquer outro token v4, a interface fee é receita pura. É o topo de funil que
  empurra gente pros lançamentos do Coil. Não custodia fundos entre transações.
- `src/base/BaseHook.sol` — base mínima de hook v4 (valida as flags do endereço).

## Como o front-end lança um token

O endereço do hook precisa carregar as flags `BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA` (`0x88`),
então o **salt é minerado off-chain**:

1. Reconstrói os ctor args (ou lê `pad.hookInitCodeHash(name, symbol, creator)`) e roda o
   `HookMiner` com `deployer = endereço do launchpad` pra achar o `salt`. `creator` = carteira do
   usuário se **Creator Rewards**, senão `address(0)`.
2. `pad.createTokenV4{value: creationFee}(name, symbol, metadataURI, salt, creatorRewards)`.
3. O launchpad deploya o `CoilHook` (o construtor valida as flags — salt errado reverte), seed,
   registra e cobra o creation fee. O token está **tradável e cobrando taxa no mesmo bloco**.

## Testes

```bash
cd contracts-v4
./bootstrap.sh          # instala as deps v4 pinadas (precisa de rede)
forge test              # unit (CoilHook + CoilLaunchpad)
```

Suítes:
- `test/CoilHookUnit.t.sol` (16) — split, acumulador pro-rata, comprador tardio, Creator Rewards,
  claim, sweeps, guards, fuzz anti-dust.
- `test/CoilLaunchpadUnit.t.sol` (6) — launch Loop/Creator, endereço minerado, seed+renúncia,
  market, creation fee, refund, salt errado reverte.
- `test/e2e/*` — contra PoolManager/POSM reais e fork da Robinhood Chain (`FOUNDRY_PROFILE=e2e`).

> Ambiente sem acesso ao host do solc? Use o shim WASM: `forge test --use ./solc-wrapper.js`.
> O `CoilLaunchpad` exige via-IR (perfil default), então não roda no perfil `sandbox` legacy.

## Deploy

```bash
# 1. O launchpad (uma vez)
FOUNDRY_PROFILE=e2e forge script script/DeployCoilLaunchpad.s.sol:DeployCoilLaunchpad \
  --rpc-url $RPC_URL --broadcast --private-key $PK
# 2. Tokens saem via pad.createTokenV4(...) (o front-end minera o salt — ver acima)
```

Plano completo da migração em `../docs/COIL-V4-PLANO.md`.
