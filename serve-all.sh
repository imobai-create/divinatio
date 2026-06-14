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
