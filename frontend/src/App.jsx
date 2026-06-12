import { useCallback, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Navbar, Footer, ToastStack } from "./components";
import { connectWallet, hasWallet } from "./eth";
import Home from "./pages/Home";
import MarketPage from "./pages/MarketPage";
import Leaderboard from "./pages/Leaderboard";
import CreateMarket from "./pages/CreateMarket";

export default function App() {
  const [account, setAccount] = useState(null);
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const onConnect = useCallback(async () => {
    try {
      const addr = await connectWallet();
      setAccount(addr);
      notify("Carteira conectada ✨");
    } catch (e) {
      notify(e.message, "error");
    }
  }, [notify]);

  useEffect(() => {
    if (!hasWallet()) return;
    const handler = (accounts) => setAccount(accounts[0] || null);
    window.ethereum.on?.("accountsChanged", handler);
    return () => window.ethereum.removeListener?.("accountsChanged", handler);
  }, []);

  return (
    <>
      <Navbar account={account} onConnect={onConnect} />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/mercado/:id"
            element={<MarketPage account={account} onConnect={onConnect} notify={notify} />}
          />
          <Route path="/profetas" element={<Leaderboard />} />
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
