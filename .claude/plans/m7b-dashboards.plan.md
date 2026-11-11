# Plan: M7b Dashboards & Analytics

**Source PRD**: `docs/modules/09_M7_Control_Tower_Exceptions.md` (Sprint 3 / M7b section)
**Selected Milestone**: M7b Dashboards & Analytics
**Complexity**: Large

## Summary
M7b builds the Owner-facing dashboards and analytics layer that consumes data from all completed modules (M1-M6). It provides real-time operational visibility (Pulse Header, Status Matrix), strategic analytics (customer/supplier/factory/AR), EOD reconciliation view, and stock alerts. The implementation centers on materialized views refreshed by domain events, with API endpoints protected by RLS and role-based permissions.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Module Structure | `m5-fleet/m5-fleet.module.ts:1` | NestJS module with controllers, services, providers |
| API Naming | `m1-commercial/order.controller.ts:42` | RESTful GET `/dashboard/*` and `/analytics/*` |
| Data Access | `m6-finance/invoice.service.ts:55` | Knex queries via injected connection, explicit transactions for writes |
| Materialized Views | `docs/modules/09_M7_Control_Tower_Exceptions.md:170` | `mv_pulse_today`, `mv_ops_status` refreshed via pg_cron or trigger |
| RLS | `m6-finance/collection.service.ts:30` | Site-scoped queries using `current_setting('app.site_ids')` |
| Testing | `m2-acceptance.spec.ts:52` | `beforeAll` with full DB setup, `assertTestDatabase` guard |
| Money/Qty | `m1-commercial/pricing.service.ts:40` | Use `Money`/`Qty` utilities for all currency/quantity math |

---

## Files to Create

| File | Action | Why |
|---|---|---|
| `apps/api/src/modules/m7b-dashboards/m7b-dashboards.module.ts` | CREATE | NestJS module definition |
| `apps/api/src/modules/m7b-dashboards/dashboard.controller.ts` | CREATE | REST endpoints for pulse, status matrix, EOD |
| `apps/api/src/modules/m7b-dashboards/analytics.controller.ts` | CREATE | REST endpoints for customer/supplier/yield/AR analytics |
| `apps/api/src/modules/m7b-dashboards/dashboard.service.ts` | CREATE | Business logic for pulse/status matrix/EOD |
| `apps/api/src/modules/m7b-dashboards/analytics.service.ts` | CREATE | Business logic for strategic analytics |
| `apps/api/src/modules/m7b-dashboards/stock-alerts.service.ts` | CREATE | Stock alert queries (low stock, expiring, committed vs available) |
| `apps/api/src/modules/m7b-dashboards/dto/dashboard.dto.ts` | CREATE | Response DTOs for dashboard endpoints |
| `apps/api/src/modules/m7b-dashboards/dto/analytics.dto.ts` | CREATE | Response DTOs for analytics endpoints |
| `apps/api/src/modules/m7b-dashboards/materialized-views/*.sql` | CREATE | SQL for `mv_pulse_today`, `mv_ops_status`, `mv_inventory_alerts`, analytics MVs |
| `db/migrations/<ts>_m7b_dashboards_materialized_views.sql` | CREATE | Migration with up/down for all MVs + refresh jobs |
| `apps/api/src/modules/m7b-dashboards/tests/m7b-acceptance.spec.ts` | CREATE | Acceptance tests covering all 10 ACs from blueprint §10 |
| `apps/api/src/modules/m7b-dashboards/jobs/mv-refresh.job.ts` | CREATE | Scheduled jobs for MV refresh (pulse 30-60s, analytics nightly) |

---

## Files to Modify

| File | Action | Why |
|---|---|---|
| `apps/api/src/app.module.ts` | UPDATE | Import `M7bDashboardsModule` |
| `apps/api/src/shared/ports/ports.interface.ts` | UPDATE | Add `DashboardPort` and `AnalyticsPort` for cross-module consumption |
| `apps/api/src/shared/events/domain-events.ts` | UPDATE | Add event types for dashboard read model updates |

---

## Database Changes

### Materialized Views (Migration)

