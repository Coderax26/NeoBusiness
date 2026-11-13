# Phase F13 — Advanced ERP Extensions (Phase 2+)

> **Release:** R4 and beyond · **Status:** 🔵 All items need backend design + new modules. Listed so the frontend architecture (navigation, permissions, components) leaves room for them from day one.

## 1. Goal

Bring NeoBus to parity with full-suite ERPs (Odoo, ERPNext, Zoho One, SAP B1) in areas the business will need as it grows, while keeping the same simple, guided UX.

Priority is suggested as **H / M / L** based on a multi-site food trading & processing business.

---

## 2. Extension catalogue

### 2.1 CRM & sales growth
| Feature | Description | Priority |
|---------|-------------|----------|
| Leads & opportunity pipeline | Kanban (New → Contacted → Sample sent → Negotiation → Won/Lost), expected value, follow-up reminders | M |
| Field sales visits | Plan visits, check-in with GPS, notes, orders from visit | M |
| Customer segmentation & tags | Retail / HoReCa / Distributor; filter campaigns | M |
| Schemes & discounts | Quantity slabs, festive schemes, scheme claims (respecting floor rules) | M |
| Standing negotiated prices | OD-024 deferred: customer-specific price lists with approval | H |
| WhatsApp order console | Incoming WhatsApp orders parsed into draft orders (OD-022 BSP adapter) | H |
| Customer self-service portal | Customers view statements, invoices, place repeat orders, pay online | M |
| Online payments | UPI links / payment gateway on invoices & reminders | H |
| Loyalty / rebates | Rebate accrual & settlement via credit notes | L |

### 2.2 Supply chain
| Feature | Priority |
|---------|----------|
| Barcode / QR labels for batches, bin locations; camera & scanner input | H |
| Weighing-scale integration (Bluetooth/USB) for catch-weight items | M |
| Physical stock count app with blind count (beyond G-INV-3) | H |
| Bin/rack location management & put-away | L |
| Demand forecasting & reorder suggestions (min/max, seasonality) | M |
| MRP & capacity planning (production calendar, machine/line capacity) | M |
| Inter-site fulfilment (OD-025 deferred: multi-site reservation) | M |
| Landed cost allocation (freight, loading — OD-011 deferred) | M |
| Supplier portal (view POs, confirm quantities, upload bills) | L |
| Purchase RFQ & comparison | L |

### 2.3 Quality & compliance (food business)
| Feature | Priority |
|---------|----------|
| Quality control checks at GRN & production (parameters, pass/fail, photos) | H |
| Batch traceability report: raw material lot → production batch → customer delivery (recall readiness) | H |
| FSSAI licence & compliance register with expiry reminders | M |
| Temperature/cold-chain logs | L |
| e-Invoicing (IRN/QR) activation — schema ready, OD-004 disabled for MVP | H (when turnover requires) |
| e-Way bill API generation (currently manual reference, OD-005) | M |

### 2.4 Finance & accounting
| Feature | Priority |
|---------|----------|
| Bank reconciliation (statement import, auto-match receipts/payments) | H |
| Expense management with approvals & receipts | H |
| Budgets vs actuals per site/category | M |
| Native general ledger, P&L, balance sheet (if moving beyond Tally, OD-018) | L |
| TDS/TCS handling | M |
| Multi-company / branch accounting | L |

### 2.5 People (HR & payroll)
| Feature | Priority |
|---------|----------|
| Employee master (all staff, documents, bank details) | M |
| Attendance (all staff; biometric/face integration) — extends factory attendance | M |
| Leave management | L |
| Payroll (wages, piece-rate for factory, PF/ESI) | M |
| Driver/collector incentives based on deliveries & collections | M |

### 2.6 Assets & maintenance
| Feature | Priority |
|---------|----------|
| Fixed asset register (machines, vehicles, coolers) with depreciation | L |
| Preventive maintenance schedules for vehicles & machines | M |
| Vehicle fuel efficiency & cost per km | M |
| Live GPS tracking & route optimisation | M |

### 2.7 Intelligence & productivity
| Feature | Priority |
|---------|----------|
| Custom dashboards builder (drag widgets) | M |
| Ad-hoc report builder (choose fields, filters, group-by) | M |
| AI assistant: natural-language questions ("Which customers are overdue more than 30 days in Pune?"), anomaly alerts (unusual price, wastage spikes), order entry from voice/WhatsApp text | M |
| Smart suggestions: reorder, price recommendations within band, collection priority | M |
| Dark mode, per-user themes | L |
| Full Marathi/Hindi UI with voice prompts on Floor Mode | M (OD-008 i18n-ready) |
| Native mobile Owner app parity with web dashboard | M |

---

## 3. Frontend readiness requirements (build now, use later)

| Requirement | Why |
|-------------|-----|
| Navigation config driven by permissions + feature flags | New modules appear without shell changes |
| Generic list/detail/wizard templates | New modules built in days, not weeks |
| Attachment, comments & activity components on every record | Needed by QC, CRM, HR |
| Barcode input abstraction (keyboard-wedge + camera) | Plug scanning into any picker |
| Report viewer framework | Reused by every new module |
| Theming tokens incl. dark mode | No redesign later |
| i18n for all strings from day one | Marathi/Hindi rollout is translation-only |

## 4. Suggested R4 shortlist (highest value next)

1. Barcode labels + scanning in Floor Mode
2. Batch traceability & QC checks
3. Bank reconciliation & expense management
4. Standing customer price lists (OD-024) + online payment links
5. WhatsApp order console
6. Customer portal

---

## 5. Implementation & Test Results

- **Screens Implemented:** `/extensions` — R4+ feature-flagged ERP Extensions Hub with priority filters (`H/M/L`), interactive feature-flag toggles, Barcode/QR scanner input abstraction, and Batch Traceability preview.
- **Verification:** `npm run test:fe` — **16/16 test files passed (200/200 tests)** (`f11-to-f14-final-phases.spec.ts`); `npm run check:api-routes` passed.

