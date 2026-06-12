# DIVINATIO

**Protocolo descentralizado de mercados de previsão peer-to-peer.**

Pessoas apostam *umas contra as outras* em eventos futuros — quem vence a Copa
do Mundo FIFA, quem leva o Oscar, qual álbum estreia em #1. O protocolo nunca
é contraparte de nenhuma posição: ele só custodia os pools em escrow on-chain,
faz o acerto de contas e cobra uma taxa de serviço. **Intermediadora, não bet.**

---

## Isso é possível? Sim — e o modelo já tem nome

O que você descreve é um *prediction market* P2P, a categoria de Polymarket
(US$ ~9 bi em volume em 2024) e Augur. A diferença estrutural entre uma "bet"
e uma intermediadora:

| | Casa de aposta (bet) | DIVINATIO (intermediadora) |
|---|---|---|
| Contraparte | A casa banca a aposta e define odds | Usuários apostam entre si; odds emergem dos pools |
| Receita | Margem embutida nas odds + perda do apostador | Taxa fixa de serviço (2%) sobre o pool perdedor |
| Risco | A casa perde quando o apostador ganha | Zero exposição ao resultado dos eventos |
| Quem cria mercados | A casa | Qualquer usuário (permissionless), que ganha até 1% como criador |

Como o protocolo não tem interesse no resultado e não define odds, a posição
econômica é a de um marketplace — análoga a uma bolsa, não a um bookmaker.

> ⚠️ **Posicionamento jurídico**: a arquitetura técnica ajuda, mas não decide a
> questão regulatória sozinha. No Brasil, a Lei 14.790/2023 regula apostas de
> quota fixa; mercados de previsão P2P (quota variável/parimutuel) são zona
> cinzenta e a CVM pode enxergar valores mobiliários dependendo do desenho.
> Nos EUA, a CFTC trata esses contratos como derivativos de evento. Antes de
> operar com dinheiro real, é indispensável assessoria jurídica especializada
> em cripto/jogos — e considerar lançar primeiro em jurisdição favorável ou em
> testnet/pontos sem valor monetário.

## O nicho e o formato novo

O mercado global já tem players genéricos (Polymarket domina política e
macro). As lacunas exploráveis onde DIVINATIO pode ser primeiro:

1. **Cultura e esporte lusófonos** — futebol brasileiro (Brasileirão,
   estaduais, Libertadores), reality shows, música e premiações. Nenhum
   prediction market on-chain atende esse público no idioma e nos eventos que
   ele acompanha. A Copa de 2026 é a janela de lançamento perfeita.

2. **O formato novo: reputação de Profetas + copy-staking.** Hoje nenhum
   prediction market tem camada social. O diferencial do DIVINATIO:
   - Cada acerto e erro fica registrado on-chain — um **histórico de precisão
     auditável e impossível de falsificar** (`accuracyBps`), já implementado
     no contrato.
   - *Roadmap*: **copy-staking** — usuários "seguem" os Profetas com melhor
     histórico e replicam suas posições automaticamente; o Profeta recebe uma
     taxa de performance dos seguidores. É o modelo de copy-trading (eToro)
     que nunca foi aplicado a mercados de previsão.
   - Ligas e temporadas: rankings de precisão por categoria (futebol, música,
     política), com "divinação" como esporte competitivo.

   Isso muda o produto de "site de aposta" para **rede social de previsões com
   skin in the game** — outra narrativa, outro nicho, outra relação com o
   usuário.

## Como funciona (mecânica parimutuel)

```
1. createMarket   → qualquer pessoa cria: "Quem vence a Copa 2026?" (2–8 desfechos)
2. predict        → usuários depositam stablecoin no desfecho que acreditam, até o closeTime
3. proposeOutcome → após o evento, alguém propõe o resultado com caução
4. dispute        → 24h para qualquer pessoa contestar com caução igual
5. finalize       → sem disputa, o resultado vale e a caução volta
6. claim          → vencedores sacam: stake + fração pro-rata do pool perdedor
```

- **Moeda**: todas as apostas usam uma **stablecoin ERC-20** — em produção,
  USDC; em teste, o `dUSD` (MockStablecoin com faucet público de 1.000 por
  clique). Sem exposição à volatilidade do ETH.
- **Taxas**: 2% protocolo + até 1% criador do mercado, ambas sobre o pool
  perdedor. Quem só recupera o próprio stake não paga nada.
- **Disputas**: o árbitro decide e a caução do perdedor vai para o vencedor
  (MVP: multisig do protocolo; roadmap: corte descentralizada tipo
  Kleros/UMA).
- **Proteção do usuário**: mercado sem resolução no prazo (+7 dias de
  carência) é cancelado com **reembolso de 100%** para todos. O protocolo
  jamais fica com stake de usuário.

### Copy-staking (seguir Profetas)

O formato exclusivo do DIVINATIO, já implementado on-chain:

```
1. follow(profeta, valor)  → você passa a replicar as previsões do Profeta
2. copyPredict(...)        → o keeper replica a posição dominante dele para você
3. claim                   → se a posição copiada vencer, o Profeta ganha 10% do SEU LUCRO
```

- A cópia usa **o seu saldo** e respeita o valor por mercado que você definiu
  (uma cópia por mercado; `unfollow` desativa quando quiser).
- O Profeta só ganha se **você lucrar** — incentivos alinhados.
- O backend inclui um keeper opcional (`KEEPER_PRIVATE_KEY`) que executa as
  cópias automaticamente quando um Profeta seguido entra num mercado.

## Estrutura do repositório

