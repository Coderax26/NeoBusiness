# Phase P4.4 & P4.5 — Deployment Hardening, Observability & Incident Runbook

---

## 1. Observability & Telemetry Architecture

### 1.1 Endpoints Exposed
- **`GET /health`** & **`GET /health/ready`**: Live PostgreSQL `SELECT 1` probe, Knex connection pool stats (`used`, `free`, `pendingAcquires`), version, and process uptime.
- **`GET /metrics`**: Prometheus OpenMetrics exposition (`neobus_http_requests_total`, `neobus_http_errors_total`, `neobus_http_request_duration_ms_p95`, `neobus_queue_depth`, `neobus_dead_letter_jobs`, `neobus_mv_freshness_seconds`).
- **`GET /metrics/json`**: JSON snapshot of rolling latency percentiles (`p50`, `p95`, `p99`, `max`), error rate %, MV freshness, and recent structured logs.

### 1.2 Correlation IDs & Structured JSON Logs
- Every request passes through `CorrelationMiddleware`, attaching/echoing `X-Correlation-Id` and `X-Request-Id`.
- In production (`LOG_FORMAT=json` / `NODE_ENV=production`), logs emit single-line JSON containing `timestamp`, `level`, `correlationId`, `method`, `path`, `statusCode`, `durationMs`, `userId`, and `role`.

---

## 2. Alert Routing & SLO Thresholds

| Metric | Warning Threshold | Critical Pager Threshold | Incident Action |
|---|---|---|---|
| **API Latency (p95)** | $> 250\text{ ms}$ for 5m | $> 300\text{ ms}$ for 5m | Inspect `pg_stat_activity` lock waits; check MV refresh overlap |
| **HTTP 5xx Error Rate** | $> 1\%$ | $> 3\%$ | Grep JSON logs by `correlationId`; rollback deployment if post-release |
| **MV Pulse Freshness** | $> 90\text{ seconds}$ | $> 180\text{ seconds}$ | Inspect BullMQ `dashboard-events` worker & Redis connection |
| **Dead-Letter Queue Depth** | $\ge 1$ job | $\ge 10$ jobs | Inspect failed WhatsApp/SMS/Tally webhook payload in `outbox_events` |
| **DB Pool Pending Acquires** | $\ge 5$ | $\ge 20$ | Identify long-running unindexed query or held transaction |

---

## 3. Production Container & TLS Hardening

### 3.1 Container Hardening (`apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.prod.yml`)
- **Non-Root User**: Containers drop root privileges and execute as `neobus` (UID `1001`).
- **Minimal Attack Surface**: Multi-stage builds prune TypeScript build toolchains and `devDependencies`.
- **Resource Limits**: Bounded CPU and RAM reservations prevent noisy-neighbor OOM kills.
- **Graceful Shutdown**: `app.enableShutdownHooks()` drains HTTP requests and closes Postgres/Redis pools cleanly on `SIGTERM`.

### 3.2 TLS, DNS & SSL Renewal
- Terminate TLS 1.3 via Caddy or Nginx in front of `127.0.0.1:4000` (Web) and `127.0.0.1:3000` (API) with automated Let's Encrypt ACME renewal (`certbot renew --quiet` every 12h).
- Configure strict HSTS, CSP `frame-ancestors 'none'` (via Helmet + proxy headers), and restrict `ALLOWED_ORIGINS` to the production domain.

---

## 4. Zero-Downtime Deployment & Rollback Runbook

### Deployment Sequence
1. Pull tagged release & run environment check (`validateEnvironmentConfig()`).
2. Run database migrations cleanly **before** swapping traffic:
   `docker compose -f docker-compose.prod.yml run --rm api node dist/scripts/migrate.js`
3. Build and roll API & Web containers:
   `docker compose -f docker-compose.prod.yml up -d --build api web`
4. Verify `/health` returns `{"status":"ok","database":"connected"}`.

### Emergency Rollback Sequence
1. Immediately revert containers to previous image digest: `docker compose -f docker-compose.prod.yml up -d --no-build`.
2. If a migration introduced a schema regression, execute `npm --prefix apps/api run migrate:rollback` or restore from PITR snapshot per [P4_BACKUP_AND_RECOVERY_RUNBOOK.md](file:///c:/CodeStuff/Projects/NeoBusinessSolution/docs/P4_BACKUP_AND_RECOVERY_RUNBOOK.md).

