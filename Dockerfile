# Dockerfile — bitta image: API + World Engine + realtime + klient statik fayllari.
# Build:  docker build -t qirolliklar .
# Run:    docker compose up -d   (docker-compose.yml)

# ---------- 1) bog'liqliklar va build
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/game-rules/package.json packages/game-rules/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm install --no-audit --no-fund
COPY . .
RUN npm test -w @qirolliklar/game-rules \
 && npm run build -w @qirolliklar/server \
 && npm run build -w @qirolliklar/client

# ---------- 2) ishga tushirish uchun kichik image
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/public \
    MIGRATIONS_DIR=/app/db/migrations
RUN printf '{"name":"qirolliklar-runtime","private":true,"type":"module"}' > package.json \
 && npm install pg@^8.13.0 ws@^8.18.0 zod@^3.23.8 --omit=dev --no-audit --no-fund \
 && npm cache clean --force
COPY --from=build /src/apps/server/dist ./apps/server/dist
COPY --from=build /src/apps/client/dist ./public
COPY db/migrations ./db/migrations
RUN printf '{"type":"module"}' > apps/server/package.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "apps/server/dist/index.js"]
