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

## A cascata (o criador escolhe a taxa, a curva decide o split)

O criador escolhe a taxa **total** no launch, de 1% a 5% (`MIN_FEE_BPS`/`MAX_FEE_BPS`). Quem recebe
o quê sai da `FeeCurve` do launchpad, que o criador não controla: a fatia do protocolo **desce**
conforme a taxa sobe — muito de uma taxa pequena, menos de uma grande.

```
Swap  →  taxa escolhida sobre o input (ETH nas compras, token nas vendas)  →  no hook:
    ├─ PROTOCOLO  → feeRecipient        45% da taxa a 1%  …  25% a 5%   ← lucro por volume
    ├─ HOLDERS    → pro-rata (Loop) OU pro criador (Creator)
    └─ BURN       → platformTreasury (buy&burn do COIL), 20% do que sobra
```

Na prática, por `pad.resolveFees(bps)` — o front-end mostra exatamente isso antes de assinar:

| taxa | protocolo | holders/criador | burn |
| --- | --- | --- | --- |
| 1% | 0,45% | 0,44% | 0,11% |
| 2% | 0,80% | 0,96% | 0,24% |
| 3% | 1,05% | 1,56% | 0,39% |
| 5% | 1,25% | 3,00% | 0,75% |

> **Cuidado ao recalibrar a curva:** o ganho absoluto do protocolo é `taxa × fatia(taxa)`, uma
> parábola. Se a fatia no teto cair abaixo de 5/9 da fatia no piso (25% contra 45%), o pico vai pro
> meio da faixa e o protocolo passa a **ganhar menos** quando o criador sobe a taxa. Não é validado
> on-chain — é escolha de negócio, não propriedade de segurança — mas está documentado na struct.

`POOL_FEE = 0` → o trader nunca paga taxa dupla. Config imutável por token (teto de 5%, validado
pelo construtor do hook). Dois modos fixados no launch: **Loop Rewards** (`creator = 0`, dividendo
pra todos os holders) e **Creator Rewards** (`creator != 0`, a fatia de holders vai pro criador via
`sweepCreator()`).

## Contratos

- `src/CoilHook.sol` — o token v4: É o ERC-20, o dono da liquidez e o roteador de taxa nativa.
- `src/CoilLaunchpad.sol` — a fábrica: `createTokenV4()` deploya o hook num endereço CREATE2
  minerado, chama `seed()` (pool + liquidez de um lado + renúncia) e registra o market.
  `LAUNCHPAD_VERSION = 4` — a partir da 4 o `createTokenV4` recebe a alíquota escolhida pelo
  criador. O site lê essa constante **por chain** e escolhe a assinatura: a Robinhood Chain roda uma
  launchpad 3 (split fixo no deploy, tokens já lançados nela), a Arc nasce na 4.
- `src/CoilSwapRouter.sol` — a metade on-chain da **aba de Swap**: executa swaps v4 exact-input e
  **desvia uma interface fee** (bps do input, default 0,20%, teto 1%) pra carteira do protocolo.
  Em token do Coil, empilha com a taxa do hook (interface fee + fee de protocolo, as duas pra
  você); em qualquer outro token v4, a interface fee é receita pura. É o topo de funil que
  empurra gente pros lançamentos do Coil. Não custodia fundos entre transações.
- `src/base/BaseHook.sol` — base mínima de hook v4 (valida as flags do endereço).

## Como o front-end lança um token

O endereço do hook precisa carregar as flags `BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA` (`0x88`),
então o **salt é minerado off-chain**:

1. Lê `pad.hookInitCodeHash(name, symbol, creator, totalFeeBps)` e roda o `HookMiner` com
   `deployer = endereço do launchpad` pra achar o `salt`. `creator` = carteira do usuário se
   **Creator Rewards**, senão `address(0)`. **A alíquota entra nos ctor args do hook**, então ela
   muda o init code hash e, com ele, o endereço minerado — minerar com uma taxa e lançar com outra
   aponta pra um contrato que nunca é deployado, e o launch reverte.
2. `pad.createTokenV4{value: creationFee}(name, symbol, metadataURI, salt, creatorRewards, totalFeeBps)`.
3. O launchpad deploya o `CoilHook` (o construtor valida as flags — salt errado reverte), seed,
   registra e cobra o creation fee. O token está **tradável e cobrando taxa no mesmo bloco**.

## Testes

