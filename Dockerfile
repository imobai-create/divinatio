# DIVINATIO — imagem ÚNICA com a pilha completa para a Railway:
# blockchain (hardhat node) + contratos + backend (indexador real) + site.
# Tudo roda num processo só; a Railway expõe a porta publicamente.

# 1) compila o site (produção)
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
RUN cd frontend && npm run build

# 2) runtime com a pilha completa
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache bash curl
# dependências da raiz (hardhat, ethers, solc) — necessárias EM TEMPO DE
# EXECUÇÃO (a blockchain e o seed rodam com hardhat). Estão em devDependencies,
# por isso --include=dev (não usamos NODE_ENV=production aqui para não pulá-las).
COPY package*.json ./
RUN npm ci --include=dev
# código do protocolo (contratos, scripts, config) e backend
COPY contracts contracts
COPY scripts scripts
COPY shared shared
COPY hardhat.config.js ./
COPY serve-all.sh ./
COPY backend backend
RUN cd backend && npm ci --omit=dev
# site já compilado
COPY --from=frontend /app/frontend/dist frontend/dist
EXPOSE 3001
CMD ["bash", "serve-all.sh"]
