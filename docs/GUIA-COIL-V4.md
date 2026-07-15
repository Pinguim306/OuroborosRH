# Tutorial — ligar o Coil v4 de verdade

Passo a passo pra sair de "código na `main`" até "Coil v4 no ar, cobrando taxa e caindo na sua
carteira". Cada etapa tem o que fazer, o comando e como conferir.

> **Ordem:** 0 → 1 → 2 → 3 → 4 → 5. As etapas 6 (lucro) e 7 (domínio) são contínuas/opcionais.
> **Regra de ouro:** a **chave privada nunca entra no git**. Use `.env` local (gitignorado) ou
> um gerenciador de segredo. Nada de identidade sua em commit/PR/site.

---

## Pré-requisitos

- **Carteira "operador"** com um pouco de ETH na Robinhood Chain (paga o gás dos deploys). Pode
  ser a mesma que recebe o lucro, ou não — você escolhe.
- **Foundry** instalado com **solc nativo** (os testes e2e/fork e o deploy usam `via-IR` +
  compilam a v4-core inteira; o shim WASM do sandbox não dá conta disso). `foundryup` resolve.
- **Node** (só se for usar o shim WASM pra unit tests; pra deploy real não precisa).
- Decidir **3 carteiras** (podem repetir):
  - `FEE_RECIPIENT` — recebe o **fee de protocolo** (0,50% de cada swap) + o creation fee + a
    **interface fee** da aba de Swap. **É a sua carteira de lucro.**
  - `PLATFORM_TREASURY` — recebe o **burn cut** (0,20%) pro buy&burn do COIL.
  - `OWNER` (launchpad/router) — admin que pode ajustar fee recipient/params depois. Sem poder
    sobre a liquidez dos tokens (que é travada por construção).

### Endereços da Robinhood Chain (já validados)

```
RPC              https://rpc.mainnet.chain.robinhood.com
Chain ID         4663
Explorer         https://robinhoodchain.blockscout.com
POOL_MANAGER     0x8366a39CC670B4001A1121B8F6A443A643e40951
POSITION_MANAGER 0x58daec3116aae6D93017bAAea7749052E8a04fA7
PERMIT2          0x000000000022D473030F116dDEE9F6B43aC78BA3
```

---

## Etapa 0 — preparar o ambiente

```bash
git clone <repo-do-coil>            # se ainda não tiver local
cd ouroborosrh/contracts-v4
./bootstrap.sh                      # instala as deps v4 pinadas (precisa de rede)
```

Crie um arquivo `.env` local (NÃO comitar) com o comum:

```bash
# .env  (fica em contracts-v4/, gitignorado)
export RPC_URL=https://rpc.mainnet.chain.robinhood.com
export PK=0xSUA_CHAVE_PRIVADA_DO_OPERADOR      # NUNCA comitar
export POOL_MANAGER=0x8366a39CC670B4001A1121B8F6A443A643e40951
export POSITION_MANAGER=0x58daec3116aae6D93017bAAea7749052E8a04fA7
export PERMIT2=0x000000000022D473030F116dDEE9F6B43aC78BA3

export FEE_RECIPIENT=0xSUA_CARTEIRA_DE_LUCRO
export PLATFORM_TREASURY=0xSUA_TESOURARIA_BUYBURN
export OWNER=0xSUA_CARTEIRA_ADMIN
```

Carregue com `source .env` antes dos comandos abaixo. Confirme que a chave tem gás:

```bash
cast balance $FEE_RECIPIENT --rpc-url $RPC_URL   # só pra ver saldos
```

---

## Etapa 1 — provar antes de gastar gás (fork test)

Roda o ciclo completo (deploy → seed → swap → taxa → claim) contra a Robinhood Chain **real**,
num fork local — não gasta nada, só prova que a infra da chain casa com os contratos.

```bash
cd contracts-v4
FOUNDRY_PROFILE=e2e forge test --match-contract CoilHookForkTest \
  --fork-url $RPC_URL -vv
```

Esperado: `test_Fork_FullLifecycle` passa. (Se `block.chainid != 4663`, o teste se auto-pula — nesse
caso confirme que o `--fork-url` é mesmo a mainnet da Robinhood.)

Opcional — a suíte e2e local (stack v4 fresco, sem fork):

