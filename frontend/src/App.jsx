import { useCallback, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Navbar, Footer, ToastStack } from "./components";
import { connectWallet, hasWallet, tokenBalance, faucet } from "./eth";
import { CURRENCY } from "./util";
import Home from "./pages/Home";
import MarketPage from "./pages/MarketPage";
import Leaderboard from "./pages/Leaderboard";
import CreateMarket from "./pages/CreateMarket";

export default function App() {
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

  const onConnect = useCallback(async () => {
    try {
      const addr = await connectWallet();
      setAccount(addr);
      refreshBalance(addr);
      notify("Carteira conectada ✨");
    } catch (e) {
      notify(e.message, "error");
    }
  }, [notify, refreshBalance]);

  const onFaucet = useCallback(async () => {
    try {
      await faucet();
      refreshBalance(account);
      notify(`1.000 ${CURRENCY} recebidos do faucet 🚰`);
    } catch (e) {
      notify(e.shortMessage || e.message, "error");
    }
  }, [account, notify, refreshBalance]);

  useEffect(() => {
    if (!hasWallet()) return;
    const handler = (accounts) => {
      const addr = accounts[0] || null;
      setAccount(addr);
      refreshBalance(addr);
    };
    window.ethereum.on?.("accountsChanged", handler);
    return () => window.ethereum.removeListener?.("accountsChanged", handler);
  }, [refreshBalance]);

  return (
    <>
      <Navbar account={account} balance={balance} onConnect={onConnect} onFaucet={onFaucet} />
      <main>
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
      </main>
      <Footer />
      <ToastStack toasts={toasts} />
    </>
  );
}
