const { ethers } = require("ethers");
const ABI = require("../shared/DivinatioABI.json");

const STATE_LABELS = ["open", "proposed", "disputed", "resolved", "cancelled"];

// ABI mínimo do ERC-20 para ler metadados (decimals/symbol) do token usado pelo
// protocolo. USDC tem 6 decimais; o dUSD de teste tem 18. O sistema precisa
// saber disso para formatar valores corretamente no frontend.
const TOKEN_META_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

/**
 * Indexador em memória: faz polling do contrato e dos eventos para servir a
 * API sem que cada requisição bata na blockchain. Para produção, trocar por
 * um indexador persistente (The Graph / Ponder / SQLite).
 *
 * Se KEEPER_PRIVATE_KEY estiver definida, o indexador também atua como keeper
 * de copy-staking: quando um profeta seguido tem posição num mercado aberto,
 * executa copyPredict para os seguidores automaticamente.
 */
class Indexer {
  constructor(rpcUrl, contractAddress, pollMs = 5000, startBlock = 0) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(contractAddress, ABI, this.provider);
    this.pollMs = pollMs;
    this.markets = [];
    this.predictionsByMarket = new Map(); // marketId => [{diviner, outcome, amount, txHash, timestamp}]
    this.blockTimestamps = new Map(); // blockNumber => unixSeconds (cache)
    this.diviners = new Map(); // address => stats
    this.follows = new Map(); // follower => Set(prophet)
    this.copied = new Set(); // `${marketId}:${follower}`
    this.copyAttempted = new Set(); // evita reexecutar cópias que revertem
    // Começa a indexar do bloco do deploy (startBlock). Em cadeias públicas
    // (ex.: Base Sepolia) começar do bloco 0 leria milhões de blocos.
    this.lastBlock = startBlock - 1;
    this.ready = false;

    // Metadados do token (lidos uma vez, com cache). Default seguro = dUSD/18.
    this.tokenDecimals = 18;
    this.currencySymbol = "dUSD";
    this.tokenMetaLoaded = false;

