# Deployments

Endereços por chain. Isto é o registro de verdade — os fork tests apontam pra cá
(`test/e2e/CoilHookFork.t.sol`) e o site recebe estes valores via env na Vercel. Ao deployar algo
novo, registre aqui no mesmo PR.

## Arc (5042) — mainnet da Circle, gas em USDC nativo

> **Geração atual: instant-V3** (seção abaixo). O stack v4 segue registrado mais adiante — os
> tokens já lançados nele continuam funcionando, mas novos lançamentos saem pelo v3.

### Instant-V3 (geração atual) — lançamentos roteáveis por terminais externos

Motivo da troca: pools v4 com hook custom (flags `BEFORE_SWAP_RETURNS_DELTA`) não são roteados
por terminais/agregadores — na prática, "No route available" no GMGN. Os terminais da Arc roteiam
os pools **Uniswap V3 do factory da DYOR** (`0xf0db7b58379503491d857dB50AC9ece64c653918` —
`createPool` permissionless, verificado; tier 1% habilitado, spacing 200), então a geração atual
lança direto num pool V3 desse factory contra a **fachada ERC20 do USDC nativo**
(`0x3600000000000000000000000000000000000000`, 6 casas — saldo da fachada É o saldo nativo; ela
faz o papel do WETH sem wrap). A taxa do protocolo passa a ser o próprio tier de 1% do pool:
somos 100% da liquidez (posição travada no ArcPoolLocker, sem função de saque de principal), o
`collect` permissionless colhe e divide **60% criador-ou-holders / 40% protocolo**. Volume de
QUALQUER origem (nosso site, GMGN, agregadores) paga essa taxa.

Contratos em `contracts/src/Arc*.sol`. Sem dependência de periferia de terceiros: mint e swap
direto no pool via callbacks; o único código externo é o factory/pool (imutável). Risco aceito e
documentado: o dono do factory DYOR pode um dia ligar o protocol fee do V3 (desvia 10–25% das LP
fees); se acontecer, migramos lançamentos novos para factory próprio.

Config de preço (`PrintArcV3Config`, `TICK_UPPER1=400600 SPAN=69000 TOKEN_SUPPLY=1e27`): mcap de
abertura **$4.009** (espelha o $4k do v4), span 991,9×, nas duas orientações de ordenação
token/fachada. Economia: creation fee **1 USDC** (`1e6` — unidades da fachada, 6 casas!), supply
1 bi, dev-buy opcional como primeiro swap do pool, modos Loop/Creator Rewards. Router do site:
interface fee 20 bps, teto 100. `LAUNCHPAD_VERSION 5`.

Fluxo de aprovação (novidade vs. v4): usuário **aprova a fachada USDC** como um ERC20 comum
(creation fee/compras) — o mesmo padrão que o router do GMGN usa. Nada de `msg.value`.

Verificação: `ARC_RPC_URL=https://rpc.blockdaemon.mainnet.arc.io forge test -mc ArcV3Fork`
(em `contracts/`) roda 11 testes contra o factory REAL num fork — launch a $4.009, trades com 1%
+ 0,2%, splits exatos, claim de dividendos, griefer de pré-init bloqueado, as duas orientações e
trade externo sem nosso router. A fachada é a única coisa mockada (contrato de sistema; anvil
vanilla não executa transfer dela — `test/mocks/MockUSDCFacade.sol` explica).

**Deploy (rodar na máquina do dono):**

```bash
cd contracts
PRIVATE_KEY=$PK forge script script/DeployArc.s.sol \
  --rpc-url https://rpc.blockdaemon.mainnet.arc.io --broadcast
```

| Contrato | Endereço | Tx / bloco |
| --- | --- | --- |
| ArcLaunchpad | _(preencher pós-deploy)_ | |
| ArcPoolLocker | _(preencher pós-deploy)_ | |
| ArcSwapRouter | _(preencher pós-deploy)_ | |

Depois do deploy, apontar o site (Vercel) — o create da Arc troca para o fluxo v3 assim que a
primeira var existir; sem ela o site continua no v4 (o front nunca lidera o contrato):

```
NEXT_PUBLIC_ARC_LAUNCHPAD_ADDRESS   = <ArcLaunchpad>
NEXT_PUBLIC_ARC_COIL_SWAP_ROUTER_V3 = <ArcSwapRouter>
```

### Stack v4 (geração anterior — tokens existentes seguem nela)

Deploy de 2026-07-30, carteira `0xd2bb88dccf3835b5dc24d08e6bf40578a5889265`. Custo total ≈ 0,41 USDC.

### Contratos do Coil

