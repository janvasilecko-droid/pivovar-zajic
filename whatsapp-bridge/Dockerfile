# WhatsApp Gateway — Dockerfile pro Render.com (Web Service / Background Worker)
# Node 22 Alpine: minimální obraz, Baileys nepotřebuje Chromium/Puppeteer.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install git (required for some npm dependencies)
RUN apk add --no-cache git

# Nejprve jen závislosti (využije cache vrstev Dockeru)
COPY package.json ./
RUN npm install --omit=dev

# Pak zdrojový kód
COPY . .

EXPOSE 3000

# Health check (Render ho obvykle dělá sám, tohle je pojistka)
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "index.js"]
