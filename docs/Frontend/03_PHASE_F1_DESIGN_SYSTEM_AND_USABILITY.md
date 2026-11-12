# Phase F1 — Design System & Usability for Non-Technical Users

> **Duration:** 2 weeks (overlaps F0 week 2) · **Release:** R1 · **Owner:** Designer + 1 FE dev

## 1. Goal

Deliver a **beautiful, calm and self-explanatory** visual language and a reusable component library (`packages/ui`) so that every screen looks consistent and can be used by staff with little computer experience — without training manuals.

---

## 2. Who we are designing for

| Persona | Role | Computer comfort | What they need |
|---------|------|------------------|----------------|
| **Mr. X — Owner** | OWNER | Medium; mostly phone | One-glance health of business, approve quickly, trust the numbers |
| **Priya — Ops Coordinator** | OPS_COORD | Medium; full-day desk user | Fast order entry, clear "to-do" list, never miss a handover or approval |
| **Ramesh — Production Manager** | PROD_MGR | Low; tablet on factory floor | Big buttons, few words, numbers keypad, works with gloves |
| **Suresh — Storekeeper** | STOREKEEPER | Low | Receive goods, load vehicles, check stock — simple steps with photos |
| **Accountant (part-time)** | OPS_COORD/OWNER | High | Ledgers, reports, Tally export, clean statements |

---

## 3. Visual language — "Clean, warm, informative"

### 3.1 Colour system

| Token | Use | Proposed value (light) |
|-------|-----|------------------------|
| `brand-600` | Primary buttons, active nav, links | Deep teal `#0F766E` (fresh/food-friendly; final from brand) |
| `brand-50` | Selected rows, soft highlights | `#F0FDFA` |
| `success` | Done, paid, in band, delivered | Green `#16A34A` |
| `warning` | Needs attention, waiting, partial | Amber `#D97706` |
| `danger` | Blocked, overdue, below floor, failed | Red `#DC2626` |
| `info` | In progress, dispatched | Blue `#2563EB` |
| `neutral` | Draft, closed, inactive | Slate `#64748B` |
| Surface | Page bg `#F8FAFC`, cards white, borders `#E2E8F0` | Soft contrast, low eye strain |
| Dark mode | Phase R3 (tokens prepared from day one) | |

**Rule:** colour is never the only signal — every status shows **icon + word + colour**.

### 3.2 Typography & spacing
- Font: **Inter** (Latin), **Noto Sans Devanagari** (Marathi/Hindi), line height ≥ 1.5 (1.6 for Devanagari).
- Scale: 12 / 14 / **16 (body)** / 20 / 24 / 32 / 40 (KPI numbers). Body text never below 14 px; Floor Mode body 18 px.
- 4 px grid; card radius 12 px; buttons 8 px; generous whitespace.
- Density toggle (Comfortable / Compact) for experienced desk users.

### 3.3 Iconography & illustration
- Lucide icons, one meaning per icon (e.g. 🚚 truck = delivery everywhere).
- Friendly empty-state illustrations ("No orders yet — create your first order").
- Module colour accents (Sales = teal, Procurement = indigo, Inventory = amber, Production = orange, Logistics = blue, Finance = green, Control = purple) used on nav icons & page headers to help users know "where am I".

### 3.4 Motion
- Subtle (150–200 ms) transitions for drawers, toasts, card updates; number "count-up" on KPI cards; respects `prefers-reduced-motion`.

---

## 4. Non-technical usability rules (the heart of this plan)

