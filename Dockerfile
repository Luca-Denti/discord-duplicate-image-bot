FROM node:20-alpine

# Install native dependencies for sharp and better-sqlite3
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    sqlite-dev

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create data and log directories
RUN mkdir -p data logs

# Default environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=./data/images.db
ENV HASH_THRESHOLD=8

# Expose port (not required for the Discord bot, but useful for health checks)
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Startup command
CMD ["node", "src/index.js"]
