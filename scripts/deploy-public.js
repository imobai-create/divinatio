const { ethers } = require("hardhat");

// Deploy para uma cadeia PÚBLICA e PERMANENTE (ex.: Base Sepolia, chainId 84532).
//
// Diferente do scripts/seed.js (que é o seed de DEMONSTRAÇÃO local, com previsões
// e copy-staking FAKE de 12 carteiras), este script:
//   - implanta MockStablecoin (dUSD) + Divinatio;
//   - cria um conjunto CURADO de mercados REAIS (mesma lista do seed),
//     mas SEM nenhuma chamada predict() e SEM copy-staking — só createMarket;
//   - é idempotente: se CONTRACT_ADDRESS e TOKEN_ADDRESS já vierem no ambiente,
//     NÃO reimplanta (apenas informa que já existe).
//
// Uso (TESTNET, implanta o dUSD de 18 decimais):
//   PRIVATE_KEY=0x... USE_LOCAL_SOLC=1 npx hardhat run scripts/deploy-public.js --network baseSepolia
//
// Uso (MAINNET, usa um token JÁ EXISTENTE — ex.: USDC real, 6 decimais):
//   Defina TOKEN_ADDRESS para NÃO implantar o dUSD e usar o token existente.
//   O resolutionBond é calculado nos decimais REAIS desse token.
//   USDC na Base mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimais)
//     PRIVATE_KEY=0x... TOKEN_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
//     RESOLUTION_BOND=10 USE_LOCAL_SOLC=1 \
//     npx hardhat run scripts/deploy-public.js --network base
async function main() {
  // Idempotência: já implantado? Só informa e sai.
  if (process.env.CONTRACT_ADDRESS && process.env.TOKEN_ADDRESS) {
    console.log("Contratos já implantados (via ambiente) — nada a fazer.");
    console.log(`CONTRACT_ADDRESS=${process.env.CONTRACT_ADDRESS}`);
    console.log(`TOKEN_ADDRESS=${process.env.TOKEN_ADDRESS}`);
    return;
  }

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log("Deployer:", deployer.address);
  console.log("Rede:", net.name || "?", "chainId:", Number(net.chainId));

  // 1) Token do protocolo.
  //   - Se TOKEN_ADDRESS estiver definido (ex.: USDC real na mainnet), usamos o
  //     token EXISTENTE e NÃO implantamos o dUSD de teste.
  //   - Caso contrário (testnet), implantamos o MockStablecoin (dUSD, 18 dec,
  //     com faucet público).
  let tokenAddress;
  let tokenDecimals;
  if (process.env.TOKEN_ADDRESS) {
    tokenAddress = process.env.TOKEN_ADDRESS;
    // lê os decimais REAIS do token (USDC = 6) para dimensionar o bond
    const erc20 = new ethers.Contract(
      tokenAddress,
      ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
      deployer
    );
    tokenDecimals = Number(await erc20.decimals());
    let sym = "?";
    try { sym = await erc20.symbol(); } catch { /* alguns tokens não expõem symbol */ }
    console.log(`Usando token EXISTENTE: ${tokenAddress} (symbol=${sym}, decimais=${tokenDecimals})`);
  } else {
    const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
    const token = await MockStablecoin.deploy();
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    tokenDecimals = 18;
    console.log("MockStablecoin (dUSD) implantado em:", tokenAddress);
  }

  // 2) protocolo
  // bond nas unidades REAIS do token (USDC=6 → "10" = 10_000_000; dUSD=18).
  const bond = ethers.parseUnits(process.env.RESOLUTION_BOND || "10", tokenDecimals);
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const Divinatio = await ethers.getContractFactory("Divinatio");
  const divinatio = await Divinatio.deploy(treasury, tokenAddress, bond);
  await divinatio.waitForDeployment();
  const address = await divinatio.getAddress();
  console.log("Divinatio implantado em:", address);

  // bloco do deploy: o indexador começa daqui (não do bloco 0) na cadeia pública
  const deployTx = divinatio.deploymentTransaction();
  const startBlock = deployTx && deployTx.blockNumber != null
    ? deployTx.blockNumber
    : await ethers.provider.getBlockNumber();

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const DAY = 24 * 60 * 60;

  // Catálogo CURADO de mercados reais (mesma lista de scripts/seed.js).
  // Aqui só usamos a pergunta (q) e o prazo (days): NADA de previsões fake.
  const markets = [
    { q: "Quem vence a Copa do Mundo FIFA 2026?\nBrasil\nArgentina\nFrança\nEspanha\nInglaterra\nOutro", days: 80 },
    { q: "Campeão do Brasileirão 2026\nFlamengo\nPalmeiras\nBotafogo\nCorinthians\nOutro", days: 200 },
    { q: "A Libertadores 2026 fica com um clube brasileiro?\nSim\nNão", days: 210 },
    { q: "Bola de Ouro 2026\nVini Jr.\nMbappé\nHaaland\nOutro", days: 150 },
    { q: "Champions League 2025/26\nReal Madrid\nManchester City\nBayern\nPSG\nOutro", days: 120 },
    { q: "Fórmula 1 — campeão de 2026\nVerstappen\nNorris\nLeclerc\nOutro", days: 240 },
    { q: "NBA — campeão de 2026\nCeltics\nThunder\nNuggets\nOutro", days: 90 },
    { q: "Quem vence o BBB 26?\nNordeste\nSudeste\nSul/Centro-Oeste/Norte", days: 60 },
    { q: "Algum filme brasileiro indicado a Melhor Filme no Oscar 2027?\nSim\nNão", days: 300 },
    { q: "Eleição presidencial 2026 vai a 2º turno?\nSim\nNão", days: 150 },
    { q: "Spotify Wrapped Brasil 2026 — artista mais ouvido\nAna Castela\nHenrique & Juliano\nLuan Pereira\nOutro", days: 180 },
    { q: "Bitcoin fecha 2026 acima de US$ 150 mil?\nSim\nNão", days: 200 },
    { q: "GTA 6 é lançado dentro de 2026?\nSim\nNão", days: 260 },
    { q: "A Seleção Brasileira chega à final da Copa 2026?\nSim\nNão", days: 80 },
    { q: "Palmeiras e Corinthians na final do Paulistão 2026?\nSim\nNão", days: 40 },
    { q: "Anitta emplaca um hit no top 10 global em 2026?\nSim\nNão", days: 220 },
  ];

  let created = 0;
  for (const m of markets) {
    const close = now + m.days * DAY;
    const outcomeCount = m.q.split("\n").length - 1;
    await (
      await divinatio.connect(deployer).createMarket(m.q, outcomeCount, close, close + 2 * DAY, 100)
    ).wait();
    created++;
  }
  console.log(`${created} mercados REAIS criados (sem nenhuma previsão fake).`);

  console.log("\nDeploy público concluído. Copie para as variáveis da Railway:");
  console.log(`CONTRACT_ADDRESS=${address}`);
  console.log(`TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`START_BLOCK=${startBlock}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