    if (process.env.KEEPER_PRIVATE_KEY) {
      const wallet = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY, this.provider);
      this.keeperContract = this.contract.connect(wallet);
      console.log("Keeper de copy-staking ativo:", wallet.address);
    }
  }

  // RPCs públicos (Base Sepolia) limitam eth_getLogs a ~2000 blocos por
  // consulta. Fatia o intervalo em janelas seguras e junta os resultados.
  async queryChunked(filter, from, to) {
    const MAX = 1900;
    let out = [];
    for (let start = from; start <= to; start += MAX) {
      const end = Math.min(start + MAX - 1, to);
      const logs = await this.contract.queryFilter(filter, start, end);
      if (logs.length) out = out.concat(logs);
    }
    return out;
  }

  // Timestamp (unix em segundos) de um bloco, com cache para não repetir
  // chamadas RPC para o mesmo bloco.
  async blockTimestamp(blockNumber) {
    if (this.blockTimestamps.has(blockNumber)) {
      return this.blockTimestamps.get(blockNumber);
    }
    const block = await this.provider.getBlock(blockNumber);
    const ts = block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);
    this.blockTimestamps.set(blockNumber, ts);
    return ts;
  }

  // Lê decimals()/symbol() do token do protocolo UMA vez e cacheia. Resiliente:
  // se a leitura falhar, mantém os defaults (dUSD/18) e tenta de novo depois.
  async loadTokenMeta() {
    if (this.tokenMetaLoaded) return;
    try {
      const tokenAddress = await this.contract.token();
      const token = new ethers.Contract(tokenAddress, TOKEN_META_ABI, this.provider);
      const decimals = Number(await token.decimals());
      if (Number.isFinite(decimals) && decimals >= 0 && decimals <= 36) {
        this.tokenDecimals = decimals;
      }
      try {
        const symbol = await token.symbol();
        if (symbol) this.currencySymbol = symbol;
      } catch {
        /* mantém o símbolo default */
      }
      this.tokenMetaLoaded = true;
    } catch (e) {
      // mantém defaults; tenta de novo no próximo ciclo
      console.error("leitura de decimals/symbol do token falhou (usando defaults):", e.message);
    }
  }

  async start() {
    await this.loadTokenMeta();
    try {
      await this.sync();
    } catch (e) {
      console.error("Sync inicial falhou (tentará novamente):", e.message);
    }
    setInterval(() => this.sync().catch((e) => console.error("sync:", e.message)), this.pollMs);
  }

  async sync() {
    if (this.syncing) return; // evita execuções sobrepostas (e nonces duplicados no keeper)
    this.syncing = true;
    try {
      await this._sync();
    } finally {
      this.syncing = false;
    }
  }

  async _sync() {
    // Garante que os metadados do token estão carregados (caso start() tenha
    // falhado na primeira tentativa). Idempotente após o primeiro sucesso.
    if (!this.tokenMetaLoaded) await this.loadTokenMeta();

    const latest = await this.provider.getBlockNumber();

    // 1) MERCADOS PRIMEIRO (leitura de estado: marketCount/getMarket). Carrega
    // sempre, mesmo que a leitura de EVENTOS abaixo falhe no RPC público.
    const count = Number(await this.contract.marketCount());
    const markets = [];
    for (let id = 0; id < count; id++) {
      const m = await this.contract.getMarket(id);
      const pools = m.pools.map((p) => p.toString());
      const total = m.pools.reduce((acc, p) => acc + p, 0n);
      markets.push({
        id,
        creator: m.creator,
        question: m.question,
        outcomeCount: Number(m.outcomeCount),
        closeTime: Number(m.closeTime),
        resolutionDeadline: Number(m.resolutionDeadline),
        state: STATE_LABELS[Number(m.state)],
        finalOutcome: Number(m.state) === 3 ? Number(m.finalOutcome) : null,
        pools,
        totalPool: total.toString(),
        predictionCount: (this.predictionsByMarket.get(id) || []).length,
      });
    }
    this.markets = markets;
    this.ready = true;

    // 2) EVENTOS (apostas/follows) e reputação — RESILIENTE: se o RPC público
    // falhar aqui (rate limit, etc.), os mercados continuam carregados e
    // tenta-se de novo no próximo ciclo.
    try {
      const from = Math.max(0, this.lastBlock + 1);
      if (latest >= from) {
        const [predicted, followed, unfollowed, copied] = await Promise.all([
          this.queryChunked(this.contract.filters.Predicted(), from, latest),
          this.queryChunked(this.contract.filters.Followed(), from, latest),
          this.queryChunked(this.contract.filters.Unfollowed(), from, latest),
          this.queryChunked(this.contract.filters.Copied(), from, latest),
        ]);
        for (const ev of predicted) {
          const marketId = Number(ev.args.marketId);
          if (!this.predictionsByMarket.has(marketId)) {
            this.predictionsByMarket.set(marketId, []);
          }
          const timestamp = await this.blockTimestamp(ev.blockNumber);
          this.predictionsByMarket.get(marketId).push({
            diviner: ev.args.diviner,
            outcome: Number(ev.args.outcome),
            amount: ev.args.amount.toString(),
            txHash: ev.transactionHash,
            timestamp,
          });
        }
        for (const ev of followed) {
          if (!this.follows.has(ev.args.follower)) this.follows.set(ev.args.follower, new Set());
          this.follows.get(ev.args.follower).add(ev.args.prophet);
        }
        for (const ev of unfollowed) {
          this.follows.get(ev.args.follower)?.delete(ev.args.prophet);
        }
        for (const ev of copied) {
          this.copied.add(`${Number(ev.args.marketId)}:${ev.args.follower}`);
        }
        this.lastBlock = latest;
        // reflete as apostas recém-lidas na contagem dos mercados já carregados
        for (const mk of this.markets) {
          mk.predictionCount = (this.predictionsByMarket.get(mk.id) || []).length;
        }
      }

      // Reputação dos profetas (endereços vistos nos eventos)
      const addresses = new Set();
      for (const preds of this.predictionsByMarket.values()) {
        for (const p of preds) addresses.add(p.diviner);
      }
      const diviners = new Map();
      for (const addr of addresses) {
        const s = await this.contract.diviners(addr);
        const accuracy = await this.contract.accuracyBps(addr);
        const followers = [...this.follows.entries()].filter(([, set]) => set.has(addr)).length;
        diviners.set(addr, {
          address: addr,
          predictions: Number(s.predictions),
          hits: Number(s.hits),
          volume: s.volume.toString(),
          accuracyBps: Number(accuracy),
          followers,
        });
      }
      this.diviners = diviners;
    } catch (e) {
      console.error("sync de eventos falhou (mercados ok, tenta de novo):", e.message);
    }

    if (this.keeperContract) {
      try {
        await this.runKeeper();
      } catch (e) {
        console.error("keeper:", e.message);
      }
    }
  }

  /** Executa cópias pendentes de copy-staking para mercados abertos. */
  async runKeeper() {
    const now = Math.floor(Date.now() / 1000);
    const openMarkets = this.markets.filter((m) => m.state === "open" && m.closeTime > now);
    for (const market of openMarkets) {
      const prophets = new Set(
        (this.predictionsByMarket.get(market.id) || []).map((p) => p.diviner)
      );
      for (const [follower, set] of this.follows.entries()) {
        for (const prophet of set) {
          const key = `${market.id}:${follower}`;
          if (!prophets.has(prophet) || this.copied.has(key) || this.copyAttempted.has(key)) {
            continue;
          }
          this.copyAttempted.add(key);
          try {
            const tx = await this.keeperContract.copyPredict(market.id, prophet, follower);
            await tx.wait();
            this.copied.add(key);
            console.log(`Keeper: copiou ${prophet} → ${follower} no mercado ${market.id}`);
          } catch (e) {
            const msg = e.shortMessage || e.message;
            console.warn(`Keeper: cópia falhou (${key}):`, msg);
            // erros transitórios (nonce/rede) são retentados; reverts do
            // contrato (sem saldo/allowance do seguidor) não.
            if (/nonce|network|timeout/i.test(msg)) this.copyAttempted.delete(key);
          }
        }
      }
    }
  }

  // Metadados do token para o /api/config (decimais + símbolo da moeda).
  getTokenMeta() {
    return { tokenDecimals: this.tokenDecimals, currencySymbol: this.currencySymbol };
  }

  getMarkets() {
    return this.markets;
  }

  getMarket(id) {
    const market = this.markets.find((m) => m.id === id);
    if (!market) return null;
    return {
      ...market,
      predictions: (this.predictionsByMarket.get(id) || []).slice(-50).reverse(),
    };
  }

  /**
   * Série temporal das probabilidades implícitas de cada desfecho. Parte de
   * pools zerados e, aplicando cada aposta em ordem cronológica, calcula a
   * probabilidade implícita = pool_do_desfecho / pool_total (em %).
   * Retorna [{ t: <unixSeconds>, probs: [p0, p1, ...] }, ...]. Sem apostas: [].
   */
  getMarketHistory(id) {
    const market = this.markets.find((m) => m.id === id);
    const preds = (this.predictionsByMarket.get(id) || [])
      .filter((p) => Number.isFinite(p.timestamp))
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
    if (!preds.length) return [];

    const n = market ? market.outcomeCount : Math.max(...preds.map((p) => p.outcome)) + 1;
    const pools = new Array(n).fill(0n);
    const series = [];

    // Ponto inicial: tudo zerado => probabilidades uniformes, no instante da
    // primeira aposta (para a linha começar a partir do início real).
    const even = Math.round((100 / n) * 100) / 100;
    series.push({ t: preds[0].timestamp, probs: pools.map(() => even) });

    for (const p of preds) {
      const idx = p.outcome;
      if (idx < 0 || idx >= n) continue;
      pools[idx] += BigInt(p.amount);
      const total = pools.reduce((acc, q) => acc + q, 0n);
      const probs =
        total === 0n
          ? pools.map(() => even)
          : pools.map((q) => Number((q * 10000n) / total) / 100);
      series.push({ t: p.timestamp, probs });
    }
    return series;
  }

  getLeaderboard() {
    return [...this.diviners.values()].sort(
      (a, b) => b.accuracyBps - a.accuracyBps || Number(BigInt(b.volume) - BigInt(a.volume))
    );
  }

  getStats() {
    const totalVolume = this.markets.reduce((acc, m) => acc + BigInt(m.totalPool), 0n);
    const predictions = [...this.predictionsByMarket.values()].reduce(
      (acc, p) => acc + p.length,
      0
    );
    return {
      markets: this.markets.length,
      openMarkets: this.markets.filter((m) => m.state === "open").length,
      totalVolume: totalVolume.toString(),
      predictions,
      diviners: this.diviners.size,
    };
  }
}

module.exports = { Indexer };
