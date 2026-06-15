import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Config PostCSS embutida (vazia): o projeto não usa PostCSS, e fixar isto
  // aqui impede o Vite de procurar um arquivo de config PostCSS subindo as
  // pastas — uma busca que trava se houver um .postcssrc vazio/quebrado em
  // qualquer pasta acima do projeto na máquina do usuário.
  css: {
    postcss: { plugins: [] },
  },
  build: {
    // Divide o bundle em pedaços separados (vendor) para carregar em paralelo
    // e cachear: a biblioteca de login (Privy) é grande, então fica num chunk
    // próprio em vez de inflar o pacote principal.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Separa só as libs estáveis (cacheáveis) em chunks próprios. O Privy
        // NÃO é agrupado de propósito: assim o Rollup preserva o
        // carregamento sob demanda interno dele (modais de login só baixam
        // quando o usuário clica em "Entrar").
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "react";
          }
          if (/[\\/]node_modules[\\/]ethers[\\/]/.test(id)) return "ethers";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/rpc": "http://localhost:3001",
    },
  },
});

