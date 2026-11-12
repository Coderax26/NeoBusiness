## 7. Implementation log & test results (added 2026-11-12)

> Append this section to the end of `01_CODEBASE_REVIEW_AND_GAP_ANALYSIS.md`. It sits in a separate file because that document was not on disk when it was written.

### 7.1 Scope implemented (Recommendation #2: fix I-1 / I-2 first)

| Issue | Change | Files |
|-------|--------|-------|
| **I-2** `/auth/me` had no permissions | `GET /auth/me` now also returns `name`, `permissions[]` (from `role_permissions`; OWNER → `['*']`), `sites[]` (`{id,name,type}`; OWNER sees all active sites), de-duplicated `siteIds`, `preferredLanguage` | `apps/api/src/modules/m0-platform/auth.service.ts` (`getUserWithSites`, new `getPermissionCodes`) |
| **I-1** FE/BE permission-code mismatch | Deleted hard-coded `ROLE_PERMISSIONS`; `can()` uses only server-provided `permissions` (deny by default). Added `AuthMeResponse` + `toSessionUser()`. All nav `requiredPermission` codes remapped to real backend codes (e.g. `customer.read→customer.view`, `trip.create→fleet.manage`, `cheque.manage→receipt.verify_handover`, `audit.read→audit.view`, `grn.blind_receive→grn.record_blind`) | `packages/shared/src/permissions.ts` |

Not yet done (later phases): I-3 generated API client, I-4 decimal strings in desks, I-5 workspace imports, I-6/I-8 Next.js app, and the 🔴 backend gaps in §5.

### 7.2 Test cases — `apps/web/src/tests/f0-auth-permissions.spec.ts`

| ID | Case | Result |
|----|------|--------|
| TC-F0-01 | `/auth/me` returns sorted permissions from `role_permissions` | ✅ Pass |
| TC-F0-02 | OWNER receives `['*']` | ✅ Pass |
| TC-F0-03 | Returns `sites[]` with id, name, type | ✅ Pass |
| TC-F0-04 | `siteIds` de-duplicated | ✅ Pass |
| TC-F0-05 | Returns `name` and `preferredLanguage` | ✅ Pass |
| TC-F0-06 | Unknown/inactive user → `null` | ✅ Pass |
| TC-F0-07 | `ROLE_PERMISSIONS` no longer exported | ✅ Pass |
| TC-F0-08 | No server permissions → `can()` false, no nav items | ✅ Pass |
| TC-F0-09 | `toSessionUser` maps `/auth/me` payload | ✅ Pass |
| TC-F0-10 | `toSessionUser` defaults (permissions `[]`, language `en`) | ✅ Pass |
| TC-F0-11 | Server permission unlocks matching nav items only | ✅ Pass |
| TC-F0-12 | OWNER wildcard sees all web nav items | ✅ Pass |
| TC-F0-13 | Drift guard: every nav permission code exists in backend (`RequirePermission` usages + migration seeds) | ✅ Pass |

### 7.3 Run results

Command: `npm --prefix apps/api run test -- ../web/src/tests` (vitest 4.1.12)

- `p3-frontend-delivery.spec.ts` — 21/21 passed (regression, unchanged)
- `f0-auth-permissions.spec.ts` — 13/13 passed
- **Total: 2 files, 34 tests, 0 failures**
- `tsc --noEmit` on `apps/api`: no errors in changed files. Existing errors remain in unrelated specs (`p4-production-readiness`, `m1-acceptance`, `supplier-bill.service.spec`).

### 7.4 Findings for follow-up (backend)

- Some codes used by controllers/nav are not seeded in `role_permissions` migrations, so non-OWNER roles lack them until seeded: `supplier.read`, `po.read`, `requisition.read`, `inventory.read`, `grn.read`. Add a seed migration (OPS_COORD; `inventory.read` also PROD_MGR/STOREKEEPER).
- No dedicated permission for user admin (`admin.users` → mapped to `config.edit`), production/BOM read (→ `wo.start`), or Finance AR (→ `analytics.read_ar`). Define proper codes in the Frontend Enablement sprint.
- `PermissionService` cache shares a single `loadedAt` across roles (stale entries possible).

