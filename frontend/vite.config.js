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
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/rpc": "http://localhost:3001",
    },
  },
});

