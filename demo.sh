#!/usr/bin/env bash
# DIVINATIO — MODO VITRINE
# Mostra o site completo (mercados, odds, Profetas) com dados de demonstração,
# SEM blockchain e SEM compilar contrato. É o jeito mais simples de ver o
# produto funcionando. As apostas via carteira não funcionam aqui (não há
# blockchain) — para isso, use o ./start.sh ou o site publicado.
#
#   ./demo.sh
#
# Ctrl+C desliga tudo.
set -e
cd "$(dirname "$0")"

echo ""
echo "🔮 DIVINATIO — modo vitrine (sem blockchain)..."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js não encontrado. Instale a versão LTS em https://nodejs.org"
  exit 1
fi

# encerra restos de execuções anteriores
pkill -f "vite" 2>/dev/null || true
pkill -f "backend/server.js" 2>/dev/null || true
if command -v lsof >/dev/null 2>&1; then
  for port in 3001 5173; do
    lsof -ti tcp:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
fi
sleep 1

if [ ! -d backend/node_modules ]; then
  echo "📦 Instalando dependências da API (só na primeira vez)..."
  (cd backend && npm install)
fi
if [ ! -d frontend/node_modules ]; then
  echo "📦 Instalando dependências do site (só na primeira vez)..."
  (cd frontend && npm install)
fi

cleanup() {
  trap - EXIT INT TERM
  echo ""
  echo "🌙 Encerrando o DIVINATIO..."
  kill 0 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "🛰️  Subindo a API (modo vitrine)..."
MOCK=1 node backend/server.js > /tmp/divinatio-backend.log 2>&1 &

echo "🖥️  Subindo o site..."
(cd frontend && exec npx vite) > /tmp/divinatio-frontend.log 2>&1 &

# espera o site responder (até 40s)
i=0
until curl -s -o /dev/null http://localhost:5173/ 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 40 ]; then
    echo "❌ O site não respondeu. Veja: /tmp/divinatio-frontend.log"
    tail -20 /tmp/divinatio-frontend.log
    exit 1
  fi
  sleep 1
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Pronto! Abra no navegador:"
echo ""
echo "      👉  http://localhost:5173"
echo ""
echo "   (Modo vitrine: dados de demonstração, sem blockchain.)"
echo "   Pressione Ctrl+C nesta janela para desligar."
echo "═══════════════════════════════════════════════════════"
echo ""
wait
