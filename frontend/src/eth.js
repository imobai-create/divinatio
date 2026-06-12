import { BrowserProvider, Contract, parseEther } from "ethers";
import ABI from "./abi/DivinatioABI.json";

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

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

async function signerContract() {
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new Contract(CONTRACT_ADDRESS, ABI, signer);
}

export async function predict(marketId, outcome, amountEth) {
  const contract = await signerContract();
  const tx = await contract.predict(marketId, outcome, {
    value: parseEther(String(amountEth)),
  });
  return tx.wait();
}

export async function createMarket({ question, outcomeCount, closeTime, resolutionDeadline, creatorFeeBps }) {
  const contract = await signerContract();
  const tx = await contract.createMarket(
    question,
    outcomeCount,
    closeTime,
    resolutionDeadline,
    creatorFeeBps
  );
  return tx.wait();
}

export async function claim(marketId) {
  const contract = await signerContract();
  const tx = await contract.claim(marketId);
  return tx.wait();
}
