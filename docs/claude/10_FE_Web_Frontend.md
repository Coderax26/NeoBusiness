# FE — Web Frontend (Office Desk, Owner Web Dashboard & Tablet PWA)  *(ADD — the blueprint lists screens but never designs the frontend)*

**Build order:** starts in Sprint 0 with M0 and grows with every module (see §13) · **Depends on:** M0 (auth, RBAC, config) and the API of each module it renders · **Used by:** OWNER, OPS_COORD, PROD_MGR, STOREKEEPER
**Blueprint refs:** §5.1 (screens named inside M1/M4/M6/M7), §5.2 (interfaces per role), §6.1–6.8 (screen lists), §7.1 (client presentation layer), §8.2 (Conference Room Pilot), §9.3 (field digital literacy)

**Not covered here:** the native mobile apps (Owner mobile, Driver, Collector — Flutter / React Native, offline-first). They share design tokens, the typed API client and the i18n strings from this module, but need their own spec.

---

## 1. Purpose & scope

### 1.1 Coverage check — what already existed

| Item | Already in the pack / blueprint? |
| --- | --- |
| Screens per module (M1–M7 §6) | **Yes** — 52 screens listed. 45 have a web rendition (desk or tablet); 7 are native-only (M5 S4–S7 driver app, M6 S1–S3 collector app) |
| Three client surfaces and their tech | **Yes, one line each** — Mobile app (Flutter/React Native), Factory/Warehouse tablet (PWA touch UI), Office Sales & Finance Desk (React/Next.js) |
| Local-language / large-button rule for field apps | **Yes, one line** (M0 Localisation, blueprint §9.3) |
| App shell, navigation, routing, role-based home | **No** |
| Design system, tokens, status colours, component library | **No** |
| Data fetching, state, forms, tables, realtime strategy | **No** |
| Web auth/session handling | **No** (M0 covers API auth only) |
| Marathi/Hindi i18n, Indian number & date formats | **No** |
| Accessibility, performance budgets, browser/device support | **No** |
| Tablet PWA offline behaviour (UI side) | **No** (M0 §7 covers the sync contract, not the UI) |
| Frontend testing & mock-first workflow for module-by-module delivery | **No** |

This module fills those gaps.

### 1.2 Web surfaces in scope

| Surface | Users | Device | Notes |
| --- | --- | --- | --- |
| **Office Desk** | OPS_COORD (daily), OWNER (config, analytics) | Desktop/laptop, 1366×768 and up | Dense, keyboard-fast. Quick Order Entry, trips, finance desks |
| **Owner Web Dashboard** | OWNER | Desktop browser; usable on phone browser as a fallback | Same app; the OWNER's home is the Control Tower. Native Owner app is the primary mobile experience |
| **Tablet PWA** | PROD_MGR, STOREKEEPER | 10" Android tablet, landscape, touch | Installable, offline-tolerant, large targets, no hover. Factory Kanban, blind GRN, vehicle loading, transfers |

---

## 2. Roles & surfaces

| Role | Surface | Home route | Sees in navigation |
| --- | --- | --- | --- |
| OWNER | Office Desk + Owner Web Dashboard | `/control/dashboard` | Everything, including Admin and Audit |
| OPS_COORD | Office Desk | `/home` (Today board: orders to confirm, trips to build, open issues, handovers pending) | Sales, Procurement, Inventory (read), Production (monitor), Logistics, Finance, Alerts |
| PROD_MGR | Tablet PWA | `/t/production` | Production board only; **no** price, cost or customer-ledger anywhere |
| STOREKEEPER | Tablet PWA | `/t/grn` | GRN, loading, transfers, stock (read), adjustment request |
| DRIVER, COLLECTOR | Native apps (not web) | — | — |

Navigation is built from the permission list returned by `/me` (permission codes in M0 §4). A menu item that the user cannot use is **not rendered**.

---

## 3. Frontend architecture

### 3.1 Stack (proposal — `[DECISION]` to confirm)

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | React + **Next.js** (App Router), TypeScript `strict` | Named in the blueprint; one codebase for desk and tablet |
| Rendering | Client-rendered authenticated app; server rendering only for shell and login | Internal tool; all data is behind login |
| UI | Tailwind CSS + Radix primitives (shadcn/ui pattern) in a shared `packages/ui` | Fast, accessible, easy to theme |
| Server state | TanStack Query | Caching, retries, background refresh, invalidation by module |
| API client | Generated from the backend OpenAPI spec | Types always match the API; mockable |
| Forms | React Hook Form + Zod | Validation shared with the API contract |
| Tables | TanStack Table + TanStack Virtual | Sorting, filtering, 10k-row virtualisation |
| Charts | Recharts (or ECharts for heavy analytics) | Aging buckets, trends |
| Maps | Google Maps JavaScript API | Trip builder (blueprint §7.4) |
| i18n | `next-intl`; English + **Marathi** (Hindi optional) | Mr. X and field staff read Marathi more easily |
| Realtime | Server-Sent Events (WebSocket fallback) | Approval badge, pulse, dispatch board |
| PWA / offline | Serwist (Workbox) + IndexedDB via Dexie | Tablet outbox, installable app |
| Tests | Vitest, Testing Library, Playwright, axe-core, Storybook, MSW | See §10 |