```bash
FOUNDRY_PROFILE=e2e forge test --match-path "test/e2e/*" -vv
```

---

## Etapa 2 — deploy do CoilLaunchpad (a fábrica)

Define supply por lançamento, a cascata de fee e o range do pool. Os valores de pricing são
computados no script.

```bash
source .env
export LAUNCHPAD_OWNER=$OWNER
export TOKEN_SUPPLY=1000000000000000000000000   # 1.000.000 * 1e18 (ajuste ao gosto)
export CREATION_FEE=0                            # taxa nativa por launch (wei); 0 = grátis
# opcionais (defaults): TICK_LOWER=-6000 TICK_UPPER=0 PROTOCOL_FEE_BPS=50 HOLDER_FEE_BPS=30 BURN_FEE_BPS=20

FOUNDRY_PROFILE=e2e forge script script/DeployCoilLaunchpad.s.sol:DeployCoilLaunchpad \
  --rpc-url $RPC_URL --broadcast --private-key $PK
```

**Guarde o endereço** que aparece em `CoilLaunchpad deployed: 0x...`:

```bash
export COIL_LAUNCHPAD=0xENDERECO_DO_LAUNCHPAD
```

Confirmar no explorer (`https://robinhoodchain.blockscout.com/address/$COIL_LAUNCHPAD`) ou:

```bash
cast call $COIL_LAUNCHPAD "LAUNCHPAD_VERSION()(uint256)" --rpc-url $RPC_URL   # → 3
```

---

## Etapa 3 — deploy do CoilSwapRouter (a aba de Swap)

Cobra a **interface fee** (0,20% por padrão, teto 1%) em cada swap roteado → sua carteira.

```bash
source .env
export ROUTER_OWNER=$OWNER
export INTERFACE_FEE_RECIPIENT=$FEE_RECIPIENT
export INTERFACE_FEE_BPS=20                      # 0,20% (opcional; teto 100 = 1%)

FOUNDRY_PROFILE=e2e forge script script/DeployCoilSwapRouter.s.sol:DeployCoilSwapRouter \
  --rpc-url $RPC_URL --broadcast --private-key $PK
```

**Guarde** `CoilSwapRouter deployed: 0x...`:

```bash
export COIL_SWAP_ROUTER=0xENDERECO_DO_ROUTER
```

---

## Etapa 4 — lançar o primeiro token v4

Ainda não há UI de launch v4 (o `create` do site é v3), então lançamos pela CLI. O script minera
o endereço CREATE2 do token e chama `createTokenV4`.

```bash
source .env
export LAUNCHER=0xCARTEIRA_QUE_ASSINA        # DEVE ser a mesma carteira do $PK abaixo
export TOKEN_NAME="Meu Primeiro Coil"
export TOKEN_SYMBOL="MPC"
export TOKEN_METADATA_URI=""                  # opcional (link de metadata/imagem)
export CREATOR_REWARDS=false                   # false = Loop (holders); true = Creator (você)

FOUNDRY_PROFILE=e2e forge script script/LaunchCoilToken.s.sol:LaunchCoilToken \
  --rpc-url $RPC_URL --broadcast --private-key $PK
```

> ⚠️ `LAUNCHER` **precisa** ser o endereço da carteira do `$PK` — o salt é minerado pra esse
> endereço. Se não bater, a tx reverte (é uma proteção, não perde fundo além do gás).

Saída: `Coil token launched: 0x...`. Esse endereço **é o token** (e o pool, e o hook — tudo o
mesmo contrato). Confira o pool vivo:

```bash
cast call 0xTOKEN "seeded()(bool)" --rpc-url $RPC_URL    # → true
cast call 0xTOKEN "owner()(address)" --rpc-url $RPC_URL  # → 0x000...000 (ownership renunciado)
```

Repita a Etapa 4 pra cada token novo.

---

## Etapa 5 — ligar a aba de Swap no site

O site já está com a cara do Coil e a aba `/swap` pronta — ela só precisa saber o endereço do
router.

1. No painel do **Vercel** (projeto do site), em *Settings → Environment Variables*, adicione:

   ```
   NEXT_PUBLIC_COIL_SWAP_ROUTER = 0xENDERECO_DO_ROUTER
   ```

