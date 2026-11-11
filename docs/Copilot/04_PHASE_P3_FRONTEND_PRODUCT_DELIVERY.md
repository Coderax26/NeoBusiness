# Phase P3 — Frontend Product Delivery

## Objective

Deliver the three client products defined by `docs/claude/10_FE_Web_Frontend.md`: office web, owner/field mobile, and factory/warehouse tablet PWA.

## Current gap

`apps/web`, `apps/mobile`, and `apps/tablet` exist but contain only placeholder-level content. The backend therefore cannot be operated through the blueprint's intended user interfaces.

## F0 — Shared frontend foundation

### Tasks

- Select and document framework/runtime for web, mobile, and tablet.
- Create shared UI, API client, permissions, i18n, mocks, and feature-flag packages.
- Add design tokens, typography, status colors, responsive layout, and error states.
- Generate or hand-maintain typed API clients from OpenAPI.
- Add MSW/mock contracts for every module.
- Create Storybook/component test foundation.
- Add CI scripts for lint, unit, accessibility, and build.

### Exit criteria

- Apps boot locally with a shared shell and mock API.
- Role and permission types are shared rather than duplicated.

## F1 — Authentication and exception-first shell

### Tasks

- Implement secure cookie/session handling for web.
- Implement mobile token storage and refresh according to the approved security model.
- Add CSRF, idle timeout, PIN re-prompt, logout, device registration.
- Build role-based navigation and site switcher.
- Build exception inbox, approval card, counter-price input, escalation status, and alerts badge.
- Add notification list and deep links.
- Add realtime client with reconnect and invalidation behavior.

### Exit criteria

- OWNER, OPS_COORD, PROD_MGR, DRIVER, COLLECTOR, and STOREKEEPER see only permitted navigation and data.

## F2 — Commercial workflows

### Screens

- Daily price/floor sheet.
- Missing-price alerts.
- Customer and contact management.
- Quick order entry.
- Quote creation and expiry.
- Order tracker and approval state.
- Customer price memory and margin display for allowed roles.

### Quality gates

- Price-floor approval flow.
- Credit hold visibility.
- Masking for restricted roles.
- Offline-safe order draft behavior where required.

## F3 — Finance and collections

### Screens

- Invoice list/detail/PDF.
- AR aging and customer ledger.
- Collection entry with idempotency key.
- Receipt allocation.
- Custody wallet and handover.
- Cheque lifecycle.
- PTP follow-up.
- EOD checklist/sign-off.
- Credit note and COD settlement.
- Tally export status.

### Quality gates

- Duplicate replay returns the original result.
- Mismatched idempotency payload is rejected.
- Financial values use decimal-safe formatting.
- Restricted roles cannot see protected totals, margins, or AR data.

## F4 — Inventory and tablet warehouse

### Screens

- Stock by site/location.
- ATP and FEFO.
- Expiry/drift alerts.
- Transfers and receiving.
- Adjustments and approval.
- Ledger/reversal history.
- Blind GRN.
- Loading/in-transit status.

### Offline requirements

- IndexedDB outbox.
- Offline badge and queued-command count.
- Retry/backoff and conflict resolution.
- Photo attachment upload queue.

## F5 — Fleet and field mobile

### Screens

- Trip builder and dispatch board.
- Driver manifest.
- Stop details and navigation handoff.
- ePOD signature/photo/OTP.
- Returns and issue report.
- COD capture.
- Command queue acknowledgement.
- Collection worklist and receipt capture.

### Quality gates

- Airplane-mode completion.
- Device timestamp/skew display.
- Duplicate command replay.
- Mandatory trip-close blockers.

## F6 — Production and procurement

### Screens

- Tablet Kanban.
- BOM/version selection.
- Work-order start, material issue, output, wastage, completion.
- Attendance.
- Supplier/rate quote.
- Requisition.
- PO builder and approval.
- GRN and shortfall.
- Supplier scorecard.

## F7 — Owner dashboards and governance

### Screens

- Pulse header.
- Operational status matrix.
- EOD reconciliation.
- Customer profitability.
- Supplier scorecard.
- Yield trend.
- AR aging.
- Audit viewer.
- Policy and threshold settings.

## Frontend testing and release gates

- Unit and component tests.
- API contract tests.
- Masking and permission tests.
- Offline persistence/replay tests.
- Accessibility and keyboard tests.
- Playwright scenarios A-F.
- Performance budgets and Lighthouse checks.
- Feature flags and release checklist.

## Exit criteria

- All blueprint screens are implemented for their target role.
- Offline workflows survive restart, retry, and duplicate replay.
- UI scenarios A-F pass against the stabilized backend.

