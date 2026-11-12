# Phase F0 — Foundation & Technology Stack

> **Duration:** 2 weeks · **Release:** R1 · **Depends on:** nothing · **Unblocks:** all phases

## 1. Goal

Create a production-grade web application skeleton in `apps/web` with a typed API client, secure session handling, permission-driven routing, consistent data fetching and a CI pipeline — so that every later phase only adds screens.

---

## 2. Technology stack (recommended)

| Layer | Choice | Why it suits NeoBus |
|-------|--------|---------------------|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript strict** | Already named in blueprint & `CLAUDE.md`; file-based routing; route groups for Office vs Floor Mode |
| Rendering | Client-rendered authenticated pages; server components only for shell/login | Internal app, all data behind login |
| Styling | **Tailwind CSS v4** + design tokens in `@neo/ui` | Fast theming, consistent spacing; prototype already uses Tailwind |
| Components | **shadcn/ui pattern on Radix primitives** (owned source in `packages/ui`) | Accessible dialogs, menus, tabs; fully brandable |
| Icons | Lucide | Clear, consistent icons for every status/action |
| Server state | **TanStack Query v5** | Caching, background refresh (30 s polling per OD-021), retries, invalidation |
| Client UI state | Zustand (small) | Sidebar, active site, density, language |
| Forms | **React Hook Form + Zod** | Friendly inline validation, schemas reused for API DTO typing |
| Tables | **TanStack Table + TanStack Virtual** | Sorting, filtering, column chooser, 10k rows |
| Charts | **Apache ECharts** (or Recharts for simple cards) | Attractive, interactive, handles heavy analytics |
| Dates | `date-fns` + `date-fns-tz` (Asia/Kolkata) | Lightweight, tree-shakeable |
| Money | `decimal.js` (already in backend) | Preview maths without float errors |
| Maps | Leaflet + OpenStreetMap (or Google Maps if licensed) | Trip builder & dispatch map |
| i18n | `next-intl` reusing `@neo/i18n` messages (en, mr) | OD-008: English MVP, i18n-ready |
| PWA / offline | Serwist + IndexedDB (Dexie) — Floor Mode only | Reuse outbox logic from `apps/tablet` |
| PDF view | Browser native viewer in modal/iframe | Server already produces PDFs |
| Testing | Vitest + Testing Library, **Playwright** E2E, axe-core, MSW mocks, Storybook | Matches repo (Vitest already used) |
| Error monitoring | Sentry (self-hosted or SaaS) + web-vitals | Track crashes and slow screens |

> **Ponytail rule (CLAUDE.md):** do not add libraries beyond this list without justification; prefer native APIs.

### Decisions to confirm

| ID | Decision | Recommendation |
|----|----------|----------------|
| D-1 | Separate `apps/tablet` app vs. Floor Mode inside `apps/web` | **Single app**, route group `(floor)` with touch layout + PWA install. Halves shell/auth/test effort |
| D-2 | Token storage | **BFF pattern**: Next.js route handlers keep tokens in `httpOnly` cookies; browser never sees JWT |
| D-3 | Charts library | ECharts for analytics; lightweight sparkline component for KPI cards |
| D-4 | Maps provider | OpenStreetMap (free) for MVP; switch to Google if address geocoding is required |
| D-5 | Brand palette & logo | Needed from owner before F1 week 2 |

---

## 3. Repository layout

```
apps/web/
  app/
    (auth)/login/                 Login, forgot PIN
    (office)/                     Desktop/laptop layout (sidebar + topbar)
      home/                       Role home pages
      sales/  procurement/  inventory/  production/
      logistics/  finance/  control/  reports/  admin/  help/
    (floor)/                      Touch layout for tablets (PROD_MGR, STOREKEEPER)
      floor/production/  floor/grn/  floor/loading/  floor/transfers/  floor/stock/
    api/bff/[...path]/route.ts    BFF proxy → NestJS /api/v1 (adds bearer from cookie)
    api/auth/{login,logout,refresh}/route.ts
  features/<module>/              Screens' hooks, forms, columns, components per module
  lib/                            query client, permission helper, formatters bridge
  middleware.ts                   Redirect unauthenticated users; guard routes by permission
packages/
  ui/          Design tokens, Tailwind preset, all shared components (F1)
  api-client/  GENERATED from OpenAPI + TanStack Query hooks per module
  shared/      Business-rule previews, formatters, permission helper (backend-sourced codes)
  i18n/        en / mr dictionaries
  mocks/       MSW handlers per module for demo & tests
```

---

## 4. API integration