2. **Redeploy** (o Vercel rebuilda; ou *Deployments → Redeploy*). Como a var começa com
   `NEXT_PUBLIC_`, ela entra no bundle no build.
3. Abra `/swap`, conecte a carteira, cole o endereço de um token Coil (Etapa 4) e teste uma compra
   pequena. A cotação aparece (vem de uma simulação do swap real) e a interface fee já é cobrada.

> A aba fica num estado "not live yet" enquanto essa var não estiver setada — então dá pra
> mergear/deployar o site antes de ter o router, sem quebrar nada.

---

## Etapa 6 — sacar o lucro

Três fontes, todas pra você:

| Fonte | Como cai | Como sacar |
| --- | --- | --- |
| **Interface fee** (0,20% dos swaps na aba) | **direto** no `FEE_RECIPIENT` no momento do swap | nada a fazer — já cai |
| **Fee de protocolo** (0,50% de todo swap do token) | acumula **dentro do token** | `sweepProtocol()` (qualquer um pode chamar; vai pro `FEE_RECIPIENT`) |
| **Burn cut** (0,20%) | acumula no token | `sweepTreasury()` → `PLATFORM_TREASURY` |

Sacar o fee de protocolo acumulado de um token (roda quando quiser, ou agende um keeper):

```bash
cast send 0xTOKEN "sweepProtocol()" --rpc-url $RPC_URL --private-key $PK
# e, se quiser, o buy&burn:
cast send 0xTOKEN "sweepTreasury()" --rpc-url $RPC_URL --private-key $PK
```

Ver quanto tem acumulado antes de sacar:

```bash
cast call 0xTOKEN "protocolAccruedETH()(uint256)" --rpc-url $RPC_URL
cast call 0xTOKEN "protocolAccruedTOKEN()(uint256)" --rpc-url $RPC_URL
```

> Os **holders** sacam a parte deles (0,30%) sozinhos via `claim()` — no modo Loop. No modo
> Creator, essa fatia vira sua e sai por `sweepCreator()`.

---

## Etapa 7 — domínio e marca (quando quiser)

O site ainda usa a infra antiga de propósito (não quebrar nada até você decidir o domínio):

- **Domínio:** registre o do Coil (ex.: `coil.fun` / `coilhook.fun`), adicione no Vercel
  (*Settings → Domains*) e aponte o DNS.
- **Infra opcional** (não visível, mas pra coerência): trocar `ouroborosrh.fun`, o canal do
  Telegram `@ouroboros_launches` e o nome da API — hoje ainda "Ouroboros". Ficam em
  `web/app/api/**` e no `SITE_URL`. Me peça que eu troco quando o domínio estiver definido.
- **Ícones PNG:** removi os antigos (verdes). O favicon usa o `icon.svg` novo. Se quiser
  touch-icons dedicados, gero PNGs a partir do SVG.

---

## Checklist final

- [ ] Fork test passou (Etapa 1)
- [ ] `CoilLaunchpad` deployado — endereço guardado
- [ ] `CoilSwapRouter` deployado — endereço guardado
- [ ] Primeiro token v4 lançado e `seeded()==true`
- [ ] `NEXT_PUBLIC_COIL_SWAP_ROUTER` setado no Vercel + redeploy
- [ ] Swap de teste na aba `/swap` funcionando, interface fee caindo
- [ ] `sweepProtocol()` testado (o lucro chega no `FEE_RECIPIENT`)
- [ ] (opcional) domínio do Coil apontado

## Segurança

- Chave privada **só** em `.env`/segredo — nunca em git, PR, ou no site.
- Nada que ligue você ao projeto em commit/PR/frontend (você quer anonimato).
- Ownership dos tokens é **renunciado** no launch e a liquidez é **travada por construção** — não
  há função de saque do principal, então não dá pra rugar (nem por você).
- Comece com valores pequenos num token de teste antes de anunciar.

## Próximos (quando quiser puxar)

- **UI de launch v4** no site (hoje o `create` é v3) + token-picker a partir dos markets do
  `CoilLaunchpad` na aba de Swap.
- Roteamento "any token" (v3 + agregação) na aba de Swap.
- Referência dos contratos: `contracts-v4/README.md`; plano da migração: `docs/COIL-V4-PLANO.md`.
