const { ethers } = require("ethers");
const ABI = require("../shared/DivinatioABI.json");

const STATE_LABELS = ["open", "proposed", "disputed", "resolved", "cancelled"];

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
  constructor(rpcUrl, contractAddress, pollMs = 5000) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(contractAddress, ABI, this.provider);
    this.pollMs = pollMs;
    this.markets = [];
    this.predictionsByMarket = new Map(); // marketId => [{diviner, outcome, amount, txHash}]
    this.diviners = new Map(); // address => stats
    this.follows = new Map(); // follower => Set(prophet)
    this.copied = new Set(); // `${marketId}:${follower}`
    this.copyAttempted = new Set(); // evita reexecutar cópias que revertem
    this.lastBlock = 0;
    this.ready = false;

    if (process.env.KEEPER_PRIVATE_KEY) {
      const wallet = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY, this.provider);
      this.keeperContract = this.contract.connect(wallet);
      console.log("Keeper de copy-staking ativo:", wallet.address);
    }
  }

  async start() {
    await this.sync();
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
    const latest = await this.provider.getBlockNumber();

    // Eventos novos desde o último bloco sincronizado
    const from = this.lastBlock + (this.lastBlock > 0 ? 1 : 0);
    if (latest >= from) {
      const [predicted, followed, unfollowed, copied] = await Promise.all([
        this.contract.queryFilter(this.contract.filters.Predicted(), from, latest),
        this.contract.queryFilter(this.contract.filters.Followed(), from, latest),
        this.contract.queryFilter(this.contract.filters.Unfollowed(), from, latest),
        this.contract.queryFilter(this.contract.filters.Copied(), from, latest),
      ]);
      for (const ev of predicted) {
        const marketId = Number(ev.args.marketId);
        if (!this.predictionsByMarket.has(marketId)) {
          this.predictionsByMarket.set(marketId, []);
        }
        this.predictionsByMarket.get(marketId).push({
          diviner: ev.args.diviner,
          outcome: Number(ev.args.outcome),
          amount: ev.args.amount.toString(),
          txHash: ev.transactionHash,
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
    }

    // Estado atual de todos os mercados
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
    this.ready = true;

    if (this.keeperContract) await this.runKeeper();
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