| Concern | Plan |
|---------|------|
| Client generation | `openapi-typescript` (types) + thin fetch wrapper; script `npm run api:gen` reads `http://localhost:3000/api-docs-json`; CI fails if generated file is stale |
| Hooks | One file per module: `useOrders(filters)`, `useConfirmOrder()`, query keys `['m1','orders',filters]` |
| Envelope | Unwrap `{ data, meta, error }` in one place |
| Errors | Map HTTP + error codes to friendly messages (table below) |
| Idempotency | Every mutation sends `Idempotency-Key: <uuidv7>` generated when the form opens (so retries reuse it) |
| Site context | Active site sent as `siteId` query param where the API accepts it; Owner can pick "All sites" |
| Polling | Dashboards / approvals / dispatch board refetch every **30 s** (OD-021) while tab visible; replaced by SSE when available (gap G-RT-1) |
| Optimistic UI | Only for non-financial UI (notes, filters, worklist tick). Money, stock, status always wait for server |
| Downloads | PDFs (`invoices/:id/pdf`, challan, deposit slip) fetched via BFF as blob → viewer modal with Print / Download / Share |

### Error → message mapping (non-tech wording)

| API condition | Message shown | Extra UI |
|---------------|---------------|----------|
| 400 validation | "Please check the highlighted fields." | Field-level messages from DTO errors |
| 401 | (silent refresh) → "Your session ended. Please sign in again." | Return to same page after login |
| 403 | "You don't have permission to do this. Ask the Owner if you need access." | Hide action next time |
| 404 | "This record no longer exists or was moved." | Back button |
| 409 / stale | "Someone else updated this just now." | **Reload latest** button |
| 422 rule blocked (BR-01/02 etc.) | Business sentence, e.g. "Price is below today's floor — send for Owner approval." | Show the alternative action |
| 429 | "Too many attempts. Please wait a minute and try again." | Countdown |
| 5xx / network | "We couldn't reach the server. Your work is saved — try again." | Retry button; draft kept |

---

## 5. Authentication & session

| Item | Specification |
|------|---------------|
| Login | Phone + password (office) / phone + PIN (floor). Calls `POST /auth/login` via BFF |
| Tokens | Access (15 min) + refresh (7 d) stored in `httpOnly; Secure; SameSite=Strict` cookies by BFF |
| Silent refresh | BFF refreshes on 401 once, retries original request; concurrent requests share one refresh |
| Bootstrap | After login call `/auth/me` → user, role, `siteIds`, language, **permissions** (needs gap G-M0-1) |
| Route guard | `middleware.ts` redirects to `/login` if no session; each route declares `requiredPermission`; unknown → 403 page with friendly text |
| Idle lock | Office: 30 min idle → lock screen (re-enter password, unsaved form kept). Floor: 5 min → PIN lock |
| Sensitive actions | Owner approvals and reversals re-prompt password/PIN (step-up) |
| Logout | `POST /auth/logout` revokes refresh token; clear query cache |
| CSRF | SameSite=Strict + double-submit token header on mutations through BFF |

---

## 6. Permission model in the UI

- Single helper `can(permission)` reading permissions from `/auth/me` — **no hard-coded role maps** (fixes issue I-1).
- Navigation items, buttons, table columns and form fields declare their permission.
- Masked roles: columns tagged `sensitive` (price, cost, margin, totals, credit, AR) are not rendered when API omits them; layout adapts with no empty columns.
- The API remains the authority; UI hiding is convenience only.

---

## 7. Cross-cutting infrastructure tasks

| Task | Detail |
|------|--------|
| Workspace setup | npm workspaces; packages referenced as `@neo/*`; shared `tsconfig.base.json` |
| Env config | `NEXT_PUBLIC_APP_NAME`, `API_ORIGIN`, `SENTRY_DSN`; never expose secrets |
| Feature flags | Per-module flags (env or config endpoint) to hide unfinished modules |
| Dockerfile | Update `apps/web/Dockerfile` for Next.js standalone output; add to `docker-compose.prod.yml` |
| CI | lint → typecheck → unit → build → Playwright smoke (against mocks) → Lighthouse budget → axe |
| Mock mode | `NEXT_PUBLIC_MOCKS=1` uses MSW handlers for demos/training without backend |
| Storybook | Every shared component documented with states (used for design review) |
| Logging | Client error boundary per route; Sentry with release tag; user id (no PII) |

---

## 8. Acceptance criteria

1. `npm run dev -w apps/web` starts the app; `/login` authenticates against the real API through the BFF; JWT never visible in browser JS or localStorage.
2. Generated API client compiles; changing a backend DTO and regenerating shows type errors in affected screens.
3. Unauthenticated access to any `(office)` route redirects to login and returns to the original URL after login.
4. A user without `order.view` cannot see the Orders menu and gets the friendly 403 page by URL.
5. CI pipeline runs green with lint, typecheck, unit, build, smoke E2E and axe checks.
6. Mock mode runs the full shell with no backend.

## 9. Task checklist

- [x] F0-01 Scaffold Next.js app in `apps/web` (keep old logic files under `legacy/` until migrated)
- [x] F0-02 npm workspaces + `@neo/*` package aliases; remove deep relative imports
- [x] F0-03 OpenAPI type generation script + fetch wrapper + envelope/error mapping
- [x] F0-04 TanStack Query provider, default polling & retry policy
- [x] F0-05 BFF proxy and auth route handlers (login, refresh, logout) with cookie storage
- [x] F0-06 `middleware.ts` route guard + permission metadata per route
- [x] F0-07 `can()` helper driven by `/auth/me` permissions
- [x] F0-08 Idempotency-key utility for mutations
- [x] F0-09 MSW mock mode; seed mocks from existing `@neo/mocks`
- [x] F0-10 Sentry + web-vitals + error boundaries
- [x] F0-11 Dockerfile + compose service + CI workflow
- [x] F0-12 Storybook setup
- [x] F0-13 Backend: deliver gaps G-M0-1 (permissions in `/auth/me`) and G-LIST-1 (list contract) in parallel

