FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY web/package*.json ./web/

RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/

RUN npm run build:all

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache libstdc++

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY web/package*.json ./web/

RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev \
    && apk del python3 make g++

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

RUN mkdir -p cache && chmod 777 cache

EXPOSE 3000

CMD ["node", "dist/api/server.js"]
