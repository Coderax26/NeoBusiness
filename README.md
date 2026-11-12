# NeoBus — Enterprise Business Operations Platform

> Lightweight, mobile-first, exception-driven ERP/CRM for multi-site food trading and processed food manufacturing.

---

## Quick Start

> 📖 **Full Frontend + Backend Run Guide**: See [docs/APPLICATION_RUN_GUIDE.md](docs/APPLICATION_RUN_GUIDE.md) for complete step-by-step instructions to run the Backend API (`:3000`), Interactive Control Tower UI (`:4000`), seeded user credentials, and test suites.

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20 LTS or later |
| npm | 9+ |
| Docker Desktop | 24+ |
| Git | 2.40+ |
| PostgreSQL (via Docker) | 16 |
| Redis (via Docker) | 7 |

### 1. Clone and enter the repository

```bash
git clone <repo-url> neobus
cd neobus
```

### 2. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — see "Environment Variables" below
```

### 3. Start the development stack

```bash
docker compose up -d
cd apps/api
npm install
npm run migrate
npm run seed
npm run dev
```

### 4. Verify the API is alive

```bash
curl http://localhost:3000/health
# {"status":"ok","database":"connected","queue":"connected"}
```

### 5. Run tests

```bash
npm run test
npm run test:e2e
npm run test:cov
```

---

## Environment Variables (`apps/api/.env`)

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | YES | `postgresql://neobus:secret@localhost:5432/neobus_dev` | PostgreSQL connection string |
| `REDIS_URL` | YES | `redis://localhost:6379` | BullMQ queue connection |
| `JWT_SECRET` | YES | 64-char random string | Sign/verify access tokens |
| `JWT_REFRESH_SECRET` | YES | 64-char random string | Refresh tokens |
| `JWT_ACCESS_EXPIRES` | | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES` | | `7d` | Refresh token TTL |
| `S3_BUCKET` | | `neobus-uploads-dev` | Object storage for ePOD photos, invoice PDFs |
| `S3_ENDPOINT` | | `http://localhost:9000` | MinIO in dev |
| `S3_ACCESS_KEY` | | — | Object storage key |
| `S3_SECRET_KEY` | | — | Object storage secret |
| `FCM_SERVICE_ACCOUNT_JSON` | | `{}` | Firebase for push notifications |
| `WHATSAPP_API_URL` | | — | WhatsApp BSP endpoint (M7) |
| `WHATSAPP_API_TOKEN` | | — | BSP bearer token |
| `SMS_API_KEY` | | — | SMS gateway key (OTPs, fallback) |
| `APP_TZ` | | `Asia/Kolkata` | All timestamps displayed in this tz |
| `LOG_LEVEL` | | `debug` | debug / info / warn / error |
| `NODE_ENV` | | `development` | development / production |

Never commit real secrets. Use `.env` locally and a secrets manager in production.

---

## Project Structure

```
neobus/
├── apps/
│   ├── api/                     NestJS modular monolith (M0-M7)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── m0-platform/    Auth, RBAC, audit, config, doc-seq
│   │   │   │   ├── m1-commercial/  Customers, items, pricing, orders
│   │   │   │   ├── m2-procurement/ Suppliers, POs, GRN, shortfall
│   │   │   │   ├── m3-inventory/   Stock ledger, ATP, batches, FEFO
│   │   │   │   ├── m4-production/  BOM, work orders, yield, wastage
│   │   │   │   ├── m5-fleet/       Trips, driver app, ePOD, returns
│   │   │   │   ├── m6-finance/     Invoices, AR, custody wallet, EOD
│   │   │   │   ├── m7a-exceptions/ Exception engine + notifications
│   │   │   │   └── m7b-dashboards/ Dashboards, real-time pulse, KPI analytics
│   │   │   └── shared/
│   │   │       ├── ports/          Interface contracts between modules
│   │   │       ├── events/         Domain event definitions
│   │   │       └── utils/          Money, Qty, Clock, ConfigService
│   ├── web/                     Next.js office desk UI (Coordinator, Owner)
│   ├── mobile/                  Flutter offline-first (Driver, Collector, Owner)
│   └── tablet/                  PWA for factory and warehouse (PROD_MGR, STOREKEEPER)
├── db/
│   └── migrations/              SQL migrations, one subfolder per module
├── docs/
│   ├── modules/                 Per-module blueprint files (M0-M7)
│   ├── ARCHITECTURE.md
│   ├── BLUEPRINT_TRACEABILITY.md
│   ├── IMPLEMENTATION_ROADMAP.md
│   ├── OPEN_DECISIONS.md
│   ├── SECURITY.md
│   ├── DEVELOPMENT_GUIDE.md
│   ├── TESTING_STRATEGY.md
│   ├── CHANGELOG.md
│   └── PROJECT_OVERVIEW.md
├── scripts/                     Seed scripts, migration helpers
├── docker-compose.yml
└── README.md
```

---

## Available Commands (from `apps/api/`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start API in watch mode |
| `npm run build` | Compile TypeScript |
| `npm run start:prod` | Start compiled build |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:rollback` | Rollback last migration batch |
| `npm run seed` | Seed reference/config data |
| `npm run test` | Unit tests (Jest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Coverage report |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

## Docker Compose Services

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Primary database |
| `redis` | 6379 | BullMQ queues, session cache |
| `minio` | 9000 / 9001 | S3-compatible file storage (dev) |
| `mailhog` | 8025 | Email preview (dev) |

---

## Modules at a Glance

| ID | Module | Sprint |
|----|--------|--------|
| M0 | Platform Foundation — auth, RBAC, audit, config, offline sync | 0 |
| M7a | Exception Engine + Notification Hub | 0-1 |
| M1 | Commercial and CRM — customers, pricing, orders | 1 |
| M6 | Collections and Financials — invoices, AR, custody, EOD | 1 |
| M3 | Inventory and Warehouse — ATP, batches, FEFO, transfers | 2 |
| M5 | Fleet, Dispatch and Delivery — trips, driver app, ePOD | 2 |
| M4 | Factory Production — BOM, work orders, yield | 3 |
| M2 | Procurement and Supplier — POs, GRN, shortfall | 3 |
| M7b | Dashboards and Analytics | 3 |

---

## Troubleshooting

**Database connection refused:**
```bash
docker compose ps
docker compose logs postgres
```

**Migration fails:**
```bash
npm run migrate:rollback
# fix the migration file, then:
npm run migrate
```

**Redis not reachable:**
```bash
docker compose restart redis
```

**JWT errors in tests:**
Ensure `JWT_SECRET` and `JWT_REFRESH_SECRET` are set in `.env`.

---

## Contributing

See [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) for coding conventions, branching strategy, and PR checklist.

## Security

Report vulnerabilities to the project owner. See [docs/SECURITY.md](docs/SECURITY.md).

## Licence

Proprietary — Neo Project. All rights reserved.