> The blueprint says only "React / Next.js". Everything else in this table is proposed.

### 3.2 Repo layout (extends README §7)

```
/web                 # Office Desk + Owner dashboard (Next.js)
/tablet              # Factory & warehouse PWA (Next.js, touch layout)
/packages
  /ui                # components, tokens, Tailwind preset
  /api-client        # generated OpenAPI client + hooks per module
  /i18n              # en / mr message files, number/date formatters
  /permissions       # can(permission, scope) helper shared with native apps
  /mocks             # MSW handlers per module (see §13)
```

### 3.3 Web authentication & session

| Concern | Rule |
| --- | --- |
| Pattern | Backend-for-frontend: Next.js route handlers proxy to the API |
| Tokens | Short-lived access token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie; **never** in localStorage |
| CSRF | Double-submit token on every mutating request |
| Login | Office/owner: phone + password. Tablet: phone + PIN/OTP (M0 §1). Rate-limit errors shown plainly |
| Idle timeout | Owner and coordinator `[DECISION]`; tablet auto-lock with PIN re-entry |
| Sensitive approvals | Re-prompt PIN/password before resolving owner-level exceptions (M7) |
| Role change | A role/site change on the server forces re-login |

### 3.4 Client state model

| State | Where | Examples |
| --- | --- | --- |
| Server data | TanStack Query, keys namespaced by module (`['m1','orders',filters]`) | Orders, stock, invoices |
| Permissions | `/me` response in a context; `can('order.confirm_in_band')` | Menu items, button visibility (UX only — the API enforces) |
| UI state | Small store (Zustand) | Sidebar, selected site, table filters |
| Filters & sort | **In the URL** query string | Shareable, back-button friendly |
| Form drafts | Autosave to session storage per route | Quick Order draft survives refresh |
| Offline outbox | IndexedDB (tablet only) | GRN, work-order completion, loading ticks |

### 3.5 Shared component inventory

| Component | Used by | Behaviour |
| --- | --- | --- |
| `AppShell`, `SideNav`, `TopBar` | all | Role-based nav, site switcher, search, alerts, language |
| `DataTable` | all lists | Sort, filter chips, column picker, virtualised, CSV export, sticky header |
| `MoneyInput` / `MoneyText` | M1, M2, M6 | Indian grouping `₹1,00,000.00`, ₹ prefix, right-aligned, no float maths |
| `QtyInput` | M1, M3, M4, M2 | Up to 3 decimals, UoM selector, dual-UoM display (`40 crate ≈ 812.4 kg`) |
| `ItemPicker`, `CustomerPicker`, `SupplierPicker` | M1, M2, M3 | Typeahead, keyboard-first, recent items |
| `PriceBandChip` | M1, M2 | Floor / Target / Cost with in-band / below-floor state |
| `MarginBadge` | M1, M7 | `(price − cost) / price`, server-supplied |
| `StatusPill` | all | One colour map per entity (§4.3) |
| `ExceptionCard` | M7, inline in M1/M2/M4/M6 | Anatomy in §7.3 |
| `Timeline` | orders, trips, POs | Status log with user and time |
| `FileUploader`, `PhotoCapture` | M2, M3, M4, M5 | Pre-signed upload, progress, retry, compress |
| `KanbanBoard` | M4 tablet | Large cards, drag or tap-to-move |
| `TripCanvas`, `MapPanel` | M5 | Drag-drop stops, capacity meter, route order |
| `NumericKeypad` | tablet | On-screen keypad for quantities, no system keyboard |
| `ConfirmDialog`, `Banner`, `Toast`, `EmptyState`, `Skeleton` | all | Consistent feedback |
| `OfflineBadge` | tablet | Online / Offline / Syncing (n) / Last synced |

---

## 4. UX & design rules

### 4.1 Principles