```sql
-- mv_pulse_today: Owner Pulse Header (cached ≤30s)
CREATE MATERIALIZED VIEW mv_pulse_today AS
SELECT 
  s.site_id,
  COALESCE(SUM(CASE WHEN so.order_status IN ('CONFIRMED','DISPATCHED','DELIVERED','INVOICED') THEN so.total_amount END), 0) AS todays_sales,
  COALESCE(AVG(CASE WHEN so.total_amount > 0 THEN 
    (so.total_amount - COALESCE(cost, 0)) / so.total_amount * 100 END), 0) AS gross_margin_pct,
  COALESCE(SUM(cr.amount), 0) AS cash_collected_today,
  COUNT(ea.id) FILTER (WHERE ea.status = 'PENDING') AS pending_exceptions
FROM sites s
LEFT JOIN sales_orders so ON so.fulfillment_site_id = s.site_id 
  AND so.created_at >= CURRENT_DATE
  AND so.created_at < CURRENT_DATE + INTERVAL '1 day'
LEFT JOIN LATERAL (
  SELECT SUM(sol.ordered_qty * sol.floor_price_snapshot) AS cost
  FROM sales_order_lines sol WHERE sol.order_id = so.id
) c ON true
LEFT JOIN collection_receipts cr ON cr.site_id = s.site_id
  AND cr.received_at >= CURRENT_DATE
  AND cr.received_at < CURRENT_DATE + INTERVAL '1 day'
  AND cr.entry_type IN ('COLLECTION_COD', 'COLLECTION_CHEQUE', 'COLLECTION_ONLINE')
LEFT JOIN exception_approvals ea ON ea.site_id = s.site_id
GROUP BY s.site_id;

CREATE UNIQUE INDEX ON mv_pulse_today (site_id);
ALTER MATERIALIZED VIEW mv_pulse_today ENABLE ROW LEVEL SECURITY;
-- RLS policy: site_id = ANY(current_setting('app.site_ids')::uuid[]) OR role = 'OWNER'
```

```sql
-- mv_ops_status: Operational Status Matrix
CREATE MATERIALIZED VIEW mv_ops_status AS
SELECT 
  s.site_id,
  COUNT(so.id) FILTER (WHERE so.order_status IN ('CONFIRMED','ALLOCATED')) AS orders_pending_dispatch,
  COUNT(DISTINCT wo.id) FILTER (WHERE wo.status IN ('SCHEDULED','IN_PROGRESS')) AS batches_running,
  COUNT(DISTINCT t.id) FILTER (WHERE t.trip_status = 'IN_TRANSIT') AS trucks_on_road,
  COUNT(DISTINCT ps.id) FILTER (WHERE ps.status = 'OPEN') AS supplier_shortfalls
FROM sites s
LEFT JOIN sales_orders so ON so.fulfillment_site_id = s.site_id
LEFT JOIN work_orders wo ON wo.site_id = s.site_id
LEFT JOIN delivery_trips t ON t.site_id = s.site_id
LEFT JOIN po_shortfalls ps ON ps.site_id = s.site_id
GROUP BY s.site_id;
```

```sql
-- mv_inventory_alerts: Stock alerts
CREATE MATERIALIZED VIEW mv_inventory_alerts AS
SELECT 
  ib.site_id,
  ib.item_id,
  i.sku_code,
  i.name,
  ib.batch_number,
  ib.expiry_date,
  ib.qty_on_hand,
  ib.qty_available,
  CASE 
    WHEN ib.qty_available <= 0 THEN 'OUT_OF_STOCK'
    WHEN ib.qty_available < ib.min_qty_threshold THEN 'LOW_STOCK'
    WHEN ib.expiry_date IS NOT NULL AND ib.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'EXPIRING_SOON'
    WHEN ib.qty_committed > ib.qty_on_hand THEN 'OVERCOMMITTED'
  END AS alert_type
FROM inventory_batches ib
JOIN items i ON i.id = ib.item_id
WHERE ib.qty_available <= 0 
   OR ib.expiry_date IS NOT NULL AND ib.expiry_date <= CURRENT_DATE + INTERVAL '7 days'
   OR ib.qty_committed > ib.qty_on_hand;
```

