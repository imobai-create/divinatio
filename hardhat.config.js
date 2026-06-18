require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const path = require("path");
const { subtask } = require("hardhat/config");
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require("hardhat/builtin-tasks/task-names");

// Por padrão usamos o compilador solc-js empacotado via npm: ele funciona
// OFFLINE (sem baixar nada de binaries.soliditylang.org), o que é mais
// confiável em máquinas/redes onde esse download trava. É um pouco mais
// lento, mas dispensa rede. Para usar o compilador nativo (mais rápido,
// porém exige download), defina USE_NATIVE_SOLC=1.
if (process.env.USE_NATIVE_SOLC !== "1") {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
    if (args.solcVersion === "0.8.24") {
      return {
        compilerPath: path.join(__dirname, "node_modules", "solc", "soljson.js"),
        isSolcJs: true,
        version: args.solcVersion,
        longVersion: "0.8.24",
      };
    }
    return runSuper(args);
  });
}

// Normaliza a chave: tira espaços em volta (colar do navegador costuma trazer
// um espaço) e aceita com ou sem o prefixo "0x" (a MetaMask exporta sem). O
// trim vem ANTES da checagem do prefixo para não gerar "0x0x..." nem chave
// "curta demais" por causa de um espaço perdido.
const rawKey = process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.trim();
const accounts = rawKey
  ? [rawKey.startsWith("0x") ? rawKey : "0x" + rawKey]
  : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // MAINNET — Base (chainId 8453). USDC real:
    //   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimais)
    // Para deploy em mainnet defina TOKEN_ADDRESS=<USDC> (assim NÃO implanta o
    // dUSD de teste). Use uma PRIVATE_KEY com ETH real na Base.
    base: {
      url: process.env.RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts,
    },
    // Testnets públicas: defina PRIVATE_KEY (carteira com fundos de faucet)
    baseSepolia: {
      url: process.env.RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts,
    },
    sepolia: {
      url: process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts,
    },
  },
};