1. **Exception-first.** The owner's first screen is pending approvals and the pulse, not a menu of modules.
2. **Keyboard-fast desk.** Coordinators enter orders without touching the mouse (blueprint: "keyboard-fast entry").
3. **Touch-first tablet.** Targets ≥ 48 px, no hover, numeric keypad, colour-coded big buttons, local language, minimal typing (blueprint §9.3).
4. **The server is the authority** for money, margin, credit, stock and approvals. The client may show a *preview*, labelled as such, and always renders the server's final value.
5. **Calm density.** Dense tables for desk, generous spacing for tablet; one primary action per screen.

### 4.2 Business-rule behaviour in the UI

| Rule | UI behaviour |
| --- | --- |
| **BR-01** price band | Each order line shows a `PriceBandChip`: green *In band*, amber *Below floor by ₹x*. If any line is below floor, **Confirm** is replaced by **Request Price Override**. A coordinator cannot bypass it |
| **BR-02** credit | Order header shows a credit meter (`AR + this order` vs limit) and overdue days. `HOLD` shows a banner with reason; confirmation proceeds with a warning, dispatch screens show **blocked** with the reason |
| **BR-03** supplier variance | PO line shows variance %. Above threshold: badge, **Issue** disabled, banner *Waiting for owner*. Never silently altered |
| **BR-04** ATP | Per-line stock chip: available / short. If short: note *Production requirement will be created* (processed goods) or *Back-to-back PO suggested* (trading goods) |
| **BR-05** blind receiving | The GRN screen has **no** field, label or cached value for ordered quantity or price. The API omits them; a contract test enforces it |
| **BR-06** yield | *Complete batch* shows the yield variance preview and a warning past tolerance, but never blocks saving output |
| **BR-07** custody | Handover desk: expected vs counted amounts side by side; **Verify Cash Handover** stays disabled until a counted value is entered; variance highlighted in red |
| **BR-08** trip close | Coordinator's trip view lists blockers (pending stops, missing returns, COD cash not logged) |
| **Paused by exception** | Any record waiting for approval is read-only with a banner and a live status; it unlocks when `exception.resolved` arrives |
| **Append-only ledgers** | No edit or delete controls on ledger, receipt or stock-movement rows; only **Reverse…** with a mandatory reason |
| **Double submit** | Each submit carries a fresh idempotency key; the button disables on click; retries are safe |
| **Optimistic updates** | Only for non-financial changes (notes, filters). Money, stock and status changes wait for the server |

### 4.3 Design tokens & status colours

| Token group | Proposal |
| --- | --- |
| Colour roles | `primary`, `success`, `warning`, `danger`, `info`, `neutral`; each with AA-contrast text pairs. No colour-only meaning — pair with icon and label |
| Type | Latin: Inter. Devanagari: Noto Sans Devanagari (line-height ≥ 1.6). Scale 12 / 14 / 16 / 20 / 24 / 32 |
| Spacing & shape | 4 px grid; radius 6 px; tablet touch targets ≥ 48 px |
| Breakpoints | Desk ≥ 1280, laptop ≥ 1024, tablet landscape ≥ 768 |
| Numerals | Western digits by default, Indian lakh/crore grouping; per-user setting for Devanagari digits |

| Entity | Status → colour |
| --- | --- |
| Order | `DRAFT` neutral · `PENDING_APPROVAL` warning · `CONFIRMED` info · `IN_PRODUCTION_SOURCING` info · `READY` success · `DISPATCHED` info · `DELIVERED_*` success · `CLOSED` neutral · `CANCELLED`/`REJECTED` danger |
| Invoice | `UNPAID` neutral · `PARTIAL` warning · `PAID` success · `OVERDUE` danger |
| AR aging | 0–7 info · 8–15 warning · 16–30 orange · 30+ danger |
| PO | `DRAFT` neutral · `PENDING_APPROVAL` warning · `ISSUED` info · `PARTIALLY_RECEIVED` info · `CLOSED` success |
| Work order | `PLANNED` neutral · `IN_PROGRESS` info · `COMPLETED` success · variance flag danger |
| Trip / stop | `LOADING` neutral · `IN_TRANSIT` info · `COMPLETED` success · `FAILED` danger |
| Exception | `PENDING` warning (high value = danger) · `APPROVED` success · `REJECTED` danger · `COUNTERED` info · `EXPIRED` neutral |

### 4.4 Accessibility & language

| Topic | Rule |
| --- | --- |
| Standard | WCAG 2.1 AA: contrast, focus rings, full keyboard operation, labelled form fields, accessible grid roles |
| Language switch | English / मराठी in the top bar, saved to `users.preferred_language` |
| Strings | All text from message files; no concatenated sentences; allow ~30% longer Marathi text |
| Formats | Dates `DD MMM YYYY, hh:mm` in `Asia/Kolkata`; money `₹1,00,000.00`; quantities with UoM |
| Field language | Tablet: short labels, icons plus words, voice-note / photo where typing would be needed |

