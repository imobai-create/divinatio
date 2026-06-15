import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { Navbar, Footer, ToastStack } from "./components";
import { connectWallet, tokenBalance, faucet, prepareNetwork, requestGas } from "./eth";
import { WalletBridge } from "./wallet";
import { CURRENCY } from "./util";

// Páginas carregadas sob demanda (code-splitting): cada rota só baixa o seu
// código quando é aberta, deixando o carregamento inicial mais leve.
const Home = lazy(() => import("./pages/Home"));
const MarketPage = lazy(() => import("./pages/MarketPage"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const CreateMarket = lazy(() => import("./pages/CreateMarket"));

export default function App() {
  const { ready, authenticated, login, logout } = usePrivy();
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState(null);
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const refreshBalance = useCallback(async (addr) => {
    if (!addr) return setBalance(null);
    try {
      setBalance((await tokenBalance(addr)).toString());
    } catch {
      setBalance(null);
    }
  }, []);

  // a WalletBridge avisa quando a carteira da Privy fica pronta / muda
  const handleWalletChange = useCallback(
    (addr) => {
      setAccount(addr);
      refreshBalance(addr);
      if (addr) {
        prepareNetwork().catch(() => {});
        // carteira nova nasce sem gás: já pede um pouco para conseguir transacionar
        requestGas(addr).catch(() => {});
      }
    },
    [refreshBalance]
  );

  const onConnect = useCallback(async () => {
    // Caminho principal: login da Privy (e-mail/Google/carteira). Se a Privy
    // não estiver disponível, cai para a MetaMask injetada — assim o site nunca
    // fica sem como conectar.
    try {
      if (authenticated) return; // já logado; a WalletBridge cuida do account
      if (ready) {
        login();
        return;
      }
      const addr = await connectWallet();
      setAccount(addr);
      refreshBalance(addr);
    } catch (e) {
      try {
        const addr = await connectWallet();
        setAccount(addr);
        refreshBalance(addr);
      } catch (e2) {
        notify(e2.message || e.message || "Não foi possível conectar.", "error");
      }
    }
  }, [ready, authenticated, login, notify, refreshBalance]);

  const onLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    setAccount(null);
    setBalance(null);
  }, [logout]);

  const onFaucet = useCallback(async () => {
    try {
      await faucet();
      refreshBalance(account);
      notify(`1.000 ${CURRENCY} recebidos do faucet 🚰`);
    } catch (e) {
      notify(e.shortMessage || e.message, "error");
    }
  }, [account, notify, refreshBalance]);

  // MetaMask injetada: reage à troca de conta (só quando NÃO está usando Privy)
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum?.on) return;
    const handler = (accounts) => {
      if (authenticated) return;
      const addr = accounts[0] || null;
      setAccount(addr);
      refreshBalance(addr);
    };
    window.ethereum.on("accountsChanged", handler);
    return () => window.ethereum.removeListener?.("accountsChanged", handler);
  }, [authenticated, refreshBalance]);

  return (
    <>
      <WalletBridge onChange={handleWalletChange} />
      <Navbar
        account={account}
        balance={balance}
        onConnect={onConnect}
        onFaucet={onFaucet}
        onLogout={account ? onLogout : null}
      />
      <main>
        <Suspense
          fallback={
            <div className="container" style={{ padding: "60px 24px" }}>
              <div className="skeleton" />
            </div>
          }
        >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/mercado/:id"
            element={<MarketPage account={account} onConnect={onConnect} notify={notify} />}
          />
          <Route
            path="/profetas"
            element={<Leaderboard account={account} onConnect={onConnect} notify={notify} />}
          />
          <Route
            path="/criar"
            element={<CreateMarket account={account} onConnect={onConnect} notify={notify} />}
          />
        </Routes>
        </Suspense>
      </main>
      <Footer />
      <ToastStack toasts={toasts} />
    </>
  );
}