| Contrato | Endereço | Tx / bloco |
| --- | --- | --- |
| CoilLaunchpad | `0x2BB90bC8B4bD00414Cc09a2a4B2538628B0f7B2b` | `0x84f42a…31bf` / 12917923 |
| CoilSwapRouter | `0x655196EF8c38FeC5Cea6602B9AF1cf37fF2e9214` | `0xef264d…2d8c` / 12918725 |

Config do launchpad, conferida on-chain pós-deploy: `LAUNCHPAD_VERSION 4`, taxa 1%–5%
(`MIN_FEE_BPS 100` / `MAX_FEE_BPS 500`), creation fee **1 USDC** (`1e18` — a EVM escala o USDC
nativo pra 18 casas), curva 4500/2500, **burn 0** (não há $COIL na Arc; o resto vai inteiro pro
criador — ex.: taxa de 2% divide 0,8% protocolo / 1,2% criador). Supply 1 bi por launch.
Router: interface fee 20 bps, teto 100.

**LaunchConfig (preço de lançamento)** — retunado via `setLaunchConfig` em 2026-07-30 para espelhar
a economia do launchpad da Robinhood (launch ~$7,7k, span 991,9×), ancorado em **$4k**:
`tickLower 55200`, `tickUpper 124200`, `sqrtPriceX96 39419714714836218817262574961159`,
`liquidity 2075769374731673079631915` → mcap inicial **$4.039** (247.553 tokens/USDC), teto ~$4M.
Valores gerados por `contracts-v4/script/PrintLaunchConfig.s.sol` (TickMath exato, não float) e
verificados com um launch no fork lendo o slot0 da pool. O deploy original usara os defaults do
script (`-6000/0`), que precificavam o launch em $1B — o primeiro token (TEST) ficou nessa pool,
imutável por design.

### Infra Uniswap v4 na Arc

| Contrato | Endereço | Origem |
| --- | --- | --- |
| PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | oficial (bytecode idêntico ao da Robinhood) |
| StateView | `0xf3334192D15450Cdd385c8B70E03F9A6BD9E673b` | oficial |
| Quoter | `0x8Dc178EFB8111Bb0973dd9D722EbEfF267C98f94` | oficial |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | canônico |
| **PositionManager** | `0xb0A091217C8E4d6946073F241530830594d5F461` | **self-hosted** — `0xfd46a4…9f5e` / 12917188 |

O PositionManager é o da Uniswap, sem modificação, deployado por nós porque a Uniswap não publicou
periphery na Arc (sem WETH9 na chain). `weth9 = 0` e `tokenDescriptor = 0` — consequências e
racional em `contracts-v4/script/DeployPositionManager.s.sol`. **Não há UniversalRouter na Arc**;
o CoilSwapRouter fala com o PoolManager direto e não depende dele.

Peculiaridades da chain: o proxy CREATE2 determinístico (`0x4e59b4…956C`) **não existe** — scripts
de deploy usam CREATE simples por causa disso. RPC público da thirdweb (`5042.rpc.thirdweb.com`)
tem rate limit agressivo e instabilidade; use `https://rpc.blockdaemon.mainnet.arc.io`.

### Env do site (Vercel)

```
NEXT_PUBLIC_ARC_COIL_LAUNCHPAD    = 0x2BB90bC8B4bD00414Cc09a2a4B2538628B0f7B2b
NEXT_PUBLIC_ARC_COIL_SWAP_ROUTER  = 0x655196EF8c38FeC5Cea6602B9AF1cf37fF2e9214
NEXT_PUBLIC_ARC_V4_POOL_MANAGER   = 0x8366a39CC670B4001A1121B8F6A443A643e40951
NEXT_PUBLIC_ARC_RPC_URL           = https://rpc.blockdaemon.mainnet.arc.io
```

## Robinhood Chain (4663) — chain default

Infra v4 oficial da Uniswap (defaults dos fork tests):

| Contrato | Endereço |
| --- | --- |
| PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| PositionManager | `0x58daec3116aae6D93017bAAea7749052E8a04fA7` |
| UniversalRouter | `0x8876789976dEcbFCbbBE364623C63652db8C0904` |
| StateView | `0xf3334192D15450Cdd385c8B70E03F9A6BD9E673b` |
| Quoter | `0x8Dc178EFB8111Bb0973dd9D722EbEfF267C98f94` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Os contratos do Coil na Robinhood (launchpad v3 da curva, launchpad v4 `LAUNCHPAD_VERSION 3`,
routers) estão configurados no env da Vercel — ao registrar aqui, copie de lá, não o contrário.
