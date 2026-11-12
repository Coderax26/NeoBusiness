# P4.5 Non-Root Production Dockerfile for NeoBus Interactive Control Tower UI
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV WEB_PORT=4000
ENV API_ORIGIN=http://api:3000

RUN addgroup -g 1001 -S neobus && adduser -S neobus -u 1001 -G neobus

COPY --chown=neobus:neobus apps/web/serve.mjs ./serve.mjs
COPY --chown=neobus:neobus apps/web/public ./public

USER neobus
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/ || exit 1

CMD ["node", "serve.mjs"]

