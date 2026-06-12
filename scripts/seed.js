const { ethers } = require("hardhat");

// Popula a rede local com mercados e previsões de demonstração.
// Uso: npx hardhat run scripts/seed.js --network localhost
async function main() {
  const [deployer, alice, bob, carol, dave] = await ethers.getSigners();

  const Divinatio = await ethers.getContractFactory("Divinatio");
  const divinatio = await Divinatio.deploy(deployer.address);
  await divinatio.waitForDeployment();
  const address = await divinatio.getAddress();
  console.log("Divinatio implantado em:", address);

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const DAY = 24 * 60 * 60;

  // Convenção de rótulos: linha 1 é a pergunta; as linhas seguintes nomeiam
  // os desfechos (o frontend interpreta esse formato).
  const markets = [
    {
      question: "Quem vence a Copa do Mundo FIFA 2026?\nBrasil\nArgentina\nFrança\nOutro",
      outcomes: 4,
      close: now + 30 * DAY,
      deadline: now + 32 * DAY,
      stakes: [
        [alice, 0, "2.5"],
        [bob, 1, "1.8"],
        [carol, 2, "0.9"],
        [dave, 0, "1.2"],
        [bob, 3, "0.4"],
      ],
    },
    {
      question: "O Brasileirão 2026 será decidido na última rodada?\nSim\nNão",
      outcomes: 2,
      close: now + 60 * DAY,
      deadline: now + 62 * DAY,
      stakes: [
        [alice, 0, "0.7"],
        [carol, 1, "1.1"],
        [dave, 1, "0.5"],
      ],
    },
    {
      question:
        "Qual artista brasileiro lidera o Spotify Wrapped 2026?\nAna Castela\nHenrique & Juliano\nOutro",
      outcomes: 3,
      close: now + 90 * DAY,
      deadline: now + 92 * DAY,
      stakes: [
        [bob, 0, "0.3"],
        [carol, 1, "0.6"],
        [alice, 2, "0.2"],
      ],
    },
  ];

  for (const m of markets) {
    const tx = await divinatio
      .connect(deployer)
      .createMarket(m.question, m.outcomes, m.close, m.deadline, 100);
    await tx.wait();
    const id = (await divinatio.marketCount()) - 1n;
    for (const [signer, outcome, eth] of m.stakes) {
      await (
        await divinatio
          .connect(signer)
          .predict(id, outcome, { value: ethers.parseEther(eth) })
      ).wait();
    }
    console.log(`Mercado ${id}: "${m.question}" com ${m.stakes.length} previsões`);
  }

  console.log("\nSeed concluído. Exporte para o backend/frontend:");
  console.log(`CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
