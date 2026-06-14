// Ponte entre a Privy (React/hooks) e o eth.js (módulo imperativo).
// O eth.js não pode usar hooks, então guardamos aqui o "provider" da carteira
// ativa (a carteira invisível da Privy OU a MetaMask injetada) numa variável de
// módulo, alimentada pelo componente <WalletBridge/> que vive dentro do
// PrivyProvider.

import { useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

let activeProvider = null; // EIP-1193 provider da carteira logada
let activeAddress = null;

export function setActive(provider, address) {
  activeProvider = provider;
  activeAddress = address || null;
}

/** Provider EIP-1193 da carteira ativa: Privy se logado, senão MetaMask. */
export function getActiveProvider() {
  if (activeProvider) return activeProvider;
  if (typeof window !== "undefined" && window.ethereum) return window.ethereum;
  return null;
}

export function getActiveAddress() {
  return activeAddress;
}

/** Há alguma carteira utilizável (Privy logada ou MetaMask)? */
export function hasAnyWallet() {
  return Boolean(activeProvider) || (typeof window !== "undefined" && Boolean(window.ethereum));
}

/**
 * Mantém o provider ativo sincronizado com a sessão da Privy. Quando o usuário
 * loga (e-mail/Google/carteira), pega o EIP-1193 provider da carteira embutida
 * e o registra para o eth.js usar. Renderiza dentro do PrivyProvider.
 */
export function WalletBridge({ onChange }) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  useEffect(() => {
    let cancelled = false;
    if (!ready || !authenticated || !wallets || wallets.length === 0) {
      setActive(null, null);
      onChange?.(null);
      return;
    }
    // prioriza a carteira embutida da Privy; senão, a primeira disponível
    const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
    wallet
      .getEthereumProvider()
      .then((provider) => {
        if (cancelled) return;
        setActive(provider, wallet.address);
        onChange?.(wallet.address);
      })
      .catch(() => {
        if (!cancelled) onChange?.(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, wallets, onChange]);

  return null;
}