---

## 5. App shell & navigation

```
┌─────────────┬──────────────────────────────────────────────────────────────┐
│ NeoCore     │ Search (Ctrl+K)      Site: All ▾    Alerts (3)   EN | मराठी  Name ▾│
│             ├──────────────────────────────────────────────────────────────┤
│ Home        │ Page title                                  [ Primary action ] │
│ Sales    ▸  │ ──────────────────────────────────────────────────────────── │
│ Procure. ▸  │                                                              │
│ Inventory▸  │                      page content                            │
│ Production▸ │                                                              │
│ Logistics▸  │                                                              │
│ Finance  ▸  │                                                              │
│ Control  ▸  │                                                              │
│ Admin    ▸  │  Banner area: offline, paused-for-approval, credit hold      │
└─────────────┴──────────────────────────────────────────────────────────────┘
```

| Nav group | Entries |
| --- | --- |
| **Sales (M1)** | Quick Order · Orders · Quotes · Customers · Daily Price Sheet |
| **Procurement (M2)** | Suppliers · Purchase Orders · Requisitions · Shortfalls · Scorecards |
| **Inventory (M3)** | Stock · Expiry · Transfers · Adjustments · Ledger |
| **Production (M4)** | Work Orders (monitor) · BOMs |
| **Logistics (M5)** | Trip Builder · Dispatch Board · Issue Desk · Vehicles |
| **Finance (M6)** | Invoices · AR · Cash Handover · Cheques · Credit Notes · AP · EOD |
| **Control (M7)** | Approvals · Dashboard · Analytics · Stock Alerts · Audit · Notifications |
| **Admin (M0)** | Users · Sites & Locations · Settings (thresholds & approval policies) |

Global features: search across customers, orders, invoices, items and suppliers · site switcher (owner: *All sites*) · live **Alerts** count (pending approvals) · command palette (`Ctrl/Cmd+K`) · shortcuts such as `N` new order and `G` then `O` orders · module feature flags that hide nav entries for modules not yet released (see §13).

---

## 6. Screen inventory & routes

`Src` = module screen id (e.g. `M1-S1`). M1-S6 and M7-S1 are the same approvals screen.

### 6.1 Office Desk

| Route | Screen | Roles | Src |
| --- | --- | --- | --- |
| `/login` | Login (+ OTP) | all | M0 |
| `/home` | Coordinator Today board | OPS_COORD | ADD |
| `/sales/orders/new` | **Quick Order Entry** | OPS_COORD | M1-S1 |
| `/sales/orders`, `/sales/orders/:id` | Order tracker and detail | OPS_COORD, OWNER | M1-S5 |
| `/sales/quotes` | Quotes with expiry countdown | OPS_COORD | M1-S4 |
| `/sales/customers`, `/sales/customers/:id` | Customer 360 | OPS_COORD, OWNER | M1-S3 |
| `/sales/prices` | **Daily Base & Floor Price Sheet** | OWNER | M1-S2 |
| `/procurement/suppliers`, `/:id` | Supplier master and rate card | OPS_COORD, OWNER | M2-S1 |
| `/procurement/pos/new`, `/pos/:id` | PO builder | OPS_COORD | M2-S2 |
| `/procurement/shortfalls/:id` | Shortfall workbench | OPS_COORD | M2-S3 |
| `/procurement/requisitions` | Requisitions | OPS_COORD | M2-S5 |
| `/procurement/scorecards` | Supplier scorecard | OWNER, OPS_COORD | M2-S6 |
| `/inventory/stock` | Stock by location | OPS_COORD, OWNER | M3-S1 |
| `/inventory/expiry` | Expiry watchlist | OPS_COORD | M3-S2 |
| `/inventory/transfers` | Transfers | OPS_COORD | M3-S5 |
| `/inventory/adjustments` | Adjustment requests / approvals | OPS_COORD, OWNER | M3-S6 |
| `/inventory/ledger` | Ledger explorer | OWNER, OPS_COORD | M3-S7 |
| `/production/boms` | BOM / recipe master | OWNER, OPS_COORD | M4-S6 |
| `/production/orders` | Work-order monitor (read) | OPS_COORD | M4 |
| `/logistics/trips/new`, `/trips/:id` | **Trip builder** | OPS_COORD | M5-S1 |
| `/logistics/dispatch` | Dispatch board | OPS_COORD, OWNER | M5-S2 |
| `/logistics/issues` | Issue desk | OPS_COORD | M5-S8 |
| `/finance/invoices` | Invoice list and PDF | OPS_COORD | M6-S6 |
| `/finance/ar` | AR dashboard | OPS_COORD, OWNER | M6-S5 |
| `/finance/handover` | **Cash handover desk** | OPS_COORD (cashier), OWNER | M6-S4 |
| `/finance/cheques` | Cheque register | OPS_COORD | M6-S7 |
| `/finance/credit-notes` | Credit note queue | OPS_COORD, OWNER | M6-S8 |
| `/finance/ap` | AP and supplier payments | OPS_COORD, OWNER | M6-S10 |
| `/finance/eod` | **EOD closing** | OPS_COORD, OWNER | M6-S9 |
| `/control/approvals` | **Approval queue** | OWNER, delegate | M7-S1 / M1-S6 |
| `/control/dashboard` | Pulse header and status matrix | OWNER | M7-S2, S3 |
| `/control/analytics` | Strategic analytics | OWNER | M7-S4 |
| `/control/eod` | EOD view (owner) | OWNER | M7-S5 |
| `/control/alerts` | Stock alerts | OWNER, OPS_COORD | M7-S6 |
| `/control/audit` | Audit trail viewer | OWNER | M7-S7 |
| `/control/notifications` | Notification log | OWNER, OPS_COORD | M7-S9 |
| `/admin/settings` | Thresholds and approval policies | OWNER | M7-S8 |
| `/admin/users`, `/admin/sites` | Users, roles, sites, locations | OWNER | M0 |

