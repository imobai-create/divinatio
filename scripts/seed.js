const { ethers } = require("hardhat");

// Popula a rede local com mercados e previsões de demonstração, incluindo um
// exemplo de copy-staking (dave segue alice).
// Uso: npx hardhat run scripts/seed.js --network localhost
async function main() {
  const [deployer, alice, bob, carol, dave] = await ethers.getSigners();
  const signers = [deployer, alice, bob, carol, dave];

  const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
  const token = await MockStablecoin.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MockStablecoin (dUSD) implantado em:", tokenAddress);

  const Divinatio = await ethers.getContractFactory("Divinatio");
  const divinatio = await Divinatio.deploy(
    deployer.address,
    tokenAddress,
    ethers.parseEther("10")
  );
  await divinatio.waitForDeployment();
  const address = await divinatio.getAddress();
  console.log("Divinatio implantado em:", address);

  // todos pegam dUSD no faucet e aprovam o protocolo
  for (const s of signers) {
    await (await token.connect(s).faucet()).wait();
    await (await token.connect(s).approve(address, ethers.MaxUint256)).wait();
  }

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const DAY = 24 * 60 * 60;
  const dusd = (v) => ethers.parseEther(String(v));

  // Convenção de rótulos: linha 1 é a pergunta; as linhas seguintes nomeiam
  // os desfechos (o frontend interpreta esse formato).
  const markets = [
    {
      question: "Quem vence a Copa do Mundo FIFA 2026?\nBrasil\nArgentina\nFrança\nOutro",
      outcomes: 4,
      close: now + 30 * DAY,
      deadline: now + 32 * DAY,
      stakes: [
        [alice, 0, 250],
        [bob, 1, 180],
        [carol, 2, 90],
        [dave, 0, 120],
        [bob, 3, 40],
      ],
    },
    {
      question: "O Brasileirão 2026 será decidido na última rodada?\nSim\nNão",
      outcomes: 2,
      close: now + 60 * DAY,
      deadline: now + 62 * DAY,
      stakes: [
        [alice, 0, 70],
        [carol, 1, 110],
        [dave, 1, 50],
      ],
    },
    {
      question:
        "Qual artista brasileiro lidera o Spotify Wrapped 2026?\nAna Castela\nHenrique & Juliano\nOutro",
      outcomes: 3,
      close: now + 90 * DAY,
      deadline: now + 92 * DAY,
      stakes: [
        [bob, 0, 30],
        [carol, 1, 60],
        [alice, 2, 20],
      ],
    },
  ];

  for (const m of markets) {
    const tx = await divinatio
      .connect(deployer)
      .createMarket(m.question, m.outcomes, m.close, m.deadline, 100);
    await tx.wait();
    const id = (await divinatio.marketCount()) - 1n;
    for (const [signer, outcome, amount] of m.stakes) {
      await (await divinatio.connect(signer).predict(id, outcome, dusd(amount))).wait();
    }
    console.log(`Mercado ${id}: "${m.question.split("\n")[0]}" com ${m.stakes.length} previsões`);
  }

  // demonstração de copy-staking: dave segue alice e a cópia é executada no mercado 0
  await (await divinatio.connect(dave).follow(alice.address, dusd(25))).wait();
  await (await divinatio.copyPredict(0, alice.address, dave.address)).wait();
  console.log("Copy-staking: dave seguiu alice (25 dUSD/mercado) e copiou o mercado 0");

  console.log("\nSeed concluído. Exporte para o backend/frontend:");
  console.log(`CONTRACT_ADDRESS=${address}`);
  console.log(`TOKEN_ADDRESS=${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
