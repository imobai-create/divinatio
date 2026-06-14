const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { Indexer } = require("./indexer");
const { mockApi } = require("./mock");

// Modo vitrine: serve dados de demonstração sem blockchain (MOCK=1).
const MOCK = process.env.MOCK === "1";

// CHAIN_MODE controla onde a blockchain vive:
//   "local"  (padrão) = nó interno do Hardhat + seed de demo; o backend expõe
//                        a ponte /rpc e a torneira de gás /api/gas.
//   "public"          = cadeia EXTERNA e permanente (ex.: Base Sepolia); o
//                        backend apenas INDEXA via RPC_URL. SEM ponte /rpc e
//                        SEM torneira de gás (gás vem de faucet externo).
const CHAIN_MODE = process.env.CHAIN_MODE || "local";
const PUBLIC = CHAIN_MODE === "public";

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

// chainId padrão: 84532 (Base Sepolia) no modo public; 31337 (Hardhat) no local.
const CHAIN_ID = Number(process.env.CHAIN_ID || (PUBLIC ? 84532 : 31337));

// configuração que o frontend consome em runtime (evita rebuild por endereço).
// publicRpcUrl = endereço pelo qual a MetaMask fala com a blockchain:
//   - local:  a ponte /rpc deste servidor (a blockchain roda interna);
//   - public: o RPC público REAL (RPC_URL), para a MetaMask falar direto com
//             a cadeia externa (ex.: https://sepolia.base.org).
app.get("/api/config", (req, res) => {
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || req.protocol;
  res.json({
    contractAddress: CONTRACT_ADDRESS,
    tokenAddress: TOKEN_ADDRESS,
    rpcUrl: RPC_URL,
    publicRpcUrl: PUBLIC ? RPC_URL : `${proto}://${host}/rpc`,
    chainId: CHAIN_ID,
    mock: MOCK,
    chainMode: CHAIN_MODE,
  });
});

// Ponte JSON-RPC e torneira de gás existem APENAS no modo local (sem MOCK).
// No modo public, a MetaMask fala direto com o RPC público e o gás vem de
// faucet externo — nossa torneira gastaria ETH de teste real do deployer.
if (!MOCK && !PUBLIC) {
  app.post("/rpc", async (req, res) => {
    try {
      const upstream = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: "rpc proxy indisponível", detail: e.message });
    }
  });

  // Torneira de gás: envia um pouco de ETH de teste para o endereço informado,
  // para que visitantes consigam pagar o gás das transações (apostar etc.).
  // Conta pagadora = conta #0 da rede de teste do Hardhat (chave pública e
  // conhecida; só vale nesta rede de teste, sem valor real).
  const { ethers } = require("ethers");
  const GAS_FAUCET_KEY =
    process.env.GAS_FAUCET_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const gasGiven = new Map(); // address -> timestamp (limite simples por endereço)
  app.post("/api/gas", async (req, res) => {
    try {
      const address = String(req.query.address || req.body.address || "");
      if (!ethers.isAddress(address)) {
        return res.status(400).json({ error: "endereço inválido" });
      }
      const last = gasGiven.get(address.toLowerCase());
      if (last && Date.now() - last < 60_000) {
        return res.json({ ok: true, skipped: "já recebeu há pouco" });
      }
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(GAS_FAUCET_KEY, provider);
      const balance = await provider.getBalance(address);
      if (balance < ethers.parseEther("0.5")) {
        const tx = await wallet.sendTransaction({ to: address, value: ethers.parseEther("1") });
        await tx.wait();
        gasGiven.set(address.toLowerCase(), Date.now());
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(502).json({ error: "torneira de gás indisponível", detail: e.message });
    }
  });
}

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
      console.log(`Modo ${CHAIN_MODE.toUpperCase()} | Contrato: ${CONTRACT_ADDRESS} | RPC: ${RPC_URL} | chainId: ${CHAIN_ID}`);
      if (PUBLIC) console.log("Ponte /rpc e torneira /api/gas DESATIVADAS (cadeia pública externa).");
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
