# Production Multi-Stage Dockerfile for NeoBus Next.js Web Application (F0-11)
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/api-client/package*.json ./packages/api-client/
COPY packages/ui/package*.json ./packages/ui/
COPY packages/i18n/package*.json ./packages/i18n/
COPY packages/mocks/package*.json ./packages/mocks/
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm --prefix apps/web run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOSTNAME="0.0.0.0"
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV API_ORIGIN=http://api:3000

RUN addgroup -g 1001 -S neobus && adduser -S neobus -u 1001 -G neobus

COPY --from=builder --chown=neobus:neobus /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=neobus:neobus /app/apps/web/.next/standalone ./
COPY --from=builder --chown=neobus:neobus /app/apps/web/.next/static ./apps/web/.next/static

USER neobus
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
