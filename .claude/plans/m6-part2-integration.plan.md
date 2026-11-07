# Plan: M6 Part 2 — Accounting Bridge and M5 Integration Completion

**Location:** `C:\CodeStuff\Projects\NeoBusinessSolution\.claude\plans\m6-part2-integration.plan.md`  
**Created:** 2026-11-06  
**Sprint:** 3 Follow-up (Post-M4 Sprint 3)  
**Build Order:** M6 Part 2 → M2 → M7b  

---

## Context

**Sprint 2 Completion Gap:** Per `docs/IMPLEMENTATION_ROADMAP.md`, M6 Part 2 was scheduled for Sprint 2 but **never started**. The Sprint 2 completion criteria included "Invoice moves to trip.dispatched trigger" and "Nightly Tally export runs without errors" — both are still pending.

**Current State (as of commit 7a076c6):**
- M3 Inventory ✅ Complete
- M5 Fleet Backend ✅ 90% Complete (trip.dispatched/trip.closed events exist)
- M4 Factory Production ✅ Complete
- **M6 Part 2** ❌ **NOT STARTED**

**What M6 Part 2 Covers (from roadmap):**
1. Credit notes (from M5 returns)
2. Cheque lifecycle screens and state machine
3. Supplier AP initial (grn.posted handler)
4. **Switch invoice trigger from "Mark Dispatched" to trip.dispatched** ⬅️ **HIGH PRIORITY**
5. **COD settlement on trip.closed** ⬅️ **HIGH PRIORITY**
6. Accounting export bridge: Tally XML nightly
7. CreditPort updated to read from real AR ledger

---

## Implementation Overview

### Phase 1: M5→M6 Event Integration (Core - 2-3 days)

**Goal:** Wire M5 trip events to M6 financial services for true end-to-end order-to-cash flow.

#### 1.1: Trip Dispatched → Invoice Generation

**File:** `apps/api/src/modules/m5-fleet/trip-listener.service.ts` (NEW)

```typescript
@Injectable()
export class TripListenerService {
  constructor(
    @Inject(INVOICE_PORT) private readonly invoicePort: InvoicePort,
  ) {}

  @OnEvent('trips.dispatched')
  async handleTripDispatched(payload: TripDispatchedPayload): Promise<void> {
    // For each order in trip, generate invoice via M6
    for (const orderId of payload.orderIds) {
      await this.invoicePort.generateFromOrder(orderId, payload.siteId, payload.driverId);
    }
  }
}
```

**Changes to M6:**
- `InvoiceService.generateFromOrder()` already exists (line 112-131)
- Expose via `InvoicePort` interface (already in `ports.interface.ts`)
- Wire in `M6FinancialsModule` providers

#### 1.2: Trip Closed → COD Settlement

**File:** `apps/api/src/modules/m6-finance/cod-settlement.service.ts` (NEW)

```typescript
@Injectable()
export class CodSettlementService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    @Inject(LEDGER_PORT) private readonly ledgerPort: LedgerPort,
  ) {}

  @OnEvent('trips.closed')
  async handleTripClosed(payload: TripClosedPayload): Promise<void> {
    // For each COD stop, create collection_receipts + custody_ledger entries
    for (const stop of payload.codStops) {
      await this.settleCod(stop);
    }
  }
}
```

---

### Phase 2: Credit Notes for Returns (2 days)

**Goal:** Handle M5 returned quantities → M6 credit notes.

#### 2.1: Database Migration

**File:** `db/migrations/20261106_019_m6_add_credit_notes.sql`

```sql
-- credit_notes table
CREATE TABLE credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_no text NOT NULL,
  site_id uuid NOT NULL REFERENCES sites(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_id uuid REFERENCES sales_orders(id),
  stop_id uuid REFERENCES delivery_stops(id),
  status text NOT NULL CHECK (status IN ('DRAFT','ISSUED','APPLIED','CANCELLED')),
  reason_type text NOT NULL CHECK (reason_type IN ('RETURNED','SOLD_QUIETLY','ABNORMAL_DAMAGE','EXPIRY','OTHER')),
  total_debit numeric(14,2) NOT NULL,
  status_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- credit_note_lines table
CREATE TABLE credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  order_id uuid REFERENCES sales_orders(id),
  item_id uuid NOT NULL REFERENCES items(id),
  line_item_id uuid REFERENCES sales_order_lines(id),
  debited_qty numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  total_debit numeric(14,2) NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- RLS policies, indexes, triggers
```

