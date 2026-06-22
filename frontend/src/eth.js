import { BrowserProvider, Contract, MaxUint256 } from "ethers";
import DIVINATIO_ABI from "./abi/DivinatioABI.json";
import TOKEN_ABI from "./abi/MockStablecoinABI.json";
import { getActiveProvider, hasAnyWallet } from "./wallet";
import { setDecimals, setCurrency, toUnits } from "./util";

const API_URL = import.meta.env.VITE_API_URL || "";

// Endereços vêm do backend em runtime (/api/config); env vars são o fallback
// (padrão = endereços determinísticos do seed na rede local do Hardhat).
let configPromise = null;
export function getConfig() {
  if (!configPromise) {
    configPromise = fetch(`${API_URL}/api/config`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .catch(() => ({}))
      .then((cfg) => {
        // Decimais e símbolo do token vêm do backend (que lê decimals()/symbol()
        // do token on-chain). Aplica-os no módulo util para que TODA formatação
        // e conversão de valor use o número certo (USDC=6, dUSD=18).
        const tokenDecimals = cfg.tokenDecimals != null ? Number(cfg.tokenDecimals) : 18;
        const currencySymbol = cfg.currencySymbol || "dUSD";
        setDecimals(tokenDecimals);
        setCurrency(currencySymbol);
        return {
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
          tokenDecimals,
          currencySymbol,
          // árbitro (owner) e caução de resolução (unidades cruas do token)
          owner: cfg.owner || null,
          resolutionBond: cfg.resolutionBond || "0",
        };
      });
  }
  return configPromise;
}

export function hasWallet() {
  // carteira invisível da Privy OU MetaMask injetada
  return hasAnyWallet();
}

// Metadados das redes conhecidas (nome amigável + explorador) por chainId.
// No modo local a rede é o nó interno (chainId 31337); no modo public é a
// Base Sepolia (84532). Outras redes caem no rótulo genérico.
const CHAIN_META = {
  8453: {
    chainName: "Base",
    blockExplorerUrls: ["https://basescan.org"],
  },
  84532: {
    chainName: "Base Sepolia",
    blockExplorerUrls: ["https://sepolia.basescan.org"],
  },
  31337: { chainName: "DIVINATIO Testnet" },
};

/** Garante que a carteira está na rede certa (carteira Privy já nasce na Base
 *  Sepolia; para MetaMask, troca/adiciona). Tolerante a falhas. */
async function ensureNetwork() {
  const eip1193 = getActiveProvider();
  if (!eip1193 || !eip1193.request) return;
  const { publicRpcUrl, chainId } = await getConfig();
  if (!publicRpcUrl || !chainId) return;
  const hexChain = "0x" + Number(chainId).toString(16);
  try {
    await eip1193.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChain }],
    });
  } catch (err) {
    if (err.code === 4902 || /Unrecognized chain|not been added/i.test(err.message || "")) {
      const meta = CHAIN_META[Number(chainId)] || { chainName: "DIVINATIO Testnet" };
      try {
        await eip1193.request({
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
      } catch {
        /* segue assim mesmo */
      }
    }
    // se o usuário recusar, segue assim mesmo (pode já estar na rede certa)
  }
}

/** Conecta via MetaMask injetada (caminho alternativo ao login Privy). */
export async function connectWallet() {
  const eip1193 = getActiveProvider();
  if (!eip1193) {
    throw new Error("Nenhuma carteira encontrada. Entre com e-mail ou instale a MetaMask.");
  }
  const provider = new BrowserProvider(eip1193);
  const accounts = await provider.send("eth_requestAccounts", []);
  await ensureNetwork();
  return accounts[0];
}

/** Chamado após login (Privy ou MetaMask) para alinhar a rede. */
export async function prepareNetwork() {
  await ensureNetwork();
}

/** Pede ETH de gás (torneira do servidor) para o endereço conseguir transacionar. */
export async function requestGas(address) {
  if (!address) return;
  try {
    await fetch(`${API_URL}/api/gas?address=${address}`, { method: "POST" });
  } catch {
    // sem torneira configurada — segue; o usuário pode já ter gás
  }
}

async function contracts() {
  const { contractAddress, tokenAddress } = await getConfig();
  const eip1193 = getActiveProvider();
  if (!eip1193) throw new Error("Carteira não conectada. Entre com e-mail ou MetaMask.");
  const provider = new BrowserProvider(eip1193);
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
  await getConfig(); // garante que os decimais do token estão carregados
  const amountWei = toUnits(amount);
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

// --- Resolução otimista (qualquer usuário pode propor/contestar/finalizar) ---

/** Propõe o resultado de um mercado fechado, depositando a caução. */
export async function proposeOutcome(marketId, outcome) {
  const { resolutionBond } = await getConfig();
  const { signer, divinatio } = await contracts();
  await requestGas(await signer.getAddress());
  await ensureAllowance(BigInt(resolutionBond || "0"));
  const tx = await divinatio.proposeOutcome(marketId, outcome);
  return tx.wait();
}

/** Contesta o resultado proposto, depositando caução igual à travada no mercado. */
export async function disputeOutcome(marketId, bondAmount) {
  const { resolutionBond } = await getConfig();
  const { signer, divinatio } = await contracts();
  await requestGas(await signer.getAddress());
  await ensureAllowance(BigInt(bondAmount || resolutionBond || "0"));
  const tx = await divinatio.dispute(marketId);
  return tx.wait();
}

/** Finaliza um mercado proposto após a janela de disputa (devolve a caução ao propositor). */
export async function finalizeMarket(marketId) {
  const { signer, divinatio } = await contracts();
  await requestGas(await signer.getAddress());
  const tx = await divinatio.finalize(marketId);
  return tx.wait();
}

/** Árbitro decide uma disputa (apenas o owner do contrato). */
export async function resolveDispute(marketId, outcome) {
  const { signer, divinatio } = await contracts();
  await requestGas(await signer.getAddress());
  const tx = await divinatio.resolveDispute(marketId, outcome);
  return tx.wait();
}

/** Cancela um mercado sem resolução (após o prazo + carência); reembolsa todos. */
export async function cancelMarket(marketId) {
  const { signer, divinatio } = await contracts();
  await requestGas(await signer.getAddress());
  const tx = await divinatio.cancelMarket(marketId);
  return tx.wait();
}

export async function follow(prophet, amountPerMarket) {
  await getConfig(); // garante que os decimais do token estão carregados
  const amountWei = toUnits(amountPerMarket);
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
