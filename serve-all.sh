#!/usr/bin/env bash
# DIVINATIO — pilha COMPLETA num único processo, para hospedagem (Railway).
# Sobe a blockchain, implanta os contratos + mercados de demonstração e serve
# o backend (indexador real) + o site + a ponte JSON-RPC para a MetaMask.
#
# Diferente do demo.sh: aqui é a COISA REAL (blockchain + contratos + backend),
# não dados falsos. A blockchain roda junto ao app (rede de teste); ao
# reiniciar o serviço, ela volta ao estado inicial dos mercados de exemplo.
set -e
cd "$(dirname "$0")"

# CHAIN_MODE=public: a blockchain é EXTERNA e permanente (ex.: Base Sepolia).
# Não subimos nó interno nem rodamos seed — apenas indexamos a cadeia externa
# via RPC_URL/CONTRACT_ADDRESS/TOKEN_ADDRESS vindos do ambiente.
if [ "${CHAIN_MODE:-local}" = "public" ]; then
  # Deploy ÚNICO pela própria Railway (sem terminal do usuário): se DEPLOY=1,
  # houver PRIVATE_KEY e ainda NÃO houver CONTRACT_ADDRESS, implanta os
  # contratos + mercados na cadeia pública, captura os endereços e segue.
  # deploy-public.js é idempotente, então depois que o usuário fixar
  # CONTRACT_ADDRESS/TOKEN_ADDRESS nas variáveis, reinícios NÃO reimplantam.
  if [ "${DEPLOY:-}" = "1" ] && [ -n "${PRIVATE_KEY:-}" ] && [ -z "${CONTRACT_ADDRESS:-}" ]; then
    NET="${DEPLOY_NETWORK:-baseSepolia}"
    echo "🚀 Implantando contratos na cadeia pública ($NET) — uma vez..."
    # Sem 'set -e' aqui para conseguirmos capturar o código de saída do deploy
    # (o pipe com tee mascararia uma falha do hardhat). Checamos manualmente.
    set +e
    npx hardhat run scripts/deploy-public.js --network "$NET" 2>&1 | tee /tmp/divinatio-deploy.txt
    deploy_status=${PIPESTATUS[0]}
    set -e
    export CONTRACT_ADDRESS=$(grep '^CONTRACT_ADDRESS=' /tmp/divinatio-deploy.txt | tail -1 | cut -d= -f2 | tr -d '\r')
    export TOKEN_ADDRESS=$(grep '^TOKEN_ADDRESS=' /tmp/divinatio-deploy.txt | tail -1 | cut -d= -f2 | tr -d '\r')
    export START_BLOCK=$(grep '^START_BLOCK=' /tmp/divinatio-deploy.txt | tail -1 | cut -d= -f2 | tr -d '\r')
    # Falha do deploy = NÃO subir com os endereços-padrão (placeholders) do
    # backend. Abortamos com uma mensagem clara para o erro aparecer na Railway.
    if [ "$deploy_status" -ne 0 ] || [ -z "$CONTRACT_ADDRESS" ]; then
      echo "════════════════════════════════════════════════════════════"
      echo "❌ O DEPLOY FALHOU — o serviço NÃO vai subir com endereços falsos."
      echo "   Veja o erro acima. Causas mais comuns:"
      echo "     • PRIVATE_KEY inválida (curta/errada) — deve ser a CHAVE PRIVADA"
      echo "       (64 caracteres), não o endereço da carteira."
      echo "     • Saldo de ETH insuficiente na carteira de deploy."
      echo "════════════════════════════════════════════════════════════"
      exit 1
    fi
    echo "════════════════════════════════════════════════════════════"
    echo "⚠️  COPIE estes 3 para as VARIÁVEIS da Railway e remova DEPLOY=1:"
    echo "    CONTRACT_ADDRESS=$CONTRACT_ADDRESS"
    echo "    TOKEN_ADDRESS=$TOKEN_ADDRESS"
    echo "    START_BLOCK=$START_BLOCK"
    echo "════════════════════════════════════════════════════════════"
  fi
  echo "🌐 Modo PÚBLICO: indexando cadeia externa (RPC_URL=${RPC_URL:-?})."
  exec node backend/server.js
fi

# --- Modo LOCAL (padrão): pilha completa num único processo ---
echo "🔨 Compilando o contrato..."
npx hardhat compile

echo "⛓️  Subindo a blockchain..."
npx hardhat node > /tmp/divinatio-node.log 2>&1 &

# espera a blockchain responder
i=0
until curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:8545 >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 120 ]; then
    echo "❌ A blockchain não respondeu."; tail -20 /tmp/divinatio-node.log; exit 1
  fi
  sleep 1
done

echo "🌱 Implantando contratos e mercados..."
npx hardhat run scripts/seed.js --network localhost

echo "🛰️  Subindo backend (indexador real) + site..."
# MOCK desligado = dados reais lidos da blockchain pelo indexador.
exec node backend/server.js