#### 2.2: Credit Note Service

**File:** `apps/api/src/modules/m6-finance/credit-note.service.ts` (NEW - skeleton exists)

```typescript
@Injectable()
export class CreditNoteService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    @Inject(LEDGER_PORT) private readonly ledgerPort: LedgerPort,
  ) {}

  async createFromReturn(
    stopId: string,
    returnedLines: ReturnedLineDto[],
    raisedBy: string,
  ): Promise<CreditNoteDto> {
    // Create DRAFT credit note
    // Link to trip stop for audit trail
    // Post ADJUSTMENT ledger entries
  }
}
```

---

### Phase 3: CreditPort Real Implementation (1 day)

**Goal:** Replace `CreditPortStub` with real AR ledger reading.

**File:** `apps/api/src/modules/m6-finance/credit-port.service.ts` (NEW)

```typescript
@Injectable()
export class CreditPortService implements CreditPort {
  constructor(
    @InjectKnex() private readonly knex: Knex,
  ) {}

  async evaluate(customerId: string, newOrderValue: string): Promise<CreditEvaluation> {
    const balance = await this.knex('customer_ledger_entries')
      .where('customer_id', customerId)
      .sum('amount as balance');
    
    const creditLimit = await this.getCreditLimit(customerId);
    
    return {
      status: (balance + newOrderValue > creditLimit) ? 'BREACH' : 'OK',
      currentArBalance: balance,
      creditLimit,
      maxOverdueDays: 15,
      oldestOverdueDays: await this.getOldestOverdue(customerId),
    };
  }

  async canDispatch(orderId: string): Promise<{ allowed: boolean; reason?: string }> {
    // Check if customer has overdue invoices
    const overdue = await this.knex('invoices')
      .where('order_id', orderId)
      .andWhere('status', 'NOT_PAID')
      .andWhere('due_date', '<', new Date())
      .first();
    return { allowed: !overdue, reason: overdue ? 'OVERDUE_INVOICES' : undefined };
  }
}
```

**Register in `M6FinancialsModule`:**
```typescript
{ provide: CREDIT_PORT, useExisting: CreditPortService }
```

---

### Phase 4: Tally XML Nightly Export (2 days)

**Goal:** Idempotent nightly accounting export.

**File:** `apps/api/src/modules/m6-finance/tally-export.service.ts` (NEW)

```typescript
@Injectable()
export class TallyExportService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
  ) {}

  @Cron('0 2 * * *') // 2 AM daily
  async exportTallyXml(): Promise<void> {
    // 1. Get unexported vouchers (invoices, receipts, credit notes, journal)
    // 2. Generate Tally XML with proper grouping
    // 3. Store in tally_export_batches table with batch_id
    // 4. Mark vouchers as exported (idempotent)
    // 5. Upload to MinIO/S3 for accountant pickup
  }
}
```

**Migration:** `db/migrations/20261106_020_m6_add_tally_export.sql`

---

### Phase 5: Cheque Lifecycle (2 days)

**Goal:** Full cheque state machine (RECEIVED → DEPOSITED → CLEARED/BOUNCED).

**Files:**
- `apps/api/src/modules/m6-finance/cheque.service.ts`
- `db/migrations/20261106_021_m6_cheque_lifecycle.sql`

---

## Test Plan

### Test File: `apps/api/src/modules/m6-finance/tests/m6-part2-integration.spec.ts`

