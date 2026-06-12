const { ethers } = require("ethers");
const ABI = require("../shared/DivinatioABI.json");

const STATE_LABELS = ["open", "proposed", "disputed", "resolved", "cancelled"];

/**
 * Indexador em memória: faz polling do contrato e dos eventos para servir a
 * API sem que cada requisição bata na blockchain. Para produção, trocar por
 * um indexador persistente (The Graph / Ponder / SQLite).
 */
class Indexer {
  constructor(rpcUrl, contractAddress, pollMs = 5000) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(contractAddress, ABI, this.provider);
    this.pollMs = pollMs;
    this.markets = [];
    this.predictionsByMarket = new Map(); // marketId => [{diviner, outcome, amount, txHash}]
    this.diviners = new Map(); // address => stats
    this.lastBlock = 0;
    this.ready = false;
  }

  async start() {
    await this.sync();
    setInterval(() => this.sync().catch((e) => console.error("sync:", e.message)), this.pollMs);
  }

  async sync() {
    const latest = await this.provider.getBlockNumber();

    // Eventos novos desde o último bloco sincronizado
    const from = this.lastBlock + (this.lastBlock > 0 ? 1 : 0);
    if (latest >= from) {
      const events = await this.contract.queryFilter(
        this.contract.filters.Predicted(),
        from,
        latest
      );
      for (const ev of events) {
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
        this.divinersDirty = true;
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
      diviners.set(addr, {
        address: addr,
        predictions: Number(s.predictions),
        hits: Number(s.hits),
        volume: s.volume.toString(),
        accuracyBps: Number(accuracy),
      });
    }
    this.diviners = diviners;
    this.ready = true;
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
