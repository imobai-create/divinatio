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
// START_BLOCK = bloco do deploy (evita varrer milhões de blocos numa cadeia pública).
const START_BLOCK = Number(process.env.START_BLOCK || 0);
// Intervalo de polling do indexador (8s por padrão): menos carga no RPC público.
const POLL_MS = Number(process.env.POLL_MS) || 8000;
const indexer = MOCK ? null : new Indexer(RPC_URL, CONTRACT_ADDRESS, POLL_MS, START_BLOCK);

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

// Ponte JSON-RPC: só no modo local (no público a carteira fala direto com o RPC).
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
}

// Torneira de gás: a carteira invisível (Privy) nasce SEM ETH, então não
// consegue pagar o gás das transações (faucet de dUSD, apostar...). Aqui o
// servidor envia um pouquinho de ETH de teste para o endereço.
//   - local:  paga com a conta de teste do Hardhat (chave conhecida);
//   - public: exige GAS_FAUCET_KEY = chave de uma carteira COM ETH de teste da
//             Base Sepolia (ex.: a carteira de deploy, reabastecida no faucet).
if (!MOCK) {
  const { ethers } = require("ethers");
  const DEFAULT_LOCAL_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  let rawKey = process.env.GAS_FAUCET_KEY || (PUBLIC ? "" : DEFAULT_LOCAL_KEY);
  if (rawKey && !rawKey.startsWith("0x")) rawKey = "0x" + rawKey;
  const GAS_FAUCET_KEY = rawKey;
  // valores conforme a rede: na Base Sepolia o gás é baratíssimo, então um
  // pouquinho dá para dezenas de transações. Mantido baixo para o "tanque"
  // (GAS_FAUCET_KEY) durar e funcionar mesmo com saldo pequeno.
  const GIVE = PUBLIC ? ethers.parseEther("0.00005") : ethers.parseEther("1");
  const MIN = PUBLIC ? ethers.parseEther("0.00002") : ethers.parseEther("0.5");
  const gasGiven = new Map(); // address -> timestamp (limite por endereço)

  app.post("/api/gas", async (req, res) => {
    try {
      if (!GAS_FAUCET_KEY) {
        return res.json({ ok: false, reason: "torneira de gás não configurada (defina GAS_FAUCET_KEY)" });
      }
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
      if (balance < MIN) {
        const tx = await wallet.sendTransaction({ to: address, value: GIVE });
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

app.get("/api/markets/:id/history", (req, res) => {
  const id = Number(req.params.id);
  res.json(MOCK ? source.history(id) : indexer.getMarketHistory(id));
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
  // Inicia o servidor IMEDIATAMENTE para que o healthcheck passe.
  // O indexador sincroniza em segundo plano; /api/health reporta ready=false
  // até a primeira sync completar. Se a sync inicial falhar, o setInterval
  // dentro de indexer.start() continua tentando automaticamente.
  listen();
  indexer
    .start()
    .catch((error) => {
      console.error("Falha ao iniciar o indexador (tentará novamente):", error.message);
    });
}