| # | Rule | Implementation |
|---|------|----------------|
| U1 | **Plain words first, ERP term second** | Labels like "Money to collect (AR)", "Goods received (GRN)". Glossary tooltip on every abbreviation |
| U2 | **Human statuses** | `PENDING_APPROVAL` → "Waiting for Owner", `IN_PRODUCTION_SOURCING` → "Being made / sourced", `DELIVERED_PARTIAL` → "Partly delivered" (status dictionary in `@neo/i18n`) |
| U3 | **One primary action per screen** | Big filled button top-right + sticky bottom bar on forms; other actions in "More ▾" |
| U4 | **Wizards for multi-step work** | Stepper with numbered steps, "Back / Next", progress saved (order entry, PO, trip, EOD, imports) |
| U5 | **Smart defaults** | Today's date, user's site, item's primary UoM, target price, last used customer site |
| U6 | **Pick, don't type** | Searchable pickers with recent items, photos/initials, and key info (customer credit, item stock) |
| U7 | **Explain consequences** | Confirm dialogs say what will happen: "Confirming will reserve 500 kg stock and send the order to dispatch." |
| U8 | **Never lose work** | Autosave drafts every 5 s (local) + "Draft saved" indicator; warn before leaving with unsaved changes |
| U9 | **Undo or reverse, never delete** | Financial/stock rows show "Reverse…" with mandatory reason; non-financial actions show a 10 s **Undo** toast |
| U10 | **Inline help** | `?` icon next to complex fields opens a short tip; each page has a "How does this work?" side panel with 3-step guide + 60 s video |
| U11 | **Guided first-time tours** | Per-role product tour on first login; per-screen spotlight tour available from Help menu |
| U12 | **Errors that help** | Red message under field in plain language + how to fix; never show stack traces or codes alone |
| U13 | **Visible system state** | Loading skeletons, "Last updated 20 s ago", offline badge, saving spinner on buttons |
| U14 | **Forgiving inputs** | Accept `1,00,000`, `100000`, `1 lakh`; phone numbers with/without +91; dates typed or picked |
| U15 | **Consistent placement** | Filters always on top, actions top-right, details in right drawer, totals bottom-right |
| U16 | **Large targets** | Min 40 px desktop, **56 px Floor Mode**; numeric keypad on floor |
| U17 | **Language switch** | English MVP (OD-008); Marathi toggle ready (`@neo/i18n/mr`) — enabled per user when reviewed |
| U18 | **Printable everything** | Every list & detail has "Print" and "Download (Excel/PDF)" |

---

## 5. Component library (`packages/ui`)

### 5.1 Foundations
`ThemeProvider`, tokens, `Button` (primary/secondary/ghost/danger, loading state), `IconButton`, `Badge`, `StatusPill`, `Avatar`, `Tooltip`, `HelpTip`, `Card`, `Tabs`, `Accordion`, `Dialog`, `ConfirmDialog`, `Drawer`, `Toast` (with Undo), `Banner`, `Skeleton`, `EmptyState`, `ErrorState`, `Stepper`, `ProgressBar`, `Kbd`.

### 5.2 Data entry
| Component | Behaviour |
|-----------|-----------|
| `TextField`, `TextArea`, `Select`, `Combobox` | Label above, helper text, error below, required marker |
| `MoneyInput` / `MoneyText` | ₹ prefix, Indian grouping (`₹1,00,000.00`), right-aligned, string value, no float |
| `QtyInput` | Up to 3 decimals, UoM selector, dual-UoM hint (`40 crate ≈ 812.4 kg`) |
| `DatePicker`, `DateRangePicker` | Presets: Today, Yesterday, This week, This month, Last month, FY |
| `PhoneInput` | +91 default, formats as typed |
| `CustomerPicker`, `ItemPicker`, `SupplierPicker`, `VehiclePicker`, `UserPicker`, `SitePicker` | Typeahead, recent first, rich rows (credit / stock / rating) |
| `NumericKeypad` | Floor Mode on-screen keypad |
| `FileDrop` / `PhotoCapture` | Drag-drop or camera, compression, progress, retry (needs upload API) |
| `SignaturePad` | For future ePOD on web |
| `LineItemGrid` | Keyboard-fast editable grid (Tab/Enter navigation) for order/PO/GRN lines |

### 5.3 Data display
| Component | Behaviour |
|-----------|-----------|
| `DataTable` | Sort, filter chips, search, column chooser, saved views, sticky header, row selection + bulk actions, virtualised, export CSV/Excel, print, empty/loading states |
| `KpiCard` | Big number, label, trend arrow vs yesterday, sparkline, click-through |
| `StatCompare` | Expected vs actual side by side with variance colour |
| `CreditMeter` | Used vs limit bar with colour zones |
| `PriceBandChip` | Cost / Floor / Target with In band / Below floor |
| `MarginBadge` | Server-calculated margin % colour-coded |
| `Timeline` | Status history with user, time, notes |
| `ExceptionCard` | Approval card: summary, facts, impact, actions |
| `KanbanBoard` | Columns with drag/tap move (production, orders) |
| `Chart` wrappers | Line, bar, stacked bar, donut, waterfall, heatmap, gauge |
| `MapPanel` | Stops/route, vehicle markers |
| `DocumentViewer` | PDF modal with print/download/share |
| `AuditTrail` | Who/when/what changed |
| `AgingBuckets` | 0–7 / 8–15 / 16–30 / 30+ coloured bars |