```typescript
describe('M6 Part 2: Accounting Bridge & M5 Integration', () => {
  let knex: Knex;
  let siteId: string, ownerId: string, driverId: string;
  let orderId: string, tripId: string;

  beforeAll(async () => {
    knex = await createKnex();
    await assertTestDatabase(knex);
    await new MigrationService(knex).runMigrations();
  });

  beforeEach(async () => {
    // Clean all M5/M6 tables in FK order
    // Seed: site, users (owner, driver), customer, item, sales_order
  });

  // ============ TC-M6-INT-001: trip.dispatched → Invoice ============
  it('TC-M6-INT-001: trip.dispatched event generates invoices for all loaded orders', async () => {
    // 1. Create sales order confirmed
    // 2. Create trip with that order
    // 3. Load trip (stock reserved)
    // 4. Dispatch trip (emits trips.dispatched)
    // 5. Verify InvoiceService.generateFromOrder called
    // 6. Verify invoices table has entries for each order
    // 7. Verify GST split (taxable/exempt/nil) per OD-003
  });

  // ============ TC-M6-INT-002: trip.closed → COD Settlement ============
  it('TC-M6-INT-002: trip.closed settles COD amounts into driver custody & customer ledger', async () => {
    // 1. Create trip with COD stops (is_cod=true)
    // 2. Dispatch → Close trip (emits trips.closed with cod totals)
    // 3. Verify collection_receipts created with entry_type='COLLECTION_COD'
    // 4. Verify customer_ledger_entries CREDIT posted
    // 5. Verify custody_ledger COLLECTION posted for driver
    // 6. Verify customer.current_ar_balance reduced
  });

  // ============ TC-M6-INT-003: Returns → Credit Notes ============
  it('TC-M6-INT-003: partial delivery with returned_qty creates DRAFT credit note', async () => {
    // 1. Create order, trip, dispatch
    // 2. Record ePOD with returned_qty > 0
    // 3. Verify credit_notes table has DRAFT entry
    // 4. Verify credit_note_lines match returned lines
    // 5. Verify ADJUSTMENT ledger entry posted
  });

  // ============ TC-M6-INT-004: CreditPort reads real AR ============
  it('TC-M6-INT-004: CreditPort evaluates against real customer_ledger_entries', async () => {
    // 1. Create customer with existing AR balance
    // 2. Call CreditPort.evaluate()
    // 3. Verify status='BREACH' when balance + order > limit
    // 4. Verify status='OK' when within limit
  });

  // ============ TC-M6-INT-005: Tally Export Idempotency ============
  it('TC-M6-INT-005: Tally export runs idempotently without duplicates', async () => {
    // 1. Create invoices, receipts, credit notes
    // 2. Run export twice
    // 3. Verify same batch_id not created twice
    // 4. Verify XML structure valid
  });

  // ============ TC-M6-INT-006: Cheque Lifecycle ============
  it('TC-M6-INT-006: cheque state machine RECEIVED → DEPOSITED → CLEARED', async () => {
    // 1. Create collection with mode=CHEQUE
    // 2. Verify cheque_register entry RECEIVED
    // 3. Deposit cheque → DEPOSITED
    // 4. Clear cheque → CLEARED (custody wallet updated)
  });

  // ============ Permission Boundary Tests ============
  describe('Permission Boundaries', () => {
    it('TC-M6-PERM-001: DRIVER cannot view credit notes or COD settlements', async () => {
      // Verify 403 on /finance/credit-notes, /finance/cod-settlements
    });
    it('TC-M6-PERM-002: COLLECTOR cannot approve credit notes', async () => {
      // Only OWNER/OPS_COORD can move DRAFT→ISSUED
    });
  });

  // ============ RLS Isolation Tests ============
  describe('RLS Site Isolation', () => {
    it('TC-M6-RLS-001: Site A cannot view Site B credit notes/COD settlements', async () => {
      // Verify RLS on credit_notes, tally_export_batches
    });
  });
});
```

---

## Acceptance Criteria (from roadmap)

| Criteria | Test Case | Status |
|----------|-----------|--------|
| Invoice moves to trip.dispatched trigger | TC-M6-INT-001 | ⬜ |
| COD settlement on trip.closed | TC-M6-INT-002 | ⬜ |
| Credit notes from M5 returns | TC-M6-INT-003 | ⬜ |
| CreditPort reads real AR ledger | TC-M6-INT-004 | ⬜ |
| Nightly Tally export runs without errors | TC-M6-INT-005 | ⬜ |
| Cheque lifecycle state machine | TC-M6-INT-006 | ⬜ |

---

## Verification Commands

```bash
# Phase 1: Event integration
cd apps/api
npx vitest run m6-finance --testNamePattern="trip.dispatched"
npx vitest run m5-fleet --testNamePattern="trip.closed"

# Phase 2: Credit notes
npx vitest run m6-finance --testNamePattern="credit note"

# Phase 3: CreditPort
npx vitest run m6-finance --testNamePattern="CreditPort"

# Phase 4: Tally export
npx vitest run m6-finance --testNamePattern="Tally"

# Phase 5: Cheques
npx vitest run m6-finance --testNamePattern="cheque"

# Full suite
npx vitest run m6-finance --run
npm run lint
npm run build
npm run test:e2e
```

