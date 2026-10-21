# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 py3-pip && python3 -m venv /opt/pdf-runtime && /opt/pdf-runtime/bin/pip install --no-cache-dir pypdf==6.10.0

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY scripts/personalize-delivery.py scripts/storybook.py ./scripts/

EXPOSE 3001
CMD ["node", "dist/server.js"]
