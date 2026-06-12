# DIVINATIO — imagem única para a Railway: compila o frontend e roda o
# backend, que serve a API e o site no mesmo serviço.

FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
RUN cd frontend && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY backend backend
COPY shared shared
COPY --from=frontend /app/frontend/dist frontend/dist
EXPOSE 3001
CMD ["node", "backend/server.js"]
