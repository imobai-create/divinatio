const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // MVP: a tesouraria é o próprio deployer; em produção, usar um multisig.
  const Divinatio = await ethers.getContractFactory("Divinatio");
  const divinatio = await Divinatio.deploy(deployer.address);
  await divinatio.waitForDeployment();

  console.log("Divinatio implantado em:", await divinatio.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
