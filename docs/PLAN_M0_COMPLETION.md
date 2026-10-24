# M0 Platform Foundation — Completion Plan

**Date:** 2026-10-24
**Status:** IN PROGRESS
**Owner:** Claude Code
**Depends on:** nothing (all schema already in migrations 001/002)

---

## 1. Current state

M0 Platform Foundation (`apps/api/src/modules/m0-platform/`) has its core in place:

| Capability | Status |
|---|---|
| DB connection (Knex + PostgreSQL) | ✅ |
| Migration runner (`MigrationService` + `splitSql`) | ✅ |
| Migrations 001 + 002 applied to Postgres | ✅ |
| `ConfigService` (TTL cache, GLOBAL/SITE/ITEM_CATEGORY) | ✅ |
| `AuthService` (login, refresh, logout, me) | ✅ |
| `AuthController` (4 routes) | ✅ |
| `JwtAuthGuard` | ✅ |
| `PermissionService` + `RbacGuard` + `@RequirePermission` | ✅ |
| Append-only trigger on `immutable_audit_logs` | ✅ (DB-side) |
| RLS policies on `users` + `locations` | ✅ (defined, not enforced) |
| Role permissions seed (6 roles, 43 rows) | ✅ |
| Business rule config seed (12 rows) | ✅ |

## 2. Remaining work (M0 build checklist §13)

| # | Item | Blocks acceptance criteria | Priority |
|---|---|---|---|
| 1 | RLS middleware — `SET LOCAL app.role` / `app.site_ids` per request | #1 (site isolation) | P0 |
| 2 | Audit interceptor — writes to `immutable_audit_logs` on every business write | #6 (audit trail) | P0 |
| 3 | Idempotency middleware — checks `idempotency_keys`, stores response | #4 (no duplicates) | P0 |
| 4 | Rate limiting on auth endpoints (`@Throttle`) | — | P1 |
| 5 | Document numbering service (`DocNumberService`) | — | P1 |
| 6 | File upload service (pre-signed S3 PUT) | — | P2 |
| 7 | Outbox relay + event bus (`OutboxService`, `OutboxRelay`) | — | P2 |
| 8 | Seed script (sites, users, config defaults) | — | P2 |
| 9 | CI pipeline | — | P2 |

## 3. Build order

```
Step 1: RLS middleware        (P0 — security)
Step 2: Audit interceptor     (P0 — compliance)
Step 3: Idempotency middleware (P0 — correctness)
Step 4: Auth rate limiting    (P1)
Step 5: DocNumberService      (P1 — needed by M1/M6)
Step 6: OutboxService + relay (P2 — needed by all modules)
Step 7: Seed script           (P2)
Step 8: CI pipeline           (P2)
```

## 4. Acceptance criteria (M0 §10)

- [ ] #1 A `STOREKEEPER` assigned to Site A cannot list stock/orders from Site B (API + direct SQL under RLS)
- [ ] #2 A `DRIVER` response for a trip contains no unit price or margin fields
- [ ] #3 Any `UPDATE` or `DELETE` on `stock_ledger_txns` fails at the DB
- [ ] #4 Sending the same offline command twice (same `idempotency_key`) creates exactly one record
- [ ] #5 Changing a value in `business_rule_config` changes behaviour with no deploy
- [ ] #6 Every create/update/approve in tests produces an `immutable_audit_logs` row with user, IP, before/after JSON

## 5. Definition of done

- [ ] All 6 acceptance criteria pass
- [ ] `npm run build` clean
- [ ] `npm test` — all existing tests still pass
- [ ] `node dist/main.js` boots, migrations up to date, Swagger at `/api-docs`
- [ ] Completion document created (`docs/M0_COMPLETION.md`)
- [ ] Changelog entry added
- [ ] Git commit