### 6.2 Tablet PWA

| Route | Screen | Roles | Src |
| --- | --- | --- | --- |
| `/t/login` | Phone + PIN | PROD_MGR, STOREKEEPER | M0 |
| `/t/production` | **Daily Production Board (Kanban)** | PROD_MGR | M4-S1 |
| `/t/production/:wo` | Work order detail and **Completion form** | PROD_MGR | M4-S2, S3 |
| `/t/rm-request` | Raw-material request | PROD_MGR | M4-S4 |
| `/t/attendance` | Attendance and labour log | PROD_MGR | M4-S5 |
| `/t/grn` | **Blind GRN** | STOREKEEPER | M2-S4 / M3-S3 |
| `/t/loading` | Vehicle loading checklist | STOREKEEPER | M3-S4 |
| `/t/transfers` | Send / receive transfers | STOREKEEPER | M3-S5 |
| `/t/stock` | Stock lookup (read) | STOREKEEPER, PROD_MGR | M3-S1 |
| `/t/adjustments` | Adjustment request | STOREKEEPER | M3-S6 |

Coverage: 45 web screens, all mapped above. The 7 native-only screens are out of scope.

---

## 7. Key screen specifications

### 7.1 Quick Order Entry  *(M1-S1, Scenario A — illustrative numbers)*

```
┌ Quick Order ───────────────────────────────────────────────────────────────┐
│ Customer [ABC Traders ▾]  Site [Factory ▾]  Delivery [12 Nov] [10–12 ▾]    │
│ Credit ₹80,000 of ₹1,00,000 used ▓▓▓▓▓▓▓▓░░      Overdue: none      OK       │
├──────────────────────────────────────────────────────┬─────────────────────┤
│ # Item    Qty  UoM Price  Floor Target Margin ATP     │ Price memory        │
│ 1 Item Y  500  kg  ₹88 ▲  ₹90   ₹95    6.8%  1,200   │ 05 Nov 400 kg ₹91   │
│ 2 Item P  200  ctn ₹140   ₹135  ₹145   9.1%  250     │ 29 Oct 500 kg ₹93   │
│ + add line (Enter on last row)                       │ ... (last 5)        │
├──────────────────────────────────────────────────────┴─────────────────────┤
│ Total ₹72,000     Blended margin 7.7%                                      │
│ ▲ Item Y is below Floor: Confirm becomes "Request Price Override"          │
│                        [ Save draft ] [ Quote ] [ Request Price Override ] │
└────────────────────────────────────────────────────────────────────────────┘
```

| Aspect | Spec |
| --- | --- |
| Keyboard flow | Customer → Site → Date → line grid. `Tab` moves across cells, `Enter` on last cell adds a line, `Ctrl+Enter` submits, `Esc` closes pickers |
| Defaults | Price defaults to **Target**; qty unit defaults to the item's primary UoM |
| Live data | On item select: band (cost, floor, target), ATP for the chosen site, and last 5 prices for this customer + item (one batched call per row) |
| Validation | Quantity > 0; price > 0; delivery date ≥ today; band and credit shown inline, never as a blocking popup |
| States | In band · below floor · ATP short · credit hold · quote expiring · saved draft · server-rejected |
| Submit | Idempotent. Success → order tracker with status timeline. Override → order shown as *Pending approval* with live status |
| Performance | Row interactive in < 1 s after item select; debounce lookups 150 ms |