```sql
-- mv_customer_profitability: Customer profitability ranking
CREATE MATERIALIZED VIEW mv_customer_profitability AS
SELECT 
  c.id AS customer_id,
  c.business_name,
  c.customer_code,
  COUNT(DISTINCT so.id) AS order_count,
  SUM(so.total_amount) AS revenue,
  SUM(so.total_amount - COALESCE(so_cost, 0)) AS gross_profit,
  CASE WHEN SUM(so.total_amount) > 0 
    THEN SUM(so.total_amount - COALESCE(so_cost, 0)) / SUM(so.total_amount) * 100 
    ELSE 0 END AS gross_margin_pct,
  MAX(so.created_at) AS last_order_date
FROM customers c
LEFT JOIN sales_orders so ON so.customer_id = c.id
LEFT JOIN LATERAL (
  SELECT SUM(sol.ordered_qty * sol.floor_price_snapshot) AS so_cost
  FROM sales_order_lines sol WHERE sol.order_id = so.id
) sc ON true
WHERE so.order_status NOT IN ('CANCELLED')
GROUP BY c.id, c.business_name, c.customer_code;
```

```sql
-- mv_supplier_scorecard: Supplier fill-rate & price inflation
CREATE MATERIALIZED VIEW mv_supplier_scorecard AS
SELECT 
  s.id AS supplier_id,
  s.company_name,
  s.supplier_code,
  COUNT(DISTINCT po.id) AS po_count,
  COUNT(DISTINCT gr.id) AS grn_count,
  COALESCE(SUM(grl.received_qty) / NULLIF(SUM(pol.confirmed_qty), 0), 0) AS fill_rate,
  COALESCE(AVG(pol.price_variance_pct), 0) AS avg_price_variance_pct,
  MAX(gr.received_at) AS last_receipt_date
FROM suppliers s
LEFT JOIN purchase_orders po ON po.supplier_id = s.id
LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
LEFT JOIN goods_receipts gr ON gr.po_id = po.id
LEFT JOIN goods_receipt_lines grl ON grl.grn_id = gr.id AND grl.item_id = pol.item_id
WHERE po.po_status NOT IN ('CANCELLED', 'DRAFT')
GROUP BY s.id, s.company_name, s.supplier_code;
```

```sql
-- mv_yield_trend: Factory yield & wastage trend (weekly)
CREATE MATERIALIZED VIEW mv_yield_trend AS
SELECT 
  wo.site_id,
  DATE_TRUNC('week', wo.created_at)::date AS week_start,
  SUM(wo.planned_qty) AS total_planned,
  SUM(wo.actual_output_qty) AS total_output,
  CASE WHEN SUM(wo.planned_qty) > 0 
    THEN SUM(wo.actual_output_qty) / SUM(wo.planned_qty) * 100 
    ELSE 0 END AS yield_pct,
  SUM(wo.wastage_qty) AS total_wastage,
  CASE WHEN SUM(wo.actual_output_qty) > 0
    THEN SUM(wo.wastage_qty) / SUM(wo.actual_output_qty) * 100
    ELSE 0 END AS wastage_pct
FROM work_orders wo
WHERE wo.status = 'COMPLETED'
GROUP BY wo.site_id, DATE_TRUNC('week', wo.created_at);
```

```sql
-- mv_ar_aging: AR aging buckets
CREATE MATERIALIZED VIEW mv_ar_aging AS
SELECT 
  c.id AS customer_id,
  c.business_name,
  c.customer_code,
  COALESCE(SUM(cle.balance) FILTER (WHERE cle.balance > 0), 0) AS total_outstanding,
  COALESCE(SUM(cle.balance) FILTER (WHERE cle.balance > 0 AND cle.due_date < CURRENT_DATE - INTERVAL '7 days'), 0) AS aging_0_7,
  COALESCE(SUM(cle.balance) FILTER (WHERE cle.balance > 0 AND cle.due_date < CURRENT_DATE - INTERVAL '15 days' AND cle.due_date >= CURRENT_DATE - INTERVAL '7 days'), 0) AS aging_8_15,
  COALESCE(SUM(cle.balance) FILTER (WHERE cle.balance > 0 AND cle.due_date < CURRENT_DATE - INTERVAL '30 days' AND cle.due_date >= CURRENT_DATE - INTERVAL '15 days'), 0) AS aging_16_30,
  COALESCE(SUM(cle.balance) FILTER (WHERE cle.balance > 0 AND cle.due_date < CURRENT_DATE - INTERVAL '30 days'), 0) AS aging_30_plus
FROM customers c
JOIN customer_ledger_entries cle ON cle.customer_id = c.id
WHERE cle.balance > 0
GROUP BY c.id, c.business_name, c.customer_code;
```

