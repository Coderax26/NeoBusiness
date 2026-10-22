# NeoBus — Project Overview

**Product name:** NeoBus
**Internal code name:** NeoCore
**Version:** 0.1.0 (Phase 1 — Discovery and Foundation)
**Date:** 2026-10-22

---

## What NeoBus Is

NeoBus is a mobile-first, exception-driven, lightweight ERP/CRM built specifically for a multi-site food trading and processed food manufacturing business. It replaces phone-based coordination, verbal state, and manual end-of-day accounting with a structured digital system of record.

The system is built around one central insight: **the owner should manage by exception, not by routine**. ~85% of daily operations (order confirmation, dispatch, collections, production) should be executable by staff within guardrails. The owner's ~15% is one-tap mobile approvals for anything that breaks a threshold.

---

## Business Context

### Value streams
- **Food Trading:** Buy food commodities from suppliers, sell to customers, deliver by owned fleet.
- **Processed Food Manufacturing:** Manufacture finished goods at a factory (10-15 employees), supply from raw materials.

### Sites
- Factory
- Trading storage / warehouses (multiple)
- Administrative office

### Workforce
| Role | Count | Interface |
|------|-------|-----------|
| Business Owner | 1 | Mobile app (exception approvals, dashboards) |
| Ops / Sales Coordinator | existing staff, upskilled | Web desktop |
| Production Manager | 1 | Factory tablet |
| Drivers | 3-4 | Mobile app (offline-first) |
| Collection staff | existing | Mobile app (offline-first) |
| Storekeepers | multi-site | Tablet / phone |

---

## Core Problem Solved

Before NeoBus, Mr. X was the "live human router" for all decisions: price negotiation, order capture, supplier issues, production priority, driver dispatch, payment follow-up, and EOD reconciliation. All state lived in phone calls, memory, and manual notes.

**Documented risks eliminated:**
- Selling below replacement cost (no floor price visibility)
- Missed financial entries (manual EOD)
- Stockouts from double-promising
- Cash pilferage (no real-time custody tracking)
- Unverified delivery claims

---

## What the System Produces

| Business record | NeoBus form |
|-----------------|-------------|
| Customer order call | Structured Sales Order with margin check |
| Pricing negotiation | Dynamic Floor/Target band with one-tap owner exception |
| Supplier price change | PO price-spike exception card to owner |
| Supplier shortfall | Ranked backup suppliers + allocation card |
| Production plan | Work Order from sales demand with BOM-based RM check |
| Delivery | Digital Trip Manifest with mandatory ePOD |
| Field payment | Custody wallet collection with WhatsApp receipt |
| EOD account review | 10-minute automated checklist + owner sign-off |

---

## Module Summary

| Module | Sprint | Purpose |
|--------|--------|---------|
| M0 Platform Foundation | 0 | Auth, RBAC, RLS, audit, config, offline sync |
| M7a Exception Engine | 0-1 | Exception cards, owner approvals, notifications |
| M1 Commercial and CRM | 1 | Customers, items, daily pricing, quotes, orders |
| M6 Collections and Financials | 1 | Invoices, AR, custody wallet, EOD closing |
| M3 Inventory and Warehouse | 2 | Multi-site ATP, FEFO, stock ledger, transfers |
| M5 Fleet Dispatch and Delivery | 2 | Trips, ePOD, returns, driver app |
| M4 Factory Production | 3 | BOM, work orders, yield and wastage |
| M2 Procurement and Supplier | 3 | POs, GRN, shortfall, supplier performance |
| M7b Dashboards and Analytics | 3 | Owner pulse, operational matrix, KPI analytics |

---

## Day-90 Success Criteria

1. Owner's routine call volume drops from 40-70/day to < 10/day
2. EOD reconciliation: from 60-90 minutes to < 10 minutes
3. Zero missed financial entries (confirmed by weekly audit)
4. Routine order confirmation in < 2 minutes (within floor price)
5. 100% margin visibility before order lock
6. 100% delivery ePOD completion by 20:00

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — Technology stack, module boundaries, security
- [BLUEPRINT_TRACEABILITY.md](BLUEPRINT_TRACEABILITY.md) — Requirements to implementation mapping
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) — Phased plan, milestones, risks
- [OPEN_DECISIONS.md](OPEN_DECISIONS.md) — 25 open decisions requiring business owner input
- [SECURITY.md](SECURITY.md) — Security controls and policies
- [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) — Coding conventions and workflow
- [TESTING_STRATEGY.md](TESTING_STRATEGY.md) — Testing approach and test types
- [CHANGELOG.md](CHANGELOG.md) — Version history
