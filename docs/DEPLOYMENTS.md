# Deployments

Endereços por chain. Isto é o registro de verdade — os fork tests apontam pra cá
(`test/e2e/CoilHookFork.t.sol`) e o site recebe estes valores via env na Vercel. Ao deployar algo
novo, registre aqui no mesmo PR.

## Arc (5042) — mainnet da Circle, gas em USDC nativo

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
