#!/usr/bin/env bash
# DIVINATIO — sobe o ambiente local completo com um único comando:
#   ./start.sh
# Instala as dependências (na primeira vez), inicia a blockchain local,
# implanta os contratos com mercados de demonstração, sobe a API e o site.
# Pressione Ctrl+C para desligar tudo.
set -e
cd "$(dirname "$0")"

echo ""
echo "🔮 DIVINATIO — preparando o ambiente local..."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js não encontrado. Instale a versão LTS em https://nodejs.org e tente de novo."
  exit 1
fi

# encerra restos de execuções anteriores que estejam ocupando as portas.
# Mata por nome (processos soltos de runs antigas) e por porta, e espera a
# porta da blockchain (8545) ficar realmente livre antes de seguir.
pkill -f "hardhat node" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "backend/server.js" 2>/dev/null || true
if command -v lsof >/dev/null 2>&1; then
  for port in 8545 3001 5173; do
    lsof -ti tcp:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
  # aguarda a porta 8545 liberar (até 10s) para evitar corrida ao reiniciar
  i=0
  while lsof -ti tcp:8545 >/dev/null 2>&1 && [ "$i" -lt 10 ]; do
    sleep 1
    i=$((i + 1))
  done
fi
sleep 1

if [ ! -d node_modules ]; then
  echo "📦 Instalando dependências dos contratos (só na primeira vez)..."
  npm install
fi
if [ ! -d backend/node_modules ]; then
  echo "📦 Instalando dependências da API..."
  (cd backend && npm install)
fi
if [ ! -d frontend/node_modules ]; then
  echo "📦 Instalando dependências do site..."
  (cd frontend && npm install)
fi

cleanup() {
  trap - EXIT INT TERM
  echo ""
  echo "🌙 Encerrando o DIVINATIO..."
  kill 0 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "⛓️  Subindo a blockchain local..."
npx hardhat node > /tmp/divinatio-node.log 2>&1 &

# espera a blockchain responder (até 30s)
i=0
until curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:8545 >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "❌ A blockchain local não respondeu. Veja o log: /tmp/divinatio-node.log"
    exit 1
  fi
  sleep 1
done

echo "🌱 Implantando contratos e mercados de demonstração..."
npx hardhat run scripts/seed.js --network localhost

echo "🛰️  Subindo a API..."
node backend/server.js > /tmp/divinatio-backend.log 2>&1 &

echo "🖥️  Subindo o site..."
(cd frontend && exec npx vite) > /tmp/divinatio-frontend.log 2>&1 &

sleep 4
echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Tudo no ar! Abra no navegador:"
echo ""
echo "      👉  http://localhost:5173"
echo ""
echo "   API:        http://localhost:3001/api/markets"
echo "   Blockchain: http://127.0.0.1:8545 (chain id 31337)"
echo ""
echo "   Pressione Ctrl+C nesta janela para desligar tudo."
echo "═══════════════════════════════════════════════════════"
echo ""
wait
