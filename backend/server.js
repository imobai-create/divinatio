const express = require("express");
const cors = require("cors");
const { Indexer } = require("./indexer");

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const app = express();
app.use(cors());
app.use(express.json());

const indexer = new Indexer(RPC_URL, CONTRACT_ADDRESS);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, ready: indexer.ready, contract: CONTRACT_ADDRESS });
});

app.get("/api/markets", (req, res) => {
  let markets = indexer.getMarkets();
  if (req.query.state) markets = markets.filter((m) => m.state === req.query.state);
  res.json(markets);
});

app.get("/api/markets/:id", (req, res) => {
  const market = indexer.getMarket(Number(req.params.id));
  if (!market) return res.status(404).json({ error: "mercado não encontrado" });
  res.json(market);
});

app.get("/api/leaderboard", (req, res) => {
  res.json(indexer.getLeaderboard());
});

app.get("/api/stats", (req, res) => {
  res.json(indexer.getStats());
});

indexer
  .start()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`DIVINATIO API ouvindo em http://localhost:${PORT}`);
      console.log(`Contrato: ${CONTRACT_ADDRESS} | RPC: ${RPC_URL}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar o indexador:", error.message);
    process.exit(1);
  });
