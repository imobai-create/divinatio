// Dados de demonstração para o "modo vitrine" (MOCK=1): permite ver o site
// completo, com mercados, odds e Profetas, SEM precisar de blockchain nem
// compilar contrato. As apostas via carteira não funcionam neste modo (não há
// blockchain) — é só para visualizar o produto.

const DAY = 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
const eth = (n) => (BigInt(Math.round(n * 1000)) * 10n ** 15n).toString(); // n -> wei

function buildMarkets() {
  const t = now();
  return [
    {
      id: 0,
      creator: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      question: "Quem vence a Copa do Mundo FIFA 2026?\nBrasil\nArgentina\nFrança\nOutro",
      outcomeCount: 4,
      closeTime: t + 29 * DAY,
      resolutionDeadline: t + 31 * DAY,
      state: "open",
      finalOutcome: null,
      pools: [eth(370), eth(180), eth(90), eth(40)],
      totalPool: eth(680),
      predictionCount: 5,
      predictions: [
        { diviner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", outcome: 0, amount: eth(250) },
        { diviner: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", outcome: 1, amount: eth(180) },
        { diviner: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", outcome: 2, amount: eth(90) },
        { diviner: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", outcome: 0, amount: eth(120) },
        { diviner: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", outcome: 3, amount: eth(40) },
      ],
    },
    {
      id: 1,
      creator: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      question: "O Brasileirão 2026 será decidido na última rodada?\nSim\nNão",
      outcomeCount: 2,
      closeTime: t + 59 * DAY,
      resolutionDeadline: t + 61 * DAY,
      state: "open",
      finalOutcome: null,
      pools: [eth(70), eth(160)],
      totalPool: eth(230),
      predictionCount: 3,
      predictions: [
        { diviner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", outcome: 0, amount: eth(70) },
        { diviner: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", outcome: 1, amount: eth(110) },
        { diviner: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", outcome: 1, amount: eth(50) },
      ],
    },
    {
      id: 2,
      creator: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      question:
        "Qual artista brasileiro lidera o Spotify Wrapped 2026?\nAna Castela\nHenrique & Juliano\nOutro",
      outcomeCount: 3,
      closeTime: t + 89 * DAY,
      resolutionDeadline: t + 91 * DAY,
      state: "open",
      finalOutcome: null,
      pools: [eth(30), eth(60), eth(20)],
      totalPool: eth(110),
      predictionCount: 3,
      predictions: [
        { diviner: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", outcome: 0, amount: eth(30) },
        { diviner: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", outcome: 1, amount: eth(60) },
        { diviner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", outcome: 2, amount: eth(20) },
      ],
    },
  ];
}

const LEADERBOARD = [
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", predictions: 3, hits: 2, volume: eth(340), accuracyBps: 6666, followers: 2 },
  { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", predictions: 3, hits: 1, volume: eth(260), accuracyBps: 3333, followers: 0 },
  { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", predictions: 2, hits: 1, volume: eth(250), accuracyBps: 5000, followers: 1 },
  { address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", predictions: 2, hits: 0, volume: eth(170), accuracyBps: 0, followers: 0 },
];

function mockApi() {
  const markets = buildMarkets();
  return {
    markets: () => markets.map(({ predictions, ...m }) => m),
    market: (id) => markets.find((m) => m.id === id) || null,
    leaderboard: () => LEADERBOARD,
    stats: () => ({
      markets: markets.length,
      openMarkets: markets.filter((m) => m.state === "open").length,
      totalVolume: markets.reduce((acc, m) => acc + BigInt(m.totalPool), 0n).toString(),
      predictions: markets.reduce((acc, m) => acc + m.predictionCount, 0),
      diviners: LEADERBOARD.length,
    }),
  };
}

module.exports = { mockApi };