---

## Test Cases

### M7b Acceptance Test Suite (`m7b-acceptance.spec.ts`)

```typescript
describe('M7b Dashboards & Analytics — Blueprint §10', () => {
  let knex: Knex;
  let dashboardSvc: DashboardService;
  let analyticsSvc: AnalyticsService;
  let stockAlertsSvc: StockAlertsService;
  let siteId: string;
  let ownerId: string;
  let coordinatorId: string;

  beforeAll(async () => {
    // Full DB setup: migrations, seed data (2 sites, 6 roles, items, customers, suppliers)
    // Seed test day: 3 sales orders, 2 POs with GRN, 1 work order completed, 2 collections, 3 exceptions
  });

  describe('AC1: Pulse Header', () => {
    it('TC-M7b-001: Returns today\'s sales in ₹ matching confirmed+dispatched orders', async () => {
      const pulse = await dashboardSvc.getPulse(siteId);
      expect(pulse.todaysSales).toBe('125000.00'); // seeded test data
    });

    it('TC-M7b-002: Returns gross margin % using floor_price_snapshot cost basis', async () => {
      const pulse = await dashboardSvc.getPulse(siteId);
      expect(pulse.grossMarginPct).toBe('12.50'); // seeded: revenue 125000, cost 109375
    });

    it('TC-M7b-003: Returns cash collected today from COD/cheque/online collections', async () => {
      const pulse = await dashboardSvc.getPulse(siteId);
      expect(pulse.cashCollectedToday).toBe('45000.00'); // seeded collections
    });

    it('TC-M7b-004: Returns pending exceptions count from exception_approvals', async () => {
      const pulse = await dashboardSvc.getPulse(siteId);
      expect(pulse.pendingExceptions).toBe(3); // seeded: 1 PRICE_OVERRIDE, 1 SUPPLIER_PRICE_SPIKE, 1 ALLOCATION
    });
  });

  describe('AC2: Operational Status Matrix', () => {
    it('TC-M7b-005: Shows orders pending dispatch (CONFIRMED + ALLOCATED)', async () => {
      const matrix = await dashboardSvc.getStatusMatrix(siteId);
      expect(matrix.ordersPendingDispatch).toBe(2); // seeded: 2 orders not yet dispatched
    });

    it('TC-M7b-006: Shows factory batches running (SCHEDULED + IN_PROGRESS)', async () => {
      const matrix = await dashboardSvc.getStatusMatrix(siteId);
      expect(matrix.batchesRunning).toBe(1); // seeded: 1 WO IN_PROGRESS
    });

    it('TC-M7b-007: Shows trucks on road (IN_TRANSIT)', async () => {
      const matrix = await dashboardSvc.getStatusMatrix(siteId);
      expect(matrix.trucksOnRoad).toBe(2); // seeded: 2 trips IN_TRANSIT
    });

    it('TC-M7b-008: Shows supplier shortfalls OPEN', async () => {
      const matrix = await dashboardSvc.getStatusMatrix(siteId);
      expect(matrix.supplierShortfalls).toBe(1); // seeded: 1 shortfall OPEN
    });
  });

  describe('AC3: Customer Profitability Analytics', () => {
    it('TC-M7b-009: Returns customer profitability with revenue, gross profit, margin %', async () => {
      const analytics = await analyticsSvc.getCustomerProfitability(siteId, { from: '2026-11-01', to: '2026-11-30' });
      expect(analytics.length).toBeGreaterThan(0);
      expect(analytics[0]).toHaveProperty('customerId');
      expect(analytics[0]).toHaveProperty('revenue');
      expect(analytics[0]).toHaveProperty('grossProfit');
      expect(analytics[0]).toHaveProperty('grossMarginPct');
    });

    it('TC-M7b-010: Ranks by gross margin descending', async () => {
      const analytics = await analyticsSvc.getCustomerProfitability(siteId, { from: '2026-11-01', to: '2026-11-30' });
      for (let i = 1; i < analytics.length; i++) {
        expect(Number(analytics[i-1].grossMarginPct)).toBeGreaterThanOrEqual(Number(analytics[i].grossMarginPct));
      }
    });

    it('TC-M7b-011: Filters by date range', async () => {
      const all = await analyticsSvc.getCustomerProfitability(siteId, { from: '2026-10-01', to: '2026-11-30' });
      const recent = await analyticsSvc.getCustomerProfitability(siteId, { from: '2026-11-15', to: '2026-11-30' });
      expect(recent.length).toBeLessThanOrEqual(all.length);
    });
  });

  describe('AC4: Supplier Scorecard', () => {
    it('TC-M7b-012: Returns fill rate and avg price variance %', async () => {
      const scorecard = await analyticsSvc.getSupplierScorecard(siteId, { from: '2026-11-01', to: '2026-11-30' });
      expect(scorecard[0]).toHaveProperty('fillRate');
      expect(scorecard[0]).toHaveProperty('avgPriceVariancePct');
    });

    it('TC-M7b-013: Fill rate = received_qty / confirmed_qty', async () => {
      const scorecard = await analyticsSvc.getSupplierScorecard(siteId, { from: '2026-11-01', to: '2026-11-30' });
      const seeded = scorecard.find(s => s.supplierId === supplierAId);
      expect(Number(seeded.fillRate)).toBe(0.85); // seeded: 850/1000
    });
  });

  describe('AC5: Factory Yield & Wastage Trend', () => {
    it('TC-M7b-014: Returns weekly yield % and wastage %', async () => {
      const trend = await analyticsSvc.getYieldTrend(siteId, { from: '2026-10-01', to: '2026-11-30' });
      expect(trend.length).toBeGreaterThan(0);
      expect(trend[0]).toHaveProperty('weekStart');
      expect(trend[0]).toHaveProperty('yieldPct');
      expect(trend[0]).toHaveProperty('wastagePct');
    });

    it('TC-M7b-015: Yield = actual_output / planned_qty', async () => {
      const trend = await analyticsSvc.getYieldTrend(siteId, { from: '2026-11-01', to: '2026-11-07' });
      expect(Number(trend[0].yieldPct)).toBe(92.5); // seeded: 925/1000
    });
  });

  describe('AC6: AR Aging', () => {
    it('TC-M7b-016: Returns 4 aging buckets: 0-7, 8-15, 16-30, 30+', async () => {
      const aging = await analyticsSvc.getARAging(siteId);
      expect(aging[0]).toHaveProperty('aging_0_7');
      expect(aging[0]).toHaveProperty('aging_8_15');
      expect(aging[0]).toHaveProperty('aging_16_30');
      expect(aging[0]).toHaveProperty('aging_30_plus');
    });

    it('TC-M7b-017: Bucket sums equal total outstanding', async () => {
      const aging = await analyticsSvc.getARAging(siteId);
      const row = aging[0];
      const sum = Number(row.aging_0_7) + Number(row.aging_8_15) + Number(row.aging_16_30) + Number(row.aging_30_plus);
      expect(sum).toBeCloseTo(Number(row.totalOutstanding), 2);
    });
  });

  describe('AC7: Stock Alerts', () => {
    it('TC-M7b-018: Returns LOW_STOCK when qty_available < min_qty_threshold', async () => {
      const alerts = await stockAlertsSvc.getAlerts(siteId);
      const lowStock = alerts.find(a => a.alertType === 'LOW_STOCK');
      expect(lowStock).toBeDefined();
      expect(Number(lowStock.qtyAvailable)).toBeLessThan(Number(lowStock.minQtyThreshold));
    });

    it('TC-M7b-019: Returns EXPIRING_SOON for batches expiring within 7 days', async () => {
      const alerts = await stockAlertsSvc.getAlerts(siteId);
      const expiring = alerts.find(a => a.alertType === 'EXPIRING_SOON');
      expect(expiring).toBeDefined();
      const daysToExpiry = (new Date(expiring.expiryDate).getTime() - Date.now()) / (1000*60*60*24);
      expect(daysToExpiry).toBeLessThanOrEqual(7);
    });

    it('TC-M7b-020: Returns OVERCOMMITTED when qty_committed > qty_on_hand', async () => {
      const alerts = await stockAlertsSvc.getAlerts(siteId);
      const over = alerts.find(a => a.alertType === 'OVERCOMMITTED');
      expect(over).toBeDefined();
      expect(Number(over.qtyCommitted)).toBeGreaterThan(Number(over.qtyOnHand));
    });
  });

  describe('AC8: EOD Dashboard', () => {
    it('TC-M7b-021: Reads M6 EOD checklist - wallets, handovers, deposit slip', async () => {
      const eod = await dashboardSvc.getEODView(siteId, '2026-11-09');
      expect(eod).toHaveProperty('wallets');
      expect(eod).toHaveProperty('handovers');
      expect(eod).toHaveProperty('depositSlip');
      expect(eod).toHaveProperty('signedOff');
    });
  });

  describe('AC9: Permissions & RLS', () => {
    it('TC-M7b-022: OWNER sees all sites data', async () => {
      const pulseOwner = await dashboardSvc.getPulse(siteId, { role: 'OWNER' });
      expect(pulseOwner.todaysSales).toBeDefined();
    });

    it('TC-M7b-023: OPS_COORD sees status matrix but NOT pulse financials', async () => {
      const matrix = await dashboardSvc.getStatusMatrix(siteId, { role: 'OPS_COORD' });
      expect(matrix.ordersPendingDispatch).toBeDefined();
      // Pulse should be restricted for OPS_COORD
      await expect(dashboardSvc.getPulse(siteId, { role: 'OPS_COORD' })).rejects.toThrow();
    });

    it('TC-M7b-024: Site A owner cannot see Site B data', async () => {
      await expect(dashboardSvc.getPulse(siteBId, { role: 'OWNER', siteId })).rejects.toThrow();
    });
  });

  describe('AC10: KPI Queries', () => {
    it('TC-M7b-025: Owner call volume KPI = exceptions resolved per day', async () => {
      const kpi = await dashboardSvc.getKPIs(siteId, '2026-11-09');
      expect(kpi.ownerCallVolume).toBe(3); // seeded: 3 exceptions resolved
    });

    it('TC-M7b-026: EOD time KPI = initiated_at to signed_off_at', async () => {
      const kpi = await dashboardSvc.getKPIs(siteId, '2026-11-09');
      expect(kpi.eodTimeMinutes).toBeLessThanOrEqual(10);
    });

    it('TC-M7b-027: Missed entries KPI = 0% (all receipts reconciled)', async () => {
      const kpi = await dashboardSvc.getKPIs(siteId, '2026-11-09');
      expect(kpi.missedEntriesPct).toBe('0.00');
    });

    it('TC-M7b-028: Margin erosion visibility = 100% (all below-target orders have exception)', async () => {
      const kpi = await dashboardSvc.getKPIs(siteId, '2026-11-09');
      expect(kpi.marginErosionVisibilityPct).toBe('100.00');
    });

    it('TC-M7b-029: ePOD visibility = 100% (all trips completed before 20:00 with valid ePOD)', async () => {
      const kpi = await dashboardSvc.getKPIs(siteId, '2026-11-09');
      expect(kpi.epodVisibilityPct).toBe('100.00');
    });

    it('TC-M7b-030: Routine order confirmation < 2 min for in-band orders', async () => {
      const kpi = await dashboardSvc.getKPIs(siteId, '2026-11-09');
      expect(kpi.routineOrderConfirmationMinutes).toBeLessThanOrEqual(2);
    });
  });

  describe('Scenario Integration Tests', () => {
    it('TC-M7b-SCENARIO-A: Price override exception appears in pulse, resolved by owner', async () => {
      // Raise PRICE_OVERRIDE via M1
      // Verify pulse.pendingExceptions increments
      // Owner resolves with counter price
      // Verify pulse.pendingExceptions decrements
    });

    it('TC-M7b-SCENARIO-B: Supplier price spike shows old→new price, affected orders, suggested floor', async () => {
      // Create PO with +12% price via M2
      // Verify spike card in pulse
      // Owner approves & updates floor
      // Verify M1 floor price updated
    });

    it('TC-M7b-SCENARIO-C: Allocation card lists affected customers and supply split', async () => {
      // Create shortfall via M2 GRN
      // Verify ALLOCATION card
      // Owner allocates full/partial
      // Verify M1 order quantities updated
    });
  });
});
```