```
contracts/Divinatio.sol      — contrato do protocolo (parimutuel, escrow, reputação, copy-staking)
contracts/MockStablecoin.sol — dUSD: stablecoin de teste com faucet público
test/Divinatio.test.js       — 20 testes cobrindo o ciclo de vida completo
scripts/deploy.js            — deploy via Hardhat (local ou testnet)
scripts/seed.js              — popula a rede local com mercados de demonstração
shared/                      — ABIs compartilhadas entre backend e frontend
backend/                     — API REST + indexador on-chain + keeper de copy-staking
frontend/                    — web app (React + Vite): mercados, apostas, Profetas
Dockerfile / railway.json    — deploy de serviço único na Railway
```

## Onde vejo o site?

- **Local**: siga "Rodando o stack completo" abaixo → `http://localhost:5173`
- **Público**: faça o deploy na Railway (seção abaixo) → a Railway gera uma
  URL `https://<seu-projeto>.up.railway.app` com o site e a API juntos

## Rodando o stack completo (rede local)

```bash
# 1. Contratos — instala, testa e sobe a rede local
npm install
npm test
npx hardhat node                                    # terminal 1

# 2. Deploy + mercados de demonstração
npx hardhat run scripts/seed.js --network localhost # terminal 2

# 3. Backend (API em http://localhost:3001)
cd backend && npm install && npm start              # terminal 3

# 4. Frontend (web app em http://localhost:5173)
cd frontend && npm install && npm run dev           # terminal 4
```

Para apostar pelo navegador, conecte a MetaMask à rede local
(`http://127.0.0.1:8545`, chain id `31337`) e importe uma das contas de teste
exibidas pelo `npx hardhat node`.

### Backend (API)

| Endpoint | Descrição |
|---|---|
| `GET /api/markets` | Lista mercados com pools, estado e odds (filtro `?state=open`) |
| `GET /api/markets/:id` | Detalhe do mercado + últimas previsões |
| `GET /api/leaderboard` | Ranking de Profetas por precisão on-chain |
| `GET /api/stats` | Volume total, mercados abertos, previsões |

| `GET /api/config` | Endereços do contrato/token que o frontend consome em runtime |

Configuração por variáveis de ambiente: `RPC_URL`, `CONTRACT_ADDRESS`,
`TOKEN_ADDRESS`, `PORT` e `KEEPER_PRIVATE_KEY` (opcional — ativa o keeper que
executa as cópias do copy-staking automaticamente). Em produção, o backend
também serve o frontend compilado (`frontend/dist`).

### Frontend

Tema místico (violeta/dourado, glassmorphism) com odds animadas que emergem
dos pools, countdown ao vivo, simulador interativo de retorno ("se X vencer,
você recebe ~N dUSD"), conexão MetaMask para apostar/criar mercados/sacar,
faucet de dUSD na navbar, e o Ranking de Profetas com anéis de precisão e
botão **Seguir** (copy-staking). Os endereços vêm de `/api/config` em runtime.

## Deploy em testnet pública (Base Sepolia)

1. Crie uma carteira **só para testes** e pegue ETH de gás num faucet da Base
   Sepolia (ex.: o faucet do Coinbase Developer Platform).
2. Implante o contrato (o dUSD de teste vai junto):

   ```bash
   PRIVATE_KEY=0xSUACHAVE npx hardhat run scripts/deploy.js --network baseSepolia
   ```

3. Guarde os endereços impressos (`CONTRACT_ADDRESS` e `TOKEN_ADDRESS`).

## Deploy na Railway (site público) — sim, funciona!

A Railway hospeda o **site + API** num único serviço (o contrato fica na
blockchain; a Railway roda o resto apontando para ela). O repositório já tem
`Dockerfile` e `railway.json` prontos:

1. Em [railway.app](https://railway.app): **New Project → Deploy from GitHub
   repo** → selecione `imobai-create/divinatio`. A Railway detecta o
   Dockerfile sozinha.
2. Em **Variables**, configure (use a saída do deploy em testnet):

   ```
   RPC_URL=https://sepolia.base.org
   CONTRACT_ADDRESS=0x...   (do passo de testnet)
   TOKEN_ADDRESS=0x...      (idem)
   KEEPER_PRIVATE_KEY=0x... (opcional, ativa o copy-staking automático)
   ```

3. Em **Settings → Networking**, clique **Generate Domain**. Pronto: o site
   fica em `https://<seu-projeto>.up.railway.app`.

Os visitantes conectam a MetaMask na Base Sepolia, clicam no 🚰 da navbar para
receber 1.000 dUSD de teste e já podem apostar.

## Roadmap

- [x] MVP do protocolo: mercados parimutuais P2P com resolução otimista
- [x] Reputação on-chain de Profetas
- [x] Backend: API REST + indexador on-chain
- [x] Frontend web com apostas via MetaMask e Ranking de Profetas
- [x] Suporte a stablecoin (dUSD em teste; USDC em produção) em vez de ETH nativo
- [x] Copy-staking: seguir Profetas com taxa de performance de 10% sobre o lucro
- [x] Deploy: redes de testnet no Hardhat + Dockerfile/railway.json para a Railway
- [ ] Oráculo descentralizado (UMA Optimistic Oracle ou Kleros) no lugar do árbitro
- [ ] Ligas e rankings por categoria; persistência do indexador (The Graph/SQLite)
- [ ] Auditoria de segurança antes de qualquer mainnet
- [ ] Parecer jurídico (Lei 14.790/2023, CVM, jurisdição de operação)
