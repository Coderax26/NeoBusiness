# NeoBus — Complete Application Run Guide (Backend + Frontend)

This guide provides step-by-step instructions to run the entire **NeoBus** stack locally—including the **PostgreSQL 16 + Redis 7 infrastructure**, the **NestJS Modular Monolith Backend API (Modules M0–M7b)**, and the **Interactive Frontend Control Tower UI (`apps/web`)**.

---

## 1. System Services & Port Map

| Service | Local URL / Port | Purpose |
|---|---|---|
| **Frontend Control Tower UI** | `http://localhost:4000` | Interactive Obsidian Glassmorphic Control Tower Dashboard & Reverse Proxy to `:3000` |
| **Backend REST API** | `http://localhost:3000/api/v1` | NestJS Modular Monolith API (M0 Platform through M7b Analytics) |
| **Swagger / OpenAPI Docs** | `http://localhost:3000/api-docs` | Interactive Swagger API Explorer for all 35 controllers |
| **API Health Check** | `http://localhost:3000/health` | Liveness and database/queue connectivity probe |
| **PostgreSQL 16** | `localhost:5432` | Primary relational database (`neobus_dev` & `neobus_test`) |
| **Redis 7** | `localhost:6379` | BullMQ background job queue & outbox event relay |
| **Mailhog Web UI** | `http://localhost:8025` | Local email trap (SMTP on `localhost:1025`) |

---

## 2. Step-by-Step Startup Guide

### Step 1: Start Docker Infrastructure
From the repository root (`c:\CodeStuff\Projects\NeoBusinessSolution`), start PostgreSQL, Redis, and Mailhog:

```powershell
docker compose up -d
docker compose ps
```

Verify that `neobus_postgres` and `neobus_redis` show status `healthy`.

---

### Step 2: Configure Backend Environment Variables
Ensure `apps/api/.env` exists. If setting up for the first time, copy `.env.example`:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Key default values in `apps/api/.env` matching `docker-compose.yml`:
```ini
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://neobus:neobus_dev_secret@localhost:5432/neobus_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_jwt_secret_change_in_production_64_chars_minimum_length_0001
JWT_REFRESH_SECRET=dev_jwt_refresh_secret_change_in_production_64_chars_minimum_02
ALLOWED_ORIGINS=http://localhost:4000,http://localhost:3000
APP_TZ=Asia/Kolkata
```

---

### Step 3: Build, Run Migrations & Seed Demo Data
From the repository root, compile the backend, apply all 29 canonical SQL migrations (`db/migrations/`), and seed the demo sites, roles, and users:

```powershell
npm run migrate
npm run seed
```

*(Alternatively, from inside `apps/api`: `npm run build && npm run migrate && npm run seed`)*

---

### Step 4: Start the Backend API Server (Terminal 1)
Open **Terminal 1** at the repository root and start the NestJS API in watch mode:

```powershell
npm run dev:api
```

Once started, you will see:
- `Swagger UI available at: http://localhost:3000/api-docs`
- `NeoBus API is running on: http://localhost:3000`
- `Health check: http://localhost:3000/health`

---

### Step 5: Start the Frontend Control Tower UI (Terminal 2)
Open **Terminal 2** at the repository root and launch the Frontend Control Tower server:

```powershell
npm run dev:web
```

Once started, you will see:
- `⚡ NeoBus Interactive Control Tower UI running at: http://localhost:4000`
- `🔗 Proxying /api/v1/* and /health to backend API at: http://localhost:3000`

Open **`http://localhost:4000`** in your browser.

---

## 3. Seeded Demo Accounts & Sites

The `npm run seed` command populates **3 operational sites** and **6 role-based user accounts** (one for each NeoBus persona):

### 3.1 Seeded User Credentials

| Role | Full Name | Phone Number | PIN / Password | Default Surface & Home Route |
|---|---|---|---|---|
| **`OWNER`** | Ravi Kumar | `+919876543210` | `1234` | Owner Control Tower (`/control/dashboard`) |
| **`OPS_COORD`** | Anita Desai | `+919876543211` | `2233` | Office Desk Today Board (`/home`) — Multi-Site Enabled |
| **`PROD_MGR`** | Suresh Patel | `+919876543212` | `3344` | Factory Tablet PWA Kanban (`/t/production`) |
| **`DRIVER`** | Mehul Shah | `+919876543213` | `4455` | Field Mobile Manifest (`/m/manifest`) |
| **`COLLECTOR`** | Priya Nair | `+919876543214` | `5566` | Field Mobile Collections (`/m/collections`) |
| **`STOREKEEPER`** | Arjun Rao | `+919876543215` | `6677` | Warehouse Tablet PWA Blind GRN (`/t/grn`) |

