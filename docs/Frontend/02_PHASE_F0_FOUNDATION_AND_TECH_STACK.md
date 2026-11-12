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

- [ ] F0-01 Scaffold Next.js app in `apps/web` (keep old logic files under `legacy/` until migrated)
- [ ] F0-02 npm workspaces + `@neo/*` package aliases; remove deep relative imports
- [ ] F0-03 OpenAPI type generation script + fetch wrapper + envelope/error mapping
- [ ] F0-04 TanStack Query provider, default polling & retry policy
- [ ] F0-05 BFF proxy and auth route handlers (login, refresh, logout) with cookie storage
- [ ] F0-06 `middleware.ts` route guard + permission metadata per route
- [ ] F0-07 `can()` helper driven by `/auth/me` permissions
- [ ] F0-08 Idempotency-key utility for mutations
- [ ] F0-09 MSW mock mode; seed mocks from existing `@neo/mocks`
- [ ] F0-10 Sentry + web-vitals + error boundaries
- [ ] F0-11 Dockerfile + compose service + CI workflow
- [ ] F0-12 Storybook setup
- [ ] F0-13 Backend: deliver gaps G-M0-1 (permissions in `/auth/me`) and G-LIST-1 (list contract) in parallel

