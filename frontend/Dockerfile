# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# deps: установка зависимостей по локу — кэшируется отдельно от исходников
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
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
FROM nginx:alpine AS final
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
