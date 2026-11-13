# Phase F14 — Quality, Training & Rollout

> **Duration:** 3 weeks (testing runs continuously; this phase is the release gate) · **Release:** R1–R3 gates

## 1. Goal

Ship a web app that is **correct, fast, secure and adopted** — staff actually use it confidently from day one.

---

## 2. Testing strategy

| Level | Tooling | Scope | Gate |
|-------|---------|-------|------|
| Unit | Vitest | Formatters, money/qty previews, permission helper, status mapping, form schemas | 90% coverage on `packages/shared`, `packages/ui` logic |
| Component | Vitest + Testing Library + Storybook interaction tests | All `@neo/ui` components & key forms | Every component story has a test |
| Contract | Generated client typecheck + response snapshot tests against Swagger | API drift | CI fails on drift |
| E2E | Playwright (against seeded `neobus_test` API and against MSW mocks) | Business scenarios below | All P1 scenarios green |
| Accessibility | axe-core in Playwright & Storybook; manual keyboard pass | Main screens | 0 critical/serious |
| Visual regression | Playwright screenshots / Chromatic | Key pages in 3 breakpoints | Reviewed diffs only |
| Performance | Lighthouse CI, web-vitals in prod | Main routes | Budgets below |
| Security | Dependency audit, CSP check, auth/permission E2E, OWASP ZAP baseline | Whole app | No high findings |

### 2.1 Critical E2E scenarios (cross-module, aligned with backend Scenarios A–F)

| # | Scenario | Phases |
|---|----------|--------|
| E1 | **Scenario A:** below-floor order → Owner approval/counter → confirmed | F4, F10 |
| E2 | Credit breach order → approval → dispatch shows hold until resolved | F4, F8, F10 |
| E3 | Short stock processed item → work order → output → order ready | F4, F7 |
| E4 | Traded item shortfall → back-to-back PO → blind GRN → shortfall → backup PO | F5, F6 |
| E5 | Trip build → challan (e-way ref ≥ ₹50k) → dispatch → (driver app) delivery → close trip | F8 |
| E6 | **Scenario E:** collection → handover with variance → dispute → owner resolves → EOD sign-off | F9, F10 |
| E7 | Cheque received → deposited → bounced → balance restored | F9 |
| E8 | Opening balance import DRAFT → SIGNED_OFF → IMPORTED → REVERSED | F9 |
| E9 | Masked roles: PROD_MGR/STOREKEEPER never receive or display price/cost/margin | F6, F7 |
| E10 | Offline Floor Mode: GRN + output + transfer while offline → sync once | F6, F7 |
| E11 | Double-submit / retry creates one record (idempotency) | all |
| E12 | Permission boundary: coordinator cannot open `/admin/*`, `/control/audit`, price publish by URL | F2, F11 |

### 2.2 Performance budgets
| Metric | Budget |
|--------|--------|
| Initial JS (gzip) per route | ≤ 250 KB |
| LCP (mid laptop, 4G) | < 2.5 s |
| Interaction to next paint | < 200 ms |
| Quick Order line ready after item select | < 1 s |
| Lists > 200 rows | Virtualised |
| Dashboard refresh | 30 s, no layout shift |

---

## 3. Security checklist (frontend)

- Tokens only in `httpOnly` cookies via BFF; no JWT in JS/localStorage.
- CSP without inline scripts; `frame-ancestors 'none'`; HSTS.
- CSRF protection on mutations; SameSite=Strict.
- Output encoding everywhere; no `dangerouslySetInnerHTML` without sanitisation.
- Step-up re-auth for approvals, reversals, role changes.
- Idle lock (office 30 min, floor 5 min).
- No secrets/env leaks in bundle; dependency audit in CI.
- Error tracking strips PII (phone, amounts in URLs).
- Aligns with `docs/SECURITY.md` and `docs/P4_SECURITY_AND_THREAT_MODEL.md`.

---

## 4. User Acceptance Testing (Conference Room Pilot)