---

## File Changes Summary

### NEW FILES
| Path | Purpose |
|------|---------|
| `apps/api/src/modules/m5-fleet/trip-listener.service.ts` | M5 event → M6 invoice bridge |
| `apps/api/src/modules/m6-finance/cod-settlement.service.ts` | COD settlement on trip.closed |
| `apps/api/src/modules/m6-finance/credit-note.service.ts` | Credit note creation from returns |
| `apps/api/src/modules/m6-finance/credit-port.service.ts` | Real CreditPort implementation |
| `apps/api/src/modules/m6-finance/tally-export.service.ts` | Nightly Tally XML export |
| `apps/api/src/modules/m6-finance/cheque.service.ts` | Cheque lifecycle |
| `apps/api/src/modules/m6-finance/tests/m6-part2-integration.spec.ts` | Integration tests |

### MIGRATIONS
| Migration | Tables |
|-----------|--------|
| `20261106_019_m6_add_credit_notes.sql` | credit_notes, credit_note_lines |
| `20261106_020_m6_add_tally_export.sql` | tally_export_batches, tally_export_items |
| `20261106_021_m6_cheque_lifecycle.sql` | cheque_register (extend) |

### MODIFY EXISTING
| Path | Change |
|------|--------|
| `apps/api/src/modules/m6-finance/m6-financials.module.ts` | Wire CREDIT_PORT, add new services |
| `apps/api/src/shared/ports/port-stubs.ts` | Add CreditPort deprecation notice |
| `apps/api/src/modules/m5-fleet/m5-fleet.module.ts` | Import M6 InvoicePort (if needed) |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Event ordering: trip.dispatched before M6 ready | Use BullMQ dead-letter queue; retry with backoff |
| Duplicate invoice generation | Idempotency key on `orderId + eventType` in outbox |
| COD settlement double-counting | Unique constraint on `(tripId, stopId, entry_type)` |
| Tally export partial failure | Transactional batch marking; resume on next run |
| CreditPort performance on large AR | Add materialised view `mv_customer_balance` refreshed nightly |

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: M5→M6 Events | 2-3 days | M5 trip events exist |
| Phase 2: Credit Notes | 2 days | Phase 1 (stopId linkage) |
| Phase 3: CreditPort | 1 day | M6 ledger tables exist |
| Phase 4: Tally Export | 2 days | Phase 1-3 complete |
| Phase 5: Cheque Lifecycle | 2 days | Independent |
| **Total** | **~9-10 days** | |

---

## Next Steps

1. **Create Phase 1 migrations** (credit_notes, tally_export, cheque extensions)
2. **Implement TripListenerService** in M5 module
3. **Implement CodSettlementService** in M6 module
4. **Write integration tests** first (TDD)
5. **Implement services** to pass tests
6. **Update CreditPort** in M6 module
7. **Add Tally export cron job**
8. **Run full test suite + E2E**

---

## References

- **M5 Fleet Spec:** `docs/modules/07_M5_Fleet_Dispatch_Delivery.md`
- **M6 Finance Spec:** `docs/modules/06_M6_Finance_Collections.md`
- **Domain Events:** `apps/api/src/shared/events/domain-events.ts`
- **Port Interfaces:** `apps/api/src/shared/ports/ports.interface.ts`
- **Current Migration:** `db/migrations/20261103_016_m6_add_credit_notes.sql` (exists but incomplete)

---

## Phase 1 Completion Checklist

- [ ] Migration 019: credit_notes, credit_note_lines
- [ ] Migration 020: tally_export_batches, tally_export_items
- [ ] Migration 021: cheque_register extensions
- [ ] TripListenerService wired in M5 module
- [ ] CodSettlementService wired in M6 module
- [ ] Integration tests passing (TC-M6-INT-001, TC-M6-INT-002)
- [ ] CreditPortService wired, stub deprecated
- [ ] TallyExportService with cron
- [ ] ChequeService with state machine
- [ ] All tests passing (lint, build, e2e)