---

## Implementation Phases

### Phase 1: Database Layer (Week 1)
- [ ] Create migration with all 7 materialized views
- [ ] Add RLS policies for each MV
- [ ] Create refresh functions (`refresh_mv_pulse_today()`, etc.)
- [ ] Set up pg_cron jobs: pulse every 30s, analytics nightly
- [ ] Seed test data for acceptance tests

### Phase 2: API Layer (Week 2)
- [ ] Create `DashboardService` with `getPulse()`, `getStatusMatrix()`, `getEODView()`
- [ ] Create `AnalyticsService` with `getCustomerProfitability()`, `getSupplierScorecard()`, `getYieldTrend()`, `getARAging()`
- [ ] Create `StockAlertsService` with `getAlerts()`
- [ ] Create controllers with proper role guards
- [ ] Add OpenAPI annotations

### Phase 3: Cross-Module Integration (Week 2-3)
- [ ] Add `DashboardPort` / `AnalyticsPort` to `ports.interface.ts`
- [ ] Implement event listeners for domain events to refresh MVs
- [ ] Register `M7bDashboardsModule` in `app.module.ts`

### Phase 4: Testing & Validation (Week 3)
- [ ] Write full acceptance test suite (`m7b-acceptance.spec.ts`)
- [ ] Run tests against test DB
- [ ] Verify all 10 ACs from blueprint §10 pass
- [ ] Performance test MV refresh times