### 7.2 Daily Base & Floor Price Sheet  *(M1-S2)*

Table of active items: yesterday's price, landed cost (editable until M2 provides it), `min_margin_pct`, **Floor** and **Target** (inline editable; auto-floor suggestion shown as a hint), a *Missing today* filter, sticky **Publish** bar showing how many items changed. Publishing asks for confirmation, calls `PUT /prices/{date}` and shows the count of open quotes affected.

### 7.3 Approval queue and Exception Card  *(M7-S1)*

```
┌ PRICE OVERRIDE ───────────────────────────────── waiting 4 min · High ┐
│ ABC Traders wants 500 kg Item Y @ ₹88                                  │
│ Margin 6.8% · Floor ₹90 · Target ₹95 · Last price ₹91                  │
│ Impact: order SO-2611-0042 paused (₹72,000)                            │
│ [ Approve ₹88 ]   [ Counter ₹ [ 89.50 ] ]   [ Reject ]    Remarks ▾    │
└────────────────────────────────────────────────────────────────────────┘
```

| Aspect | Spec |
| --- | --- |
| Anatomy | Title, one-line summary, ≤ 6 key facts, impact line, action buttons, deep link (matches M7 §4 payload standard) |
| Actions per type | From the M7 approval matrix (e.g. Counter only for `PRICE_OVERRIDE`) |
| Interaction | Sorted by priority/value; `A` / `C` / `R` shortcuts on the focused card; counter uses a numeric input; PIN/password re-prompt before submit |
| Concurrency | If another device resolved it first, the card turns into a read-only *Resolved by …* state — no error dialogue |
| Live | New cards appear via SSE with a toast and badge; expiry countdown shown when a policy exists |

### 7.4 Owner dashboard  *(M7-S2, S3, S4)*

- **Pulse header (always visible):** Today's Sales (₹) · Gross Margin (%) · Cash Collected Today (₹) · Pending Exceptions (count, links to queue). Refresh every 30–60 s via SSE/poll; stale indicator after 2 missed refreshes.
- **Status matrix:** progress bars for Orders pending dispatch, Factory batches running, Trucks on road (*Stop X of Y*), Supplier shortfalls — each clickable to its list.
- **Analytics tabs:** customer profitability, supplier fill-rate and price inflation, yield and wastage trend, AR aging (0–7, 8–15, 16–30, 30+). Date range picker, CSV export. Margin is shown only to roles allowed to see it.

### 7.5 Trip builder  *(M5-S1)*

Three panes: **Ready orders** pool (filter by area, site, delivery window) → **Trip canvas** (stops reordered by drag; capacity meter in kg and crates against the vehicle; driver and vehicle pickers) → **Map** (sequence and distance). Warnings inline: credit hold, order not READY, capacity exceeded. *Dispatch* is enabled only after loading is confirmed on the tablet.

### 7.6 Cash handover desk and EOD  *(M6-S4, S9)*

- **Handover desk:** pick agent → wallet balance (cash, cheques) → enter counted amount → variance shown live → **Verify Cash Handover**. Variance ≠ 0 shows *Disputed* and notifies the owner.
- **EOD closing:** four check rows (trips closed, wallets zero, uninvoiced deliveries, net cash and deposit slip), each green/red with a link to fix it; **Sign-off** appears for the owner only when all are green. Timestamps captured for KPI 2.

### 7.7 Tablet screens  *(M4-S1–S3, M2-S4)*

| Screen | Spec |
| --- | --- |
| **Production Kanban** | Columns *Queued · In-Progress (Cooking / Processing / Packing) · Completed*; large cards with item, quantity, **Required By** countdown, linked order priority; tap to open, big *Start Batch* / stage buttons |
| **Completion form** | Numeric keypad for output and wastage (kg), reason picker, packaging lot, optional photo; yield preview |
| **Blind GRN** | Item list and a quantity keypad only; batch/expiry pickers; delivery-note photo; no PO quantity or price anywhere in the DOM or cache |
| **Offline** | Persistent `OfflineBadge`; actions queue with idempotency keys; a failed sync shows which item and why |

### 7.8 Shared page patterns

List page = title + primary action, filter chips (URL-synced), table, bulk actions, row → right-hand **detail drawer** with status `Timeline`. Detail page = header with status, key facts, tabs (Lines · Timeline · Documents · Audit).

---

## 8. API consumption & realtime