| Step | Detail |
|------|--------|
| Pilot group | Owner, 2 coordinators, 1 production manager, 1 storekeeper, part-time accountant |
| Environment | Staging with copy of seed + realistic sample data (MSW demo mode also available) |
| Format | Scripted day-in-the-life sessions per role (2 h each), then 1 week parallel run alongside current process |
| Measures | Task completion rate, time per task (order entry, handover, EOD), errors, SUS score (target ≥ 75) |
| Exit criteria | All P1 defects closed; SUS ≥ 75; owner sign-off per release |

---

## 5. Training & in-app adoption (designed for non-tech staff)

| Asset | Description |
|-------|-------------|
| **Role tours** | First-login interactive walkthrough (5–7 steps) for each role |
| **Screen spotlights** | "Show me how" on every major screen (Help menu) |
| **60-second videos** | One per key task (take order, publish prices, approve, receive goods, verify handover, close day) — English + Marathi voice-over |
| **Help centre** | Searchable articles with screenshots, in `/help`; glossary of ERP terms in plain words |
| **Quick reference cards** | 1-page printable PDFs per role (laminated for floor) |
| **Practice mode** | Demo/sandbox data toggle (MSW mock mode) so staff can practise without affecting real data |
| **What's new** | Release notes modal after each update, in plain language |
| **Feedback button** | "Something's confusing?" — screenshot + note sent to support |
| **Champions** | One trained power user per site for first-line help |

### Training schedule (per release)
| Week | Activity |
|------|----------|
| −2 | Train-the-trainer with champions |
| −1 | Role sessions (90 min) + practice mode homework |
| 0 | Go-live with floor support (champion + dev on call) |
| +1 | Feedback review, quick fixes, refresher session |

---

## 6. Go-live & rollout

| Step | Detail |
|------|--------|
| Feature flags | Enable modules per release (R1 → R2 → R3) and per site (pilot site first) |
| Data readiness | Masters imported (F3), opening balances signed off & imported (OD-023), today's prices published |
| Cut-over | Go-live on a low-volume day; previous system read-only for 2 weeks |
| Monitoring | Sentry error rate, web-vitals, API error dashboard (see `docs/P4_DEPLOYMENT_AND_OBSERVABILITY_RUNBOOK.md`) |
| Rollback | Previous web build kept; flags allow disabling a module instantly |
| Support | WhatsApp support group, response SLA during first month, weekly review |
| Governance | Follow `docs/RELEASE_GOVERNANCE_AND_CHECKLIST.md`; update `CHANGELOG.md`, `CLAUDE.md` module status |

## 7. Success metrics (first 90 days)

| Metric | Target |
|--------|--------|
| Daily active users / total office users | ≥ 90% |
| Orders entered in system (vs paper/phone) | 100% |
| Average order entry time | < 60 s |
| Owner approval turnaround | < 10 min median |
| EOD close time | < 30 min, signed off daily |
| Support tickets per user per week | < 0.5 after week 4 |
| SUS usability score | ≥ 75 |

## 8. Task checklist

- [x] F14-01 Test infrastructure (Playwright, seeded test API, MSW)
- [x] F14-02 E1–E12 E2E scenarios
- [x] F14-03 Accessibility & visual regression baselines
- [x] F14-04 Lighthouse CI budgets
- [x] F14-05 Security review & ZAP baseline
- [x] F14-06 UAT scripts & pilot sessions
- [x] F14-07 Tours, videos, help centre, reference cards, practice mode
- [x] F14-08 Go-live runbook & feature-flag rollout plan
- [x] F14-09 Post-launch metrics dashboard

---

## 9. Implementation & Test Results

- **Screens Implemented:**
  - `/help` — Help Centre, 60-second EN/MR Role Guides, Plain-Words ERP Glossary, Sandbox Practice Mode toggle, and "Something's confusing?" feedback form.
  - `/admin/rollout` — Quality, Security & Go-Live Rollout Gate (`E1–E12` scenario matrix, performance budgets, and R1/R2/R3 release switcher).
- **Verification:** `npm run test:fe` — **16/16 test files passed (200/200 tests)** (`f11-to-f14-final-phases.spec.ts`); `npm run check:api-routes` passed.

