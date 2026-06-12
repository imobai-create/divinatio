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
      }));
  }
  return configPromise;
}

export function hasWallet() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function connectWallet() {
  if (!hasWallet()) {
    throw new Error("Nenhuma carteira encontrada. Instale a MetaMask para apostar.");
  }
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  return accounts[0];
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
  const { token } = await contracts();
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
