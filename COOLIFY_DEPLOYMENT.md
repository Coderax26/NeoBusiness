# NeoBus — GitHub & Coolify Pre-Production Deployment Guide

This guide covers pushing the cleaned repository to GitHub, deploying the full stack (`postgres`, `redis`, `api`, `web`) to a client pre-production server with **Coolify**, bootstrapping a clean client database (zero demo transactions), and running UAT verification.

---

## 1. Push Clean Repository to GitHub

Local AI tooling artifacts (`.claude/`, `CLAUDE.md`, `graphify-out/`), `.env`, build artifacts, and backup files are excluded via `.gitignore` and `.dockerignore`.

```bash
# Verify only intended project files are staged/tracked
git status

# Stage changes and commit
git add -A
git commit -m "chore: production readiness, schema/UI fixes, clean bootstrap, and Coolify setup"

# Push to GitHub (replace remote/branch as needed)
git remote add origin https://github.com/<your-org>/<your-repo>.git   # if not already set
git push -u origin <branch-name>
```

---

## 2. Coolify Service Setup (Docker Compose Build Pack)

1. In Coolify, create a **New Resource → Application → Git Repository** (select your GitHub repo and deployment branch).
2. Set **Build Pack** to **Docker Compose**.
3. Set **Docker Compose Location** to `/docker-compose.prod.yml`.
4. Under **Domains / Services**:
   - Assign your pre-production HTTPS domain (e.g. `https://preprod.client-domain.com`) to the **`web`** service on port **`4000`**.
   - Keep `api` (`3000`), `postgres` (`5432`), and `redis` (`6379`) internal unless external API/Swagger access is explicitly needed. (All browser requests proxy securely through `web` via `/api/proxy/*` and `/api/auth/*`.)

---

## 3. Configure Environment Variables in Coolify

Use [`.env.prod.example`](.env.prod.example) as your template and generate two distinct 64-character hex JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the required variables in Coolify:

| Variable | Value / Notes |
|---|---|
| `POSTGRES_DB` | `neobus_prod` |
| `POSTGRES_USER` | `neobus_app` |
| `POSTGRES_PASSWORD` | Strong random DB password |
| `JWT_SECRET` | 64-char random hex string |
| `JWT_REFRESH_SECRET` | Distinct 64-char random hex string |
| `ALLOWED_ORIGINS` | Exact origin of `web` domain, e.g. `https://preprod.client-domain.com` |
| `COOKIE_SECURE` | `true` for HTTPS; set `false` only if testing on plain `http://` IP |
| `BOOTSTRAP_CLIENT` | `true` (creates ONLY initial site + default locations + initial `OWNER` user; **0 demo data**) |
| `BOOTSTRAP_SITE_NAME` | Client's main site name |
| `BOOTSTRAP_SITE_TYPE` | `OFFICE`, `WAREHOUSE`, or `FACTORY` |
| `BOOTSTRAP_OWNER_NAME` | Client owner's full name |
| `BOOTSTRAP_OWNER_PHONE` | Client owner's login phone (`+91...`) |
| `BOOTSTRAP_OWNER_PIN` | Initial owner password/PIN (rotate after first login) |
| `SEED_ON_STARTUP` | `false` (keep `false` for client databases) |

---

## 4. Deploy & Startup Lifecycle

When you click **Deploy** in Coolify:
1. `postgres` and `redis` start and pass healthchecks.
2. `api` runs `docker-entrypoint.sh`:
   - Applies all SQL schema & system-permission migrations from `db/migrations/` (`node dist/scripts/migrate.js`) under a PostgreSQL advisory lock.
   - If `BOOTSTRAP_CLIENT=true`, idempotently creates the client's first site, default locations, and initial `OWNER` account (`node dist/scripts/bootstrap-client.js`) without inserting any demo customers, suppliers, orders, or invoices.
   - Starts NestJS on port `3000` and passes `/health`.
3. `web` starts Next.js standalone server on `0.0.0.0:4000` (`API_ORIGIN=http://api:3000`) and passes `/api/health`.

---

## 5. Pre-Production Client UAT Checklist

1. **Service Health:**
   - Verify Coolify shows `healthy` for `postgres`, `redis`, `api`, and `web`.
   - Open `https://<domain>/api/health` → `{ "status": "ok", "service": "neobus-web" }`.
2. **Owner Authentication:**
   - Open `https://<domain>/login` — confirm demo user cards are hidden and fields start empty.
   - Sign in with `BOOTSTRAP_OWNER_PHONE` and `BOOTSTRAP_OWNER_PIN`.
3. **Clean Database Baseline:**
   - On `/home`, verify **Today's Sales (OD-020)** shows `₹0.00` (`0 invoices in system`), **Actionable Exceptions** shows `0 Pending`, and **Reports → Profit & Loss Summary** shows `0.00` across all rows.
4. **Client Master Data Onboarding:**
   - Configure company profile (`/admin/company`), additional sites/locations (`/admin/sites`), staff users (`/admin/users`), items/customers/suppliers, and opening balances (`/admin/opening-balances`).
5. **End-to-End Business Smoke Tests:**
   - Set today's price sheet (`/sales/prices`) → Create & confirm a Sales Order (`/sales/orders/new`) → Record PO & GRN (`/procurement/purchase-orders` / `/floor/grn`) → Plan/Complete Trip (`/logistics/trips/new`) → Generate Invoice & Collection Receipt (`/finance/collections`) → Verify Day Close (`/finance/eod`).
   - Monitor `api` container logs for zero connection pool timeouts, zero `ECONNRESET`, and clean background job ticks (`MvRefreshJob`, `OutboxRelay`, `InventoryExpiryJob`).