---

## Validation Commands

```bash
# Run M7b tests
cd apps/api && npx vitest run m7b-dashboards

# Build and lint
npm run build && npm run lint

# Verify materialized views
psql -d neobus_test -c "SELECT * FROM mv_pulse_today LIMIT 5"
psql -d neobus_test -c "SELECT * FROM mv_ops_status LIMIT 5"
psql -d neobus_test -c "SELECT * FROM mv_customer_profitability LIMIT 5"

# Verify migration
npm run migrate:status

# Manual API test
curl -H "Authorization: Bearer <OWNER_TOKEN>" http://localhost:3000/dashboard/pulse
curl -H "Authorization: Bearer <OWNER_TOKEN>" "http://localhost:3000/analytics/customers?from=2026-11-01&to=2026-11-30"
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MV refresh blocking concurrent reads | Medium | High | Use `CONCURRENTLY` option; refresh in off-peak |
| Cross-module event coupling | Medium | Medium | Decouple via outbox; listener fails silently with logging |
| RLS policy complexity across 7 MVs | Medium | High | Reuse M6 pattern; test with 2-site fixture |
| "Today's Sales" definition (OD-020) | High | Medium | Default to `order_status IN ('CONFIRMED','DISPATCHED','INVOICED')`; make configurable |
| Dashboard refresh expectation (OD-021) | High | Low | Start with 30s polling; upgrade to SSE if needed |

---

## Open Decisions Requiring Resolution

1. **OD-020**: "Today's Sales" definition — confirmed orders / dispatched / invoiced?
2. **OD-021**: Dashboard refresh — real-time WebSocket vs 30-60s polling?
3. **OD-022**: WhatsApp BSP provider selection (affects notification templates)
4. **Coordinator margin visibility**: Should OPS_COORD see gross margin in status matrix?

---

## Verification Checklist

- [ ] All 30+ test cases pass
- [ ] Materialized views refresh without locks
- [ ] Pulse endpoint returns < 100ms (cached 30s)
- [ ] Analytics endpoints return < 500ms for 90-day range
- [ ] RLS verified: Site A owner cannot read Site B data
- [ ] Permissions: OPS_COORD sees status matrix, not pulse financials
- [ ] Scenario A/B/C end-to-end integration tests pass
- [ ] KPI queries match seeded test day values
- [ ] Migration has valid `down` section
- [ ] OpenAPI docs generated for all endpoints