| Topic | Convention |
| --- | --- |
| Client | Generated from OpenAPI; one hooks file per module in `packages/api-client` |
| Errors | Typed error codes mapped to messages: `VALIDATION`, `FORBIDDEN`, `CONFLICT` (stale version), `RULE_BLOCKED` (e.g. BR-01/02), `PENDING_APPROVAL`, `OFFLINE` |
| Concurrency | Editable drafts use `ETag` / `If-Match`; a conflict opens a "reload latest" prompt |
| Idempotency | `Idempotency-Key` header on every mutating call (M0 §7) |
| Lists | Cursor pagination; filters and sort in the query string |
| Files | Pre-signed `PUT` with progress, retry and client-side image compression |
| Caching | Per-module query keys; invalidate on the matching realtime event |

| Realtime event (README §3.2) | UI effect |
| --- | --- |
| `exception.requested` | Alerts badge +1, toast, card appears in queue |
| `exception.resolved` | Unlock the paused record; update status banner |
| `order.confirmed`, `stock.reserved`, `workorder.completed`, `trip.dispatched`, `delivery.*` | Refresh order timeline and Dispatch Board |
| `collection.logged`, `handover.verified` | Pulse and wallet balances refresh |
| `stock.low`, `stock.expiring` | Stock Alerts list |
| `notification.failed` | Notification log badge for the coordinator |

---

## 9. Platform concerns

| Area | Spec |
| --- | --- |
| **Performance** | Initial route ≤ 250 KB gzip; route-level code splitting per module; list virtualisation above 200 rows; LCP < 2.5 s on a mid-range laptop over 4G; Quick Order interactions < 1 s |
| **Offline (tablet)** | Service worker caches shell and assets; IndexedDB outbox for GRN, work-order completion, loading ticks, transfers; actions that need the server's authority (confirm order, change price, approve) are disabled offline with a clear reason; conflict policy follows M0 §7 |
| **Security** | CSP without inline scripts, `frame-ancestors 'none'`, secure cookies, CSRF tokens, output encoding, no secrets in the bundle, dependency audit in CI |
| **Printing & PDF** | Invoices, challans and deposit slips come as server PDFs shown in a viewer with Print/Download. A4 by default; list pages have print CSS. `[DECISION]` thermal receipts |
| **Browsers & devices** | Latest two versions of Chrome, Edge, Safari; Chrome on Android tablets; min 1366×768 desk, 10" landscape tablet |
| **Observability** | Client error tracking, web-vitals, release tagging; every mutation carries a client-info header for the audit trail |
| **Feature flags** | One flag per module controls nav visibility and routes so modules can go live one at a time |

---

## 10. Acceptance criteria

1. **Scenario A (UI):** with Floor ₹90, entering ₹92 shows *In band* and **Confirm** works with no exception; entering ₹88 shows *Below floor by ₹2*, replaces Confirm with **Request Price Override**, and the order appears as *Pending approval*.
2. A coordinator cannot reach `/sales/prices`, `/admin/*`, `/control/audit` or owner-only approvals by URL; the API also rejects the calls.
3. A `PROD_MGR` session never receives price, cost, margin or customer-ledger fields (network-response contract test) and no such value appears in the DOM.
4. **Blind GRN:** the storekeeper's request and response contain no ordered quantity or price; automated test inspects payloads and DOM.
5. Owner receives a new Exception Card within 2 s of `exception.requested`; resolving it unlocks the originating order without a page refresh; double-resolve from two tabs leaves one resolution.
6. Submitting the same form twice (double click, retry after timeout) creates one record.
7. Tablet offline: complete a work order, record a GRN and tick loading while offline; reconnect; each syncs exactly once and the badge returns to *Online*.
8. Amounts render as `₹1,00,000.00`; quantities show UoM; dual-UoM items show both units.
9. Switching to मराठी translates every visible string (no raw keys), keeps layouts intact and persists across sessions.
10. Axe-core reports no critical violations on the main screens; the Quick Order grid is operable with the keyboard alone.
11. **Trip builder:** exceeding vehicle capacity or including a credit-hold order shows a blocking warning; Dispatch stays disabled until loading is confirmed.
12. **EOD:** Sign-off is hidden until all four checks are green; a non-zero agent wallet shows red with a link to the handover desk.
13. Web performance budgets in §9 pass in CI (Lighthouse CI) on the main routes.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| App shell, role-based nav, login, EN + मराठी · Quick Order Entry, order tracker, price sheet, customers · Approval queue and live alerts · Finance desk: invoices, AR, handover, EOD · Tablet: blind GRN, loading, Kanban, completion form · Owner Pulse header and status matrix | Dark mode · saved views and per-user dashboards · bulk import/export wizards · barcode/QR camera scanning and Bluetooth scale input · customer self-service portal and WhatsApp-order console · scheduled report digests · advanced BI/analytics drilldowns |

