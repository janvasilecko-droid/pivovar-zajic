# WhatsApp Gateway — Dockerfile pro Render.com (Web Service / Background Worker)
# Node 22 Alpine: minimální obraz, Baileys nepotřebuje Chromium/Puppeteer.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install git (required for some npm dependencies)
RUN apk add --no-cache git

# package-lock.json má 'libsignal' přes git+ssh://git@github.com/... — v buildu
# nejsou SSH klíče, takže ssh adresu přepíšeme na https (veřejný repozitář).
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

# Nejprve jen závislosti (využije cache vrstev Dockeru). npm ci s lockfilem =
# přesně otestované verze; --ignore-scripts přeskočí baileys preinstall
# (engine-requirements.js) — všechny závislosti jsou čistý JS, build nepotřebují.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Pak zdrojový kód
COPY . .

EXPOSE 3000

# Health check (Render ho obvykle dělá sám, tohle je pojistka)
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "index.js"]
