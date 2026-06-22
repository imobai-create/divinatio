import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";
import App from "./App";
import "./styles.css";

// App ID do Privy é PÚBLICO (vai no bundle do navegador); a segurança vem da
// lista de domínios permitidos no painel da Privy, não de esconder o ID.
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmqe9t5mo02s40ejr6j17wx0e";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: { createOnLogin: "users-without-wallets" },
        // Suporta mainnet (Base 8453) e testnet (Base Sepolia 84532). A rede
        // efetiva é alinhada em runtime pelo /api/config (ensureNetwork no
        // eth.js). defaultChain = mainnet (destino com dinheiro real).
        defaultChain: base,
        supportedChains: [base, baseSepolia],
        // Rampa de compra (MoonPay): PIX como método padrão (público brasileiro).
        // O ativo (USDC) e a rede (Base) são passados no fundWallet (App.jsx).
        fundingMethodConfig: {
          moonpay: { paymentMethod: "pix_instant_payment" },
        },
        appearance: {
          theme: "dark",
          accentColor: "#7c5cff",
          logo: "https://www.divinatio.com.br/favicon.svg",
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>
);
