const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { Indexer } = require("./indexer");
const { mockApi } = require("./mock");

// Modo vitrine: serve dados de demonstração sem blockchain (MOCK=1).
const MOCK = process.env.MOCK === "1";

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
// padrão = endereços determinísticos do scripts/seed.js na rede local do Hardhat
const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const TOKEN_ADDRESS =
  process.env.TOKEN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const app = express();
app.use(cors());
app.use(express.json());

// No modo vitrine, a fonte de dados é o mock; senão, o indexador on-chain.
const source = MOCK ? mockApi() : null;
const indexer = MOCK ? null : new Indexer(RPC_URL, CONTRACT_ADDRESS);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, ready: MOCK ? true : indexer.ready, mock: MOCK, contract: CONTRACT_ADDRESS, token: TOKEN_ADDRESS });
});

// configuração que o frontend consome em runtime (evita rebuild por endereço)
app.get("/api/config", (req, res) => {
  res.json({ contractAddress: CONTRACT_ADDRESS, tokenAddress: TOKEN_ADDRESS, rpcUrl: RPC_URL, mock: MOCK });
});

app.get("/api/markets", (req, res) => {
  let markets = MOCK ? source.markets() : indexer.getMarkets();
  if (req.query.state) markets = markets.filter((m) => m.state === req.query.state);
  res.json(markets);
});

app.get("/api/markets/:id", (req, res) => {
  const market = MOCK ? source.market(Number(req.params.id)) : indexer.getMarket(Number(req.params.id));
  if (!market) return res.status(404).json({ error: "mercado não encontrado" });
  res.json(market);
});

app.get("/api/leaderboard", (req, res) => {
  res.json(MOCK ? source.leaderboard() : indexer.getLeaderboard());
});

app.get("/api/stats", (req, res) => {
  res.json(MOCK ? source.stats() : indexer.getStats());
});

// Em produção (Railway), o backend também serve o frontend compilado.
const distDir = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(distDir, "index.html")));
  console.log("Servindo frontend estático de", distDir);
}

function listen() {
  app.listen(PORT, () => {
    console.log(`DIVINATIO API ouvindo em http://localhost:${PORT}`);
    if (MOCK) {
      console.log("Modo VITRINE (dados de demonstração, sem blockchain).");
    } else {
      console.log(`Contrato: ${CONTRACT_ADDRESS} | RPC: ${RPC_URL}`);
    }
  });
}

if (MOCK) {
  listen();
} else {
  indexer
    .start()
    .then(listen)
    .catch((error) => {
      console.error("Falha ao iniciar o indexador:", error.message);
      process.exit(1);
    });
}