### 5.4 Page templates
| Template | Layout |
|----------|--------|
| **List page** | Header (title, count, primary action) → KPI strip (3–4 cards) → filter bar → table → detail drawer |
| **Detail page** | Header (doc no., status pill, key facts, actions) → progress stepper of lifecycle → tabs (Overview · Lines · Timeline · Documents · Audit) |
| **Form / wizard** | Stepper → sections in cards → sticky footer (Cancel · Save draft · Primary) |
| **Dashboard** | KPI row → charts grid → "Needs attention" list |
| **Floor screen** | Full-width big tiles, keypad, one task per screen, high contrast |

---

## 6. Status dictionary (sample — full list in `@neo/i18n`)

| Entity | Code | Shown as | Colour | Icon |
|--------|------|----------|--------|------|
| Order | `DRAFT` | Draft | neutral | pencil |
| Order | `PENDING_APPROVAL` | Waiting for Owner | warning | hourglass |
| Order | `CONFIRMED` | Confirmed | info | check |
| Order | `IN_PRODUCTION_SOURCING` | Being made / sourced | info | factory |
| Order | `READY` | Ready to dispatch | success | package |
| Order | `DISPATCHED` | On the way | info | truck |
| Order | `DELIVERED_FULL` / `_PARTIAL` | Delivered / Partly delivered | success / warning | check-circle |
| Order | `CANCELLED` / `REJECTED` | Cancelled / Rejected | danger | x |
| Invoice | UNPAID / PARTIAL / PAID / OVERDUE | Not paid / Part paid / Paid / Overdue | neutral / warning / success / danger | |
| PO | DRAFT…CLOSED | Draft · Waiting approval · Sent to supplier · Partly received · Closed | | |
| Exception | PENDING / APPROVED / REJECTED / COUNTERED / EXPIRED | Needs decision · Approved · Rejected · Counter offered · Expired | | |
| Supplier bill 3-way | MATCHED / TIMING / AMOUNT / FULL_MISMATCH | Matches PO & GRN · Timing differs · Amount differs · Does not match | | |

---

## 7. Accessibility & localisation

- WCAG 2.1 AA: contrast ≥ 4.5:1, focus rings, full keyboard support, ARIA roles for grids/dialogs, labels for all inputs.
- All strings in message files; allow +30% text length; no string concatenation.
- Formats: `₹1,00,000.00`, `12 Nov 2026, 10:30 AM`, quantities always with unit.
- Per-user preferences: language, density, date format, numerals (Western default).

---

## 8. Acceptance criteria

1. Storybook shows every component in all states (default, hover, focus, disabled, loading, error, empty).
2. Axe reports zero critical/serious issues across Storybook.
3. A non-technical tester (no prior ERP use) can, from a design prototype, identify status meaning of 10 sample records with ≥ 90% accuracy (hallway test).
4. Money/qty components never produce float artefacts (unit tests with `0.1 + 0.2` cases).
5. Floor Mode components pass 56 px target-size checks.

## 9. Task checklist

- [ ] F1-01 Brand workshop: logo, palette, tone of voice (decision D-5)
- [ ] F1-02 Figma design kit: tokens, components, 6 key screen mockups (Owner home, Coordinator home, Quick Order, Approvals, Handover, Floor GRN)
- [ ] F1-03 Tailwind preset + tokens in `@neo/ui`
- [ ] F1-04 Foundation components (§5.1)
- [ ] F1-05 Data-entry components incl. Money/Qty/pickers/LineItemGrid
- [ ] F1-06 DataTable with saved views, export, print
- [ ] F1-07 Display components (KPI, charts, timeline, exception card, kanban)
- [ ] F1-08 Page templates
- [ ] F1-09 Status dictionary & glossary in `@neo/i18n`
- [ ] F1-10 Help system primitives: `HelpTip`, "How it works" panel, tour engine
- [ ] F1-11 Storybook + axe + visual regression baseline

