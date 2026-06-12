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
2. predict        → usuários depositam ETH no desfecho que acreditam, até o closeTime
3. proposeOutcome → após o evento, alguém propõe o resultado com caução de 0.01 ETH
4. dispute        → 24h para qualquer pessoa contestar com caução igual
5. finalize       → sem disputa, o resultado vale e a caução volta
6. claim          → vencedores sacam: stake + fração pro-rata do pool perdedor
```

- **Taxas**: 2% protocolo + até 1% criador do mercado, ambas sobre o pool
  perdedor. Quem só recupera o próprio stake não paga nada.
- **Disputas**: o árbitro decide e a caução do perdedor vai para o vencedor
  (MVP: multisig do protocolo; roadmap: corte descentralizada tipo
  Kleros/UMA).
- **Proteção do usuário**: mercado sem resolução no prazo (+7 dias de
  carência) é cancelado com **reembolso de 100%** para todos. O protocolo
  jamais fica com stake de usuário.

## Estrutura do repositório

```
contracts/Divinatio.sol   — contrato do protocolo (parimutuel, escrow, reputação)
test/Divinatio.test.js    — 14 testes cobrindo o ciclo de vida completo
scripts/deploy.js         — deploy via Hardhat
scripts/seed.js           — popula a rede local com mercados de demonstração
shared/DivinatioABI.json  — ABI compartilhada entre backend e frontend
backend/                  — API REST + indexador on-chain (Express + ethers)
frontend/                 — web app (React + Vite): mercados, apostas, Profetas
```

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

Configuração por variáveis de ambiente: `RPC_URL`, `CONTRACT_ADDRESS`, `PORT`.

### Frontend

Tema místico (violeta/dourado, glassmorphism) com odds animadas que emergem
dos pools, countdown ao vivo, simulador interativo de retorno ("se X vencer,
você recebe ~N ETH"), conexão MetaMask para apostar/criar mercados/sacar, e o
Ranking de Profetas com anéis de precisão. Configuração: `VITE_API_URL`,
`VITE_CONTRACT_ADDRESS`.

## Roadmap

- [x] MVP do protocolo: mercados parimutuais P2P com resolução otimista
- [x] Reputação on-chain de Profetas
- [x] Backend: API REST + indexador on-chain
- [x] Frontend web com apostas via MetaMask e Ranking de Profetas
- [ ] Suporte a stablecoin (USDC/BRL-pegged) em vez de ETH nativo
- [ ] Copy-staking: seguir Profetas com taxa de performance
- [ ] Oráculo descentralizado (UMA Optimistic Oracle ou Kleros) no lugar do árbitro
- [ ] Ligas e rankings por categoria; persistência do indexador (The Graph/SQLite)
- [ ] Auditoria de segurança antes de qualquer mainnet
- [ ] Parecer jurídico (Lei 14.790/2023, CVM, jurisdição de operação)
