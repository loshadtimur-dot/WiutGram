# UNI Lovers production image.
# Works on Railway, Fly.io and any Docker host. Data lives in /data, so mount a
# persistent volume there (Railway: Settings -> Volumes -> mount path /data).

FROM node:20-bookworm-slim AS build

WORKDIR /app

# Build toolchain for better-sqlite3 when no prebuilt binary matches.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    UNI_DB_FILE=/data/app.db \
    UPLOADS_DIR=/data/uploads \
    TRUST_PROXY=1

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY . .

# The sprites are generated from lib/design, so regenerate them from the code
# that actually ships instead of relying on a cached file in the repo.
RUN node scripts/build-design-assets.js

RUN mkdir -p /data/uploads /data/backups

EXPOSE 3000

# Railway checks /api/health as well; this keeps docker run self-checking.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
