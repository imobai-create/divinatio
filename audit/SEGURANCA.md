# DIVINATIO — Nota de Segurança (auto-avaliação)

Este documento resume o estado de segurança do contrato `contracts/Divinatio.sol`
para o **dono/investidor** decidir com clareza. **Não substitui uma auditoria
profissional.**

## 1. O ponto mais importante: o contrato CUSTODIA o dinheiro

"Não-custodial" quer dizer que **a plataforma (você) não segura** o dinheiro dos
apostadores — mas **o contrato inteligente segura**. Quando alguém aposta, os
fundos vão para o **escrow do contrato** e ficam lá (somados aos dos outros) até
a resolução e o pagamento.

Consequência: **um bug no contrato = perda do dinheiro REAL dos usuários**, mesmo
você nunca tendo "tocado" nele. É por isso que, com dinheiro real, a auditoria
importa: ela protege o dinheiro que está **dentro do contrato**.

- **Testnet (dUSD, de brincadeira):** risco zero — pode operar à vontade.
- **Mainnet (USDC real):** auditoria fortemente recomendada **antes** de abrir ao
  público. Contrato é **imutável** — não dá para "dar um patch" depois.

## 2. Modelo de confiança (o que o dono PODE e NÃO PODE fazer)

- `owner` (o deployer) é o **árbitro de disputas** (`resolveDispute`): em uma
  disputa, é ele quem decide o desfecho. **Isso é centralizado** — é um ponto de
  confiança (e, para a tese de "intermediário puro", um item a evoluir para um
  oráculo descentralizado, ex.: UMA/Kleros).
- O `owner` pode trocar a `treasury` e transferir o `owner`. **Não há** função
  que permita ao `owner` sacar fundos arbitrários dos usuários — os pagamentos
  seguem a lógica do contrato (pro-rata aos vencedores; reembolso se cancelado).
- Sem mecanismo de **pausa de emergência** (considerar adicionar).

## 3. Análise estática (Slither) — resultado

Rodado o Slither (`audit/slither-report.md`). **Nenhum achado Crítico ou Alto.**
Resumo dos achados e nossas respostas:

| Achado | Sev. | Resposta |
|---|---|---|
| `reentrancy-no-eth` em `copyPredict`/`predict` (chamada externa antes de gravar estado) | Médio | Seguro com token padrão **sem callback** (USDC). Recomendado adicionar um `nonReentrant` (guard) para robustez. |
| `divide-before-multiply` em `claim` (taxa do profeta) | Médio | Perda de precisão é poeira (valores em unidades do token). Sem impacto de solvência. |
| `uninitialized-local` (`losingPool`, `refund`) | Médio | **Falso positivo** — em Solidity, `uint` inicia em 0 (intencional). |
| `events-access` (`setTreasury`/`transferOwnership` sem evento) | Baixo | Cosmético; recomendado emitir eventos de governança. |
| `timestamp` (uso de `block.timestamp`) | Baixo | Aceitável — as janelas são grandes (24h/7d); manipulação de segundos é irrelevante. |
| `low-level-calls` (`_callToken`) | Info | Intencional — trata ERC-20 não-padrão (retorno vazio ou bool). |

## 4. Premissas sobre o token (importante para mainnet)

O contrato assume um ERC-20 **padrão**: sem taxa na transferência
(fee-on-transfer), sem rebasing, sem callbacks (não-777). **USDC atende** a
todas. **Não** use um token fora desse padrão sem reavaliar a contabilidade dos
pools.

## 5. Invariantes que uma auditoria deve confirmar

- **Conservação de fundos:** soma depositada (pools + cauções) = soma sacável
  (pagamentos + reembolsos + taxas + devolução de cauções). Sobra de
  arredondamento fica no contrato (a favor da solvência).
- **Sem saque duplo:** `claimed[market][user]` impede reentrância de saque.
- **Sem divisão por zero:** `_settle` cancela o mercado se o pool vencedor for 0.
- **Cauções:** fluxo proposer/disputer conserva (2 entram, 2 saem ao vencedor).

## 6. Cobertura de testes

`USE_LOCAL_SOLC=1 npx hardhat test` → **22 testes** cobrindo criação, apostas,
resolução otimista, disputa, pagamentos pro-rata, taxas, copy-staking,
cancelamento/reembolso e o caso de 6 decimais (USDC). Testes provam o
comportamento esperado; **não** substituem auditoria (que procura o inesperado).

---

**Recomendação honesta:** mantenha em **testnet** enquanto for demonstração. Para
**dinheiro real**, faça a auditoria — é o dinheiro dos seus usuários que está no
contrato. A decisão é do dono.