```bash
cd contracts-v4
./bootstrap.sh          # instala as deps v4 pinadas (precisa de rede)
forge test              # unit (CoilHook + CoilLaunchpad)
```

Suítes:
- `test/CoilHookUnit.t.sol` — split, acumulador pro-rata, comprador tardio, Creator Rewards,
  claim, sweeps, guards, fuzz anti-dust.
- `test/CoilLaunchpadUnit.t.sol` — launch Loop/Creator, endereço minerado, seed+renúncia, market,
  creation fee, refund, salt errado reverte, e a curva de taxa: âncoras, monotonicidade, split exato
  (fuzz), salt minerado pra outra alíquota reverte.
- `test/DeployPreflight.t.sol` — o preflight de infra v4 do script de deploy (ver a seção de infra
  por chain acima).
- `test/e2e/*` — contra PoolManager/POSM reais e fork da Robinhood Chain (`FOUNDRY_PROFILE=e2e`).

> Ambiente sem acesso ao host do solc? Use o shim WASM: `forge test --use ./solc-wrapper.js`.
> O `CoilLaunchpad` exige via-IR (perfil default), então não roda no perfil `sandbox` legacy.

## Infra Uniswap v4 por chain

**A Uniswap deploya v4 chain por chain e NÃO nos mesmos endereços.** Copiar o env de uma chain
irmã é o erro que realmente acontece, e ele não falha no deploy — falha em todo lançamento depois,
dentro do `CoilHook.seed()`, que minta a posição travada via `IPositionManager(POSM).multicall(...)`.

Levantamento feito com `eth_getCode` direto nas duas chains (bytecode idêntico = mesmo contrato):

| Contrato | Robinhood Chain (4663) | Arc (5042) |
| --- | --- | --- |
| PoolManager | `0x8366a3…40951` (24009 B) | **mesmo endereço, bytecode idêntico** |
| StateView | `0xf33341…9e673b` (3531 B) | **mesmo endereço, bytecode idêntico** |
| Quoter | `0x8dc178…98f94` (6118 B) | **mesmo endereço, bytecode idêntico** |
| Permit2 | `0x000000…78BA3` (9152 B) | mesmo endereço; bytecode difere porque o domain separator EIP-712 é immutable e embute o chain id |
| **PositionManager** | `0x58daec…04fA7` (23877 B) | **AUSENTE — sem código** |
| **UniversalRouter** | `0x887678…c0904` (24546 B) | **AUSENTE — sem código** |

O padrão é coerente: os dois ausentes são exatamente os que precisam de um **WETH9** no construtor,
e a Arc não tem WETH9 (o gas dela é USDC nativo). A página de deployments da Uniswap também não
lista a Arc. Consequência prática:

- **Swap na Arc funciona.** O `CoilSwapRouter` fala com o `IPoolManager` direto via `unlockCallback`
  — não toca periphery.
- **Lançamento na Arc, não.** O `seed()` depende do POSM. Sem PositionManager na chain, todo
  `createTokenV4` reverte.

Por isso o `DeployCoilLaunchpad` roda um **preflight** (`_assertV4Infra`) antes de gastar qualquer
coisa: exige código nos três endereços, confirma que o PoolManager responde `protocolFeeController()`
e que o POSM está atrelado a **esse** PoolManager (um POSM de outro singleton passaria no
`!= address(0)` e mintaria liquidez numa pool que ninguém negocia). Coberto por
`test/DeployPreflight.t.sol`.

## Deploy

```bash
# 1. O launchpad (uma vez). O preflight recusa a chain se a infra v4 não estiver lá.
FOUNDRY_PROFILE=e2e forge script script/DeployCoilLaunchpad.s.sol:DeployCoilLaunchpad \
  --rpc-url $RPC_URL --broadcast --private-key $PK
# 2. Tokens saem via pad.createTokenV4(...) (o front-end minera o salt — ver acima)
```

`CREATION_FEE` é no gas coin da chain e **sempre em 18 casas**: Robinhood Chain 0,001 ETH = `1e15`;
Arc 2 USDC = `2e18`, porque a EVM escala o USDC nativo da Arc pra 18 casas (não as 6 do ERC-20) —
`2e6` cobraria 0,000000000002. `BURN_SHARE_OF_REMAINDER_BPS=0` em chain sem $COIL pra comprar e
queimar; a fatia inteira restante vai pro criador/holders.

Plano completo da migração em `../docs/COIL-V4-PLANO.md`.
