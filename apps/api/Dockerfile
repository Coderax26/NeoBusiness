# P4.5 Multi-Stage Hardened Production Dockerfile for NeoBus API
FROM node:20-alpine AS builder
WORKDIR /app

COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api/ ./
RUN npm run build

# Prune dev dependencies to minimize production image size & attack surface
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create explicit non-root system user
RUN addgroup -g 1001 -S neobus && adduser -S neobus -u 1001 -G neobus

COPY --from=builder --chown=neobus:neobus /app/node_modules ./node_modules
COPY --from=builder --chown=neobus:neobus /app/dist ./dist
COPY --from=builder --chown=neobus:neobus /app/package.json ./package.json
COPY --chown=neobus:neobus db/migrations /app/db/migrations

USER neobus
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/main.js"]

