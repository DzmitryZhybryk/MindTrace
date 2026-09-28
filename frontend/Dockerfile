# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# deps: установка зависимостей по локу — кэшируется отдельно от исходников
# -----------------------------------------------------------------------------
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS deps
WORKDIR /app
# .npmrc (engine-strict) в контекст COPY: npm ci сверит базовый node/npm с engines package.json —
# сборка на «не той» базе упадёт сразу, а не даст молча дрейфующий лок.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# -----------------------------------------------------------------------------
# dev: используется docker-compose (target: dev). Исходники том-маунтятся в
# рантайме, CMD на старте досинхронивает node_modules и поднимает Vite dev-сервер.
# -----------------------------------------------------------------------------
FROM deps AS dev
COPY . .
EXPOSE 5173
# `npm install` на старте синхронит named volume node_modules с package.json/lock
# (volume переживает rebuild и иначе устаревает при смене зависимостей).
CMD ["sh", "-c", "npm install && npm run dev -- --host 0.0.0.0"]

# -----------------------------------------------------------------------------
# build: прод-бандл (tsc -b && vite build) -> /app/dist
# -----------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
# final: nginx раздаёт статику. Проксирование /v1 на backend делает внешний Caddy,
# nginx здесь — только статический сервер SPA.
# -----------------------------------------------------------------------------
# nginx-unprivileged: master и worker'ы под non-root (uid 101), слушает :8080 (порт >1024,
# root не нужен). Проксирование /v1 делает внешний Caddy (reverse_proxy frontend:8080).
FROM nginxinc/nginx-unprivileged:alpine@sha256:901e944d1f4fc2bd077e8f5568b98c1f6f8cdacf6b97a87747c43134a339b9a7 AS final
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