---

## 10. Implementation Log & Test Verification Results

### 10.1 Verification Summary

| Test Suite | Spec File | Tests Passed | Status |
|---|---|---|---|
| Phase F0 Foundation & Tech Stack | `apps/web/src/tests/f0-foundation-tech-stack.spec.ts` | 20 / 20 | Pass |
| Phase F0 Auth & Route Permissions | `apps/web/src/tests/f0-auth-permissions.spec.ts` | 13 / 13 | Pass |
| Phase F1 Contract & Money Precision | `apps/web/src/tests/f1-contract-and-money.spec.ts` | 23 / 23 | Pass |
| Phase F2 Enablement & Web Shell | `apps/web/src/tests/f2-enablement-and-web.spec.ts` | 15 / 15 | Pass |
| Phase P3 Frontend Delivery & Floor Mode | `apps/web/src/tests/p3-frontend-delivery.spec.ts` | 21 / 21 | Pass |
| **Total Test Suite** | **5 Test Files** | **92 / 92** | **100% Pass** |

### 10.2 Test Cases Implemented for Phase F0 (`TC-F0-AC01` to `TC-F0-AC20`)

1. **TC-F0-AC01**: Next.js standalone build configuration (`output: 'standalone'`), `reactStrictMode: true`, and transpilation for `@neo/shared`, `@neo/api-client`, `@neo/ui`, `@neo/i18n`.
2. **TC-F0-AC02**: BFF Auth route handlers (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/bff/[...path]`) with `httpOnly; Secure; SameSite=lax` cookie storage.
3. **TC-F0-AC03**: `middleware.ts` protects private routes (`(office)` and `(floor)`), redirecting unauthenticated users to `/login?returnTo=...`.
4. **TC-F0-AC04**: `middleware.ts` allows public routes (`/login`, static assets) without interception.
5. **TC-F0-AC05**: `formatApiError` maps 400 validation errors into user-friendly summary and field-level DTO errors.
6. **TC-F0-AC06**: `formatApiError` maps non-technical messages for 401 session ended, 403 forbidden, 404 missing, 409 stale conflict with reload flag, 422 business rule block, 429 rate limit, and 500 network retryable error.
7. **TC-F0-AC07**: `generateIdempotencyKey` and `createMutationHeaders` create valid headers with UUIDv7-compliant format and JSON content type.
8. **TC-F0-AC08**: `createQueryClient` configures 30s background polling per OD-021 (`staleTime: 30000`, `refetchInterval: 30000`, `refetchOnWindowFocus: true`).
9. **TC-F0-AC09**: `queryKeys` factory generates structured cache keys per module (`commercial`, `procurement`, `inventory`, `finance`).
10. **TC-F0-AC10**: Mock mode helper (`isMockModeEnabled` & `getMockResponse`) connects `@neo/mocks` fixtures when `NEXT_PUBLIC_MOCKS=1`.
11. **TC-F0-AC11**: Error boundaries (`app/error.tsx`), `app/not-found.tsx`, and friendly 403 page (`app/(office)/forbidden/page.tsx`) exist and render user-safe messages.
12. **TC-F0-AC12**: `globals.css` and `Button.tsx` enforce minimum 48px touch targets (`min-h-[48px]`, `--touch-target-min: 48px`).
13. **TC-F0-AC13**: Route permissions table (`ROUTE_PERMISSIONS`) maps ERP paths to required backend permission codes (`order.view`, `price.set_daily`, `po.read`, `inventory.read`, `finance.view`, `report.view`).
14. **TC-F0-AC14**: Floor Mode touch route group `(floor)` with touch layout and 56px touch tiles exists for `PROD_MGR` and `STOREKEEPER`.
15. **TC-F0-AC15**: Multi-stage standalone production Dockerfile exists with builder stage, `standalone` copy, and non-root user `neobus`.
16. **TC-F0-AC16**: BFF Auth refresh route (`/api/auth/refresh`) handles token rotation with cookie updates and 401 revocation.
17. **TC-F0-AC17**: BFF proxy route (`/api/bff/[...path]`) implements silent refresh on upstream 401 and request retry.
18. **TC-F0-AC18**: Telemetry module (`lib/telemetry.ts`) exports `reportWebVitals` and `captureClientException` without PII.
19. **TC-F0-AC19**: Storybook configuration (`.storybook/main.ts`, `.storybook/preview.ts`) and stories (`Button`, `StatusBadge`, `KpiCard`) configured for UI design review.
20. **TC-F0-AC20**: Docker compose (`docker-compose.prod.yml`) and CI workflow (`.github/workflows/ci.yml`) include the Next.js web service, standalone image, and API route drift check.


