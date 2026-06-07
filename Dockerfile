FROM node:20-alpine

# Installa dipendenze native per sharp e better-sqlite3
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    sqlite-dev

WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Installa dipendenze
RUN npm ci --only=production

# Copia codice sorgente
COPY src/ ./src/

# Crea directory per dati e logs
RUN mkdir -p data logs

# Variabili d'ambiente default
ENV NODE_ENV=production
ENV DATABASE_PATH=./data/images.db
ENV LOG_LEVEL=info
ENV HASH_THRESHOLD=8

# Esposizione port (non necessaria per bot Discord ma utile per healthcheck)
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Comando di avvio
CMD ["node", "src/index.js"]