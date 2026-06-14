const { ethers } = require("hardhat");

// Popula a blockchain com um CATÁLOGO de mercados de demonstração (dezenas),
// variados por categoria, mais um exemplo de copy-staking. Roda no boot do
// serviço hospedado (serve-all.sh) e também localmente.
// Uso: npx hardhat run scripts/seed.js --network localhost
async function main() {
  const all = await ethers.getSigners();
  const s = all.slice(0, 12); // 12 carteiras de demonstração
  const deployer = s[0];

  const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
  const token = await MockStablecoin.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MockStablecoin (dUSD) implantado em:", tokenAddress);

  const Divinatio = await ethers.getContractFactory("Divinatio");
  const divinatio = await Divinatio.deploy(deployer.address, tokenAddress, ethers.parseEther("10"));
  await divinatio.waitForDeployment();
  const address = await divinatio.getAddress();
  console.log("Divinatio implantado em:", address);

  const dusd = (v) => ethers.parseEther(String(v));

  // cada carteira pega dUSD (várias vezes p/ ter saldo) e aprova o protocolo
  for (const signer of s) {
    for (let k = 0; k < 6; k++) await (await token.connect(signer).faucet()).wait();
    await (await token.connect(signer).approve(address, ethers.MaxUint256)).wait();
  }

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const DAY = 24 * 60 * 60;

  // Convenção: linha 1 = pergunta; linhas seguintes = desfechos.
  // stakes: [índiceDaCarteira (0..11), desfecho, valor em dUSD]
  const markets = [
    { q: "Quem vence a Copa do Mundo FIFA 2026?\nBrasil\nArgentina\nFrança\nEspanha\nInglaterra\nOutro", days: 80,
      st: [[1,0,420],[2,1,310],[3,2,150],[4,0,260],[5,3,120],[6,4,90],[7,5,70],[8,1,140]] },
    { q: "Campeão do Brasileirão 2026\nFlamengo\nPalmeiras\nBotafogo\nCorinthians\nOutro", days: 200,
      st: [[1,0,260],[2,1,240],[3,2,110],[9,3,80],[10,4,130],[4,1,90]] },
    { q: "A Libertadores 2026 fica com um clube brasileiro?\nSim\nNão", days: 210,
      st: [[1,0,300],[2,0,180],[3,1,160],[6,1,90]] },
    { q: "Bola de Ouro 2026\nVini Jr.\nMbappé\nHaaland\nOutro", days: 150,
      st: [[2,0,210],[3,1,170],[4,2,140],[5,3,80],[1,0,120]] },
    { q: "Champions League 2025/26\nReal Madrid\nManchester City\nBayern\nPSG\nOutro", days: 120,
      st: [[1,0,190],[7,1,160],[8,2,120],[9,3,150],[10,4,100]] },
    { q: "Fórmula 1 — campeão de 2026\nVerstappen\nNorris\nLeclerc\nOutro", days: 240,
      st: [[2,0,230],[3,1,200],[4,2,90],[5,3,70]] },
    { q: "NBA — campeão de 2026\nCeltics\nThunder\nNuggets\nOutro", days: 90,
      st: [[6,0,140],[7,1,160],[8,2,110],[9,3,130]] },
    { q: "Quem vence o BBB 26?\nNordeste\nSudeste\nSul/Centro-Oeste/Norte", days: 60,
      st: [[1,0,120],[2,1,140],[10,2,90],[3,0,80]] },
    { q: "Algum filme brasileiro indicado a Melhor Filme no Oscar 2027?\nSim\nNão", days: 300,
      st: [[4,0,150],[5,1,170],[6,0,80]] },
    { q: "Eleição presidencial 2026 vai a 2º turno?\nSim\nNão", days: 150,
      st: [[1,0,260],[2,0,220],[7,1,140],[8,1,120],[9,0,100]] },
    { q: "Spotify Wrapped Brasil 2026 — artista mais ouvido\nAna Castela\nHenrique & Juliano\nLuan Pereira\nOutro", days: 180,
      st: [[2,0,130],[3,1,150],[4,2,70],[10,3,110]] },
    { q: "Bitcoin fecha 2026 acima de US$ 150 mil?\nSim\nNão", days: 200,
      st: [[5,0,300],[6,1,260],[7,0,180],[1,1,140]] },
    { q: "GTA 6 é lançado dentro de 2026?\nSim\nNão", days: 260,
      st: [[8,0,170],[9,1,210],[10,0,120]] },
    { q: "A Seleção Brasileira chega à final da Copa 2026?\nSim\nNão", days: 80,
      st: [[1,0,240],[2,1,220],[3,0,140],[4,1,110]] },
    { q: "Palmeiras e Corinthians na final do Paulistão 2026?\nSim\nNão", days: 40,
      st: [[2,0,90],[3,1,160],[5,1,70]] },
    { q: "Anitta emplaca um hit no top 10 global em 2026?\nSim\nNão", days: 220,
      st: [[4,0,130],[6,1,150],[8,0,90]] },
  ];

  let created = 0;
  for (const m of markets) {
    const close = now + m.days * DAY;
    await (await divinatio.connect(deployer).createMarket(m.q, m.q.split("\n").length - 1, close, close + 2 * DAY, 100)).wait();
    const id = Number(await divinatio.marketCount()) - 1;
    for (const [i, outcome, amount] of m.st) {
      await (await divinatio.connect(s[i]).predict(id, outcome, dusd(amount))).wait();
    }
    created++;
  }
  console.log(`${created} mercados criados, em várias categorias.`);

  // exemplo de copy-staking: a carteira 11 segue a carteira 1 e copia o mercado 0
  await (await divinatio.connect(s[11]).follow(s[1].address, dusd(50))).wait();
  await (await divinatio.copyPredict(0, s[1].address, s[11].address)).wait();
  console.log("Copy-staking: carteira seguidora copiou a posição de um Profeta no mercado 0");

  console.log("\nSeed concluído.");
  console.log(`CONTRACT_ADDRESS=${address}`);
  console.log(`TOKEN_ADDRESS=${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
