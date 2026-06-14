import { BrowserProvider, Contract, MaxUint256, parseEther } from "ethers";
import DIVINATIO_ABI from "./abi/DivinatioABI.json";
import TOKEN_ABI from "./abi/MockStablecoinABI.json";

const API_URL = import.meta.env.VITE_API_URL || "";

// Endereços vêm do backend em runtime (/api/config); env vars são o fallback
// (padrão = endereços determinísticos do seed na rede local do Hardhat).
let configPromise = null;
export function getConfig() {
  if (!configPromise) {
    configPromise = fetch(`${API_URL}/api/config`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() => ({}))
      .then((cfg) => ({
        contractAddress:
          cfg.contractAddress ||
          import.meta.env.VITE_CONTRACT_ADDRESS ||
          "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        tokenAddress:
          cfg.tokenAddress ||
          import.meta.env.VITE_TOKEN_ADDRESS ||
          "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        publicRpcUrl: cfg.publicRpcUrl || null,
        chainId: cfg.chainId || 31337,
        mock: cfg.mock || false,
        chainMode: cfg.chainMode || "local",
      }));
  }
  return configPromise;
}

export function hasWallet() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

// Metadados das redes conhecidas (nome amigável + explorador) por chainId.
// No modo local a rede é o nó interno (chainId 31337); no modo public é a
// Base Sepolia (84532). Outras redes caem no rótulo genérico.
const CHAIN_META = {
  84532: {
    chainName: "Base Sepolia",
    blockExplorerUrls: ["https://sepolia.basescan.org"],
  },
  31337: { chainName: "DIVINATIO Testnet" },
};

/** Adiciona/troca a MetaMask para a rede configurada (local: proxy /rpc; public: RPC real). */
async function ensureNetwork() {
  const { publicRpcUrl, chainId } = await getConfig();
  if (!publicRpcUrl || !chainId) return;
  const hexChain = "0x" + Number(chainId).toString(16);
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChain }],
    });
  } catch (err) {
    if (err.code === 4902 || /Unrecognized chain|not been added/i.test(err.message || "")) {
      const meta = CHAIN_META[Number(chainId)] || { chainName: "DIVINATIO Testnet" };
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexChain,
            chainName: meta.chainName,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [publicRpcUrl],
            ...(meta.blockExplorerUrls ? { blockExplorerUrls: meta.blockExplorerUrls } : {}),
          },
        ],
      });
    }
    // se o usuário recusar, segue assim mesmo (pode já estar na rede certa)
  }
}

export async function connectWallet() {
  if (!hasWallet()) {
    throw new Error("Nenhuma carteira encontrada. Instale a MetaMask para apostar.");
  }
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  await ensureNetwork();
  return accounts[0];
}

/** Pede ETH de gás (torneira do servidor) para o endereço conseguir transacionar. */
async function requestGas(address) {
  // No modo public não há torneira (/api/gas está desativada): o gás vem de um
  // faucet externo da rede pública. Evita uma chamada inútil ao SPA.
  const { chainMode } = await getConfig();
  if (chainMode === "public") return;
  try {
    await fetch(`${API_URL}/api/gas?address=${address}`, { method: "POST" });
  } catch {
    // sem torneira (ex.: modo local puro) — segue; o usuário pode já ter gás
  }
}

async function contracts() {
  const { contractAddress, tokenAddress } = await getConfig();
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return {
    signer,
    divinatio: new Contract(contractAddress, DIVINATIO_ABI, signer),
    token: new Contract(tokenAddress, TOKEN_ABI, signer),
    contractAddress,
  };
}

/** Garante allowance do dUSD para o protocolo antes de uma operação. */
async function ensureAllowance(amountWei) {
  const { signer, token, contractAddress } = await contracts();
  const allowance = await token.allowance(await signer.getAddress(), contractAddress);
  if (allowance < amountWei) {
    const tx = await token.approve(contractAddress, MaxUint256);
    await tx.wait();
  }
}

export async function tokenBalance(account) {
  const { token } = await contracts();
  return token.balanceOf(account);
}

export async function faucet() {
  const { signer, token } = await contracts();
  // garante ETH de gás antes de chamar o faucet de dUSD (que custa gás)
  await requestGas(await signer.getAddress());
  const tx = await token.faucet();
  return tx.wait();
}

export async function predict(marketId, outcome, amount) {
  const amountWei = parseEther(String(amount));
  await ensureAllowance(amountWei);
  const { divinatio } = await contracts();
  const tx = await divinatio.predict(marketId, outcome, amountWei);
  return tx.wait();
}

export async function createMarket({ question, outcomeCount, closeTime, resolutionDeadline, creatorFeeBps }) {
  const { divinatio } = await contracts();
  const tx = await divinatio.createMarket(
    question,
    outcomeCount,
    closeTime,
    resolutionDeadline,
    creatorFeeBps
  );
  return tx.wait();
}

export async function claim(marketId) {
  const { divinatio } = await contracts();
  const tx = await divinatio.claim(marketId);
  return tx.wait();
}

export async function follow(prophet, amountPerMarket) {
  const amountWei = parseEther(String(amountPerMarket));
  await ensureAllowance(amountWei);
  const { divinatio } = await contracts();
  const tx = await divinatio.follow(prophet, amountWei);
  return tx.wait();
}

export async function unfollow(prophet) {
  const { divinatio } = await contracts();
  const tx = await divinatio.unfollow(prophet);
  return tx.wait();
}
