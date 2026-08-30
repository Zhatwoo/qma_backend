# ── Build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# ── Production ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

RUN mkdir -p uploads

# Cloud Run sets PORT automatically (default 8080)
EXPOSE 8080

CMD ["node", "dist/main.js"]