---

## 12. Open questions

- `[DECISION]` Confirm the stack (Next.js + Tailwind/Radix) or choose an alternative UI kit; confirm a plain React SPA is not preferred for the internal desk.
- `[DECISION]` Languages for web: English + Marathi only, or Hindi as well?
- `[DECISION]` Session idle timeouts for owner, coordinator and tablets.
- `[DECISION]` Tablet device model and screen size; PWA vs native app for the tablet; barcode scanner as keyboard-wedge or camera.
- `[DECISION]` Receipts and challans: A4 only or also 80 mm thermal print?
- `[DECISION]` Should coordinators see **cost and margin** on screens (the blueprint's Scenario A shows them), or only floor and target?
- `[DECISION]` Is the owner expected to use the web dashboard outside the office (needs public access, MFA) or mainly the mobile app?
- Brand: logo, colour palette and tone for the UI.
- Hosting and domain for the web app; staging environments.

---

## 13. Build checklist

**Frontend sprints (aligned with backend build order, README §4)**

| FE sprint | Pairs with | Scope |
| --- | --- | --- |
| **F0** (Sprint 0) | M0 | Monorepo, design tokens, `packages/ui`, app shell, login, `/me` permissions, i18n (EN/मराठी), API client generation, MSW mocks, Storybook, CI (lint, tests, a11y, Lighthouse) |
| **F1** (Sprint 0–1) | M7a | Approval queue, `ExceptionCard`, SSE client, alerts badge, notification log |
| **F2** (Sprint 1) | M1 | Daily Price Sheet, Customers, Quick Order Entry, Orders, Quotes |
| **F3** (Sprint 1) | M6 core | Invoices, AR, Cash Handover desk, EOD, cheques |
| **F4** (Sprint 2) | M3 | Stock, expiry, transfers, adjustments, ledger; tablet shell, Blind GRN, loading |
| **F5** (Sprint 2) | M5 | Trip builder, Dispatch Board, Issue Desk, vehicles |
| **F6** (Sprint 3) | M4, M2 | Tablet Kanban and completion; BOMs; PO builder, shortfalls, scorecards |
| **F7** (Sprint 3) | M7b | Owner dashboard, analytics, audit viewer, settings UI |

**Mock-first rule (so each module can be built and shown before its backend exists):** every module's screens are first built against an OpenAPI contract with MSW mock handlers, demoed in the Conference Room Pilot, then switched to the live API behind the module's feature flag.

**Checklist**

> **Traceability & Evidence:** See [`docs/BLUEPRINT_TRACEABILITY_MATRIX.md`](../BLUEPRINT_TRACEABILITY_MATRIX.md#5-frontend--client-application-traceability-docsclaude10_fe).

- [x] `[FE-CHK-01]` Repo, tooling, shared packages (`ui`, `api-client`, `i18n`, `permissions`, `mocks`)
- [x] `[FE-CHK-02]` Design tokens, Tailwind preset, font loading (Latin + Devanagari)
- [x] `[FE-CHK-03]` App shell, role-based navigation, site switcher, search, command palette
- [x] `[FE-CHK-04]` Web auth (cookie session, CSRF, idle timeout, PIN re-prompt)
- [x] `[FE-CHK-05]` `can()` permission helper and route guards
- [x] `[FE-CHK-06]` `DataTable`, `MoneyInput`, `QtyInput`, pickers, `StatusPill`, `ExceptionCard`, `Timeline`, uploaders
- [x] `[FE-CHK-07]` Realtime (SSE) client with reconnect and per-module invalidation
- [x] `[FE-CHK-08]` Module screens in the order of the F-sprint table above (`/orders`, `/procurement`, `/inventory`, `/finance`, `/control-tower`)
- [x] `[FE-CHK-09]` Tablet PWA shell, service worker, IndexedDB outbox, `OfflineBadge` (`apps/tablet`)
- [ ] `[FE-CHK-10]` Marathi translations reviewed by a native speaker; number/date formats verified *(Deferred DEF-04: dictionary in `@neo/i18n`; native speaker verification during pilot)*
- [x] `[FE-CHK-11]` Accessibility audit and keyboard pass on Quick Order Entry
- [x] `[FE-CHK-12]` Contract tests for masked roles and blind GRN
- [x] `[FE-CHK-13]` Vitest / Component acceptance for UI paths (`p3-frontend-delivery.spec.ts` 21/21 passed)
- [x] `[FE-CHK-14]` Performance budgets enforced in CI
- [x] `[FE-CHK-15]` Feature flags per module; release checklist (`RELEASE_GOVERNANCE_AND_CHECKLIST.md`)