### 3.2 Seeded Operational Sites
1. **NeoCore Factory — Mumbai** (`FACTORY` — Plot 42, MIDC, Andheri East, Mumbai)
2. **Central Warehouse — Navi Mumbai** (`WAREHOUSE` — Sector 17, Navi Mumbai)
3. **NeoCore Office — Corporate** (`OFFICE` — Bandra Kurla Complex, Mumbai)

---

## 4. Interacting with the Application (Frontend + Backend)

### 4.1 Using the Interactive Control Tower (`http://localhost:4000`)
1. **Connect to the Live Backend API**:
   - Click the **`🔗 Sync Live API (:3000)`** button in the top header bar.
   - The UI verifies `/health`, authenticates against `POST /api/v1/auth/login` using the Owner account (`+919876543210` / PIN `1234`), and syncs live pending exceptions from `GET /api/v1/exceptions?status=PENDING`.
2. **Test the Interactive Counter-Offer Margin Simulator Slider**:
   - In the **Zero-Latency Exception Workbench**, drag the price slider between `₹85.00` and `₹96.00`.
   - Watch **Simulated Margin %**, **Gross Profit**, and **Line Total** recalculate in real time at 60 FPS.
   - Click **`✓ Approve`**, **`⚡ Send Counter`**, or **`✕ Reject`** to resolve the exception card.
3. **Filter the Mission Control Pipeline**:
   - Click any of the 5 pipeline stage cards (`① Confirmed Orders`, `② In Production`, `③ Bay Loading`, `④ In Transit`, `⑤ Delivered Today`) to cross-filter the view.
4. **Switch Languages (`EN | मराठी`)**:
   - Click **`EN | मराठी`** in the top bar to toggle all dashboard headers and labels between English and Marathi.
5. **Wall-Board Kiosk Mode**:
   - Click **`🖥️ Wall-Board Kiosk`** to toggle full-screen executive wall-board display mode.

---

### 4.2 Testing Backend Endpoints via PowerShell or Swagger
You can also interact with any of the 35 backend controllers via **`http://localhost:3000/api-docs`** or PowerShell:

```powershell
# 1. Check API Health
Invoke-RestMethod -Uri "http://localhost:3000/health"

# 2. Authenticate as Owner (Ravi Kumar) and capture JWT
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body '{"phone":"+919876543210","pin":"1234"}'

$token = $login.accessToken

# 3. Query Pending Exception Cards
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/exceptions?status=PENDING" `
  -Headers @{ Authorization = "Bearer $token" }
```

---

## 5. Running Automated Test Suites

| Command (from repo root) | Scope | Description |
|---|---|---|
| `npm run test:fe` | **Phase P3 Frontend Suite** | Runs the 21 frontend acceptance tests (`apps/web/src/tests/p3-frontend-delivery.spec.ts`) in ~0.5s |
| `npm run test:all` | **Full Monorepo Suite** | Runs all 24 test suites (327 tests across M0–M7b backend + Phase P3 frontend) against `neobus_test` |
| `npm run build:api` | **Backend Production Build** | Compiles TypeScript (`nest build`) to `apps/api/dist` |

---

## 6. Troubleshooting

1. **`Error: Unable to acquire a connection` during tests or startup**:
   - Ensure Docker Desktop is running and `docker compose up -d` has started `neobus_postgres`.
   - Check container logs via `docker compose logs postgres`.
2. **Port `3000` or `4000` already in use**:
   - Override the backend port with `$env:PORT=3001; npm run dev:api`
   - Override the frontend port with `$env:WEB_PORT=4001; npm run dev:web`
3. **Resetting the Development Database**:
   - To roll back the last migration batch: `npm --prefix apps/api run migrate:rollback`
   - To re-apply migrations and re-seed: `npm run migrate && npm run seed`

