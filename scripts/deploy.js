const { ethers } = require("hardhat");

// Deploy do protocolo. Em redes de teste sem TOKEN_ADDRESS definido, implanta
// também a stablecoin de demonstração (dUSD, com faucet público).
//
// Uso:
//   npx hardhat run scripts/deploy.js --network localhost
//   TOKEN_ADDRESS=0x... npx hardhat run scripts/deploy.js --network baseSepolia
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  let tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) {
    const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
    const token = await MockStablecoin.deploy();
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    console.log("MockStablecoin (dUSD) implantado em:", tokenAddress);
  }

  const bond = ethers.parseEther(process.env.RESOLUTION_BOND || "10"); // 10 dUSD
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  const Divinatio = await ethers.getContractFactory("Divinatio");
  const divinatio = await Divinatio.deploy(treasury, tokenAddress, bond);
  await divinatio.waitForDeployment();

  console.log("Divinatio implantado em:", await divinatio.getAddress());
  console.log("\nVariáveis para o backend/frontend:");
  console.log(`CONTRACT_ADDRESS=${await divinatio.getAddress()}`);
  console.log(`TOKEN_ADDRESS=${tokenAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
