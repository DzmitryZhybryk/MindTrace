FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

EXPOSE 5173

# `npm install` на старте синхронит named volume node_modules с package.json/lock
# (volume переживает rebuild и иначе устаревает при смене зависимостей).
CMD ["sh", "-c", "npm install && npm run dev -- --host 0.0.0.0"]
