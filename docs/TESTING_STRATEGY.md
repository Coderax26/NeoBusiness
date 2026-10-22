# NeoBus — Testing Strategy

**Version:** 1.0.0

---

## Testing Levels

### 1. Unit Tests

**What:** Individual service methods, business rule evaluations, state machine transitions, utility functions, DTO validators.

**Where:** `src/modules/<module>/tests/<module>.service.spec.ts`

**Tools:** Jest, in-memory mocks for repositories and ports

**Coverage targets:**
- All business rules (BR-01 through BR-08): 100% of rule branches
- All state machine transitions (valid and invalid)
- All permission boundary tests

**Examples:**
```typescript
// BR-01: price above floor
it('confirms order without exception when price >= floor', async () => {
  const result = await pricingService.evaluateLine({
    item: mockItem, qty: 500, price: 92,
    band: { landedCost: 82, floor: 90, target: 95 }
  });
  expect(result.status).toBe('IN_BAND');
  expect(exceptionPort.raise).not.toHaveBeenCalled();
});

// BR-01: price below floor
it('raises PRICE_OVERRIDE when price < floor', async () => {
  const result = await pricingService.evaluateLine({
    item: mockItem, qty: 500, price: 88,
    band: { landedCost: 82, floor: 90, target: 95 }
  });
  expect(result.status).toBe('BELOW_FLOOR');
  expect(exceptionPort.raise).toHaveBeenCalledWith('PRICE_OVERRIDE', expect.any(Object));
});
```

---

### 2. Integration Tests

**What:** Service + repository + real database (test DB). Test that the correct SQL is executed, transactions behave correctly, and RLS policies are enforced.

**Where:** `src/modules/<module>/tests/<module>.integration.spec.ts`

**Tools:** Jest, test PostgreSQL database (fresh per test run), database transactions rolled back after each test

**Critical integration tests:**

| Test | What it proves |
|------|---------------|
| FEFO reservation with concurrent requests | Two requests for the last 100 kg result in one success and one failure; stock never goes negative |
| BR-07 atomic collection | Forced failure mid-transaction leaves zero records in any table |
| Idempotency on double-submit | Same idempotency key submitted twice creates exactly one record |
| RLS: Storekeeper cannot see other site's stock | Cross-site stock query returns zero rows |
| Append-only trigger | `UPDATE stock_ledger_txns` raises an exception |

---

### 3. End-to-End (E2E) Tests

**What:** Full HTTP request-to-response through the running application with a real database. Test complete user journeys.

**Where:** `src/modules/<module>/tests/<module>.e2e-spec.ts`

**Tools:** Jest + supertest, real API server, real database

**Mandatory E2E tests (from M acceptance criteria):**

| Test | Scenario | Module |
|------|---------|--------|
| Scenario A path 1 | 500 kg @ 92 confirms with zero exceptions | M1 |
| Scenario A path 2 | 500 kg @ 88 -> PENDING -> owner counter -> confirmed at 89.50 | M1 + M7a |
| Coordinator cannot bypass floor via direct API | 403 on below-floor confirm | M1 |
| Scenario B | PO +12% -> owner card -> Approve & update floor | M2 + M7a |
| Scenario C | Shortfall 400 kg -> ranked backups -> covered | M2 |
| Scenario D | Driver reports partial rejection -> coordinator receives; owner does not | M5 + M7a |
| Scenario E | Worklist at 08:00; collection; PTP flow | M6 |
| Scenario F | SO 200 cartons, stock 50 -> reserve 50, requisition 150; WO completes -> READY | M3 + M4 |
| BR-07 atomicity | Force-fail mid-transaction -> no partial records | M6 |
| Offline duplicate | Submit same delivery twice -> one record | M5 |
| EOD sign-off | Four checks green -> sign-off; KPI timestamps recorded | M6 |

---

### 4. Authorization Tests

**What:** Verify that each role can only perform permitted actions.

**Where:** `src/tests/authorization.e2e-spec.ts` (shared test file covering all modules)

**Pattern for each permission boundary:**
```typescript
it('OPS_COORD cannot confirm below-floor order via API', async () => {
  const res = await request(app.getHttpServer())
    .post('/orders/123/confirm')
    .set('Authorization', `Bearer ${coordToken}`)
    .send({ lines: [{ itemId, qty: 500, price: 88 }] }); // 88 < floor 90
  expect(res.status).toBe(403);
});
```

**Roles to test for each sensitive endpoint:**
- Confirm that OWNER can perform the action
- Confirm that each non-authorized role receives 403
- Confirm that authorization failure does not leak data in the error body

---

### 5. Concurrency Tests

**What:** Verify that concurrent requests cannot create impossible states (negative stock, double-allocated cash, duplicate exception resolution).

**Where:** `src/tests/concurrency.spec.ts`

**Tests required:**
1. **Stock reservation:** Send 10 concurrent requests to reserve the last 50 kg. Exactly 0 or 1 should succeed depending on order qty; total reserved never > available.
2. **Exception resolution:** Two concurrent resolve requests for the same exception_approval. Exactly one should succeed; the second returns the same outcome (idempotent).
3. **Collection logging:** Two identical offline commands (same idempotency_key) arrive simultaneously. Exactly one record created.

---

### 6. Offline / Sync Tests

**What:** Simulate offline scenarios and verify sync behaviour.

**Scenarios:**
1. Driver captures 5 deliveries in airplane mode. On reconnect, all 5 sync with no duplicates.
2. Driver captures delivery then loses connection. On reconnect, idempotency key returns the same response.
3. Same cash collection submitted from two devices (race condition). One succeeds; the other returns the stored response.
4. ePOD photo fails to upload. Command syncs, `attachment_id` is set, photo uploads on retry. Final delivery record has the photo.

---

### 7. Security / Penetration Tests (Pre-Production)

**Manually executed against staging environment:**

1. **Floor price bypass:** Can OPS_COORD confirm a below-floor order via the API without triggering an exception? (Must fail with 403)
2. **Credit limit bypass:** Can OPS_COORD dispatch an order for a customer on HOLD without owner approval? (Must fail with 403)
3. **Cross-site data leak:** Can STOREKEEPER at Site A read stock at Site B? (Must return 200 with empty data)
4. **Cash custody bypass:** Can COLLECTOR void their own receipt? (Must fail; receipts are append-only)
5. **Audit tampering:** Can any application-role user UPDATE immutable_audit_logs? (Must fail at DB level)
6. **Token reuse:** Can an expired access token authenticate a request? (Must return 401)
7. **JWT forgery:** Can a modified token (role = OWNER) authenticate as owner? (Must return 401)

---

### 8. Conference Room Pilot (CRP)

**Before production code ships for each sprint:**

Walk Mr. X, the Production Manager, and lead collection staff through clickable wireframes / staging builds for:
- Scenarios A through F
- The 10-minute EOD closing flow
- The owner's daily 15-minute morning routine (price sheet + capacity glance)

Record any usability blockers. No sprint is marked "done" until the relevant CRP has passed.

---

### 9. 7-Day Parallel Run (End of Sprint 1)

- Run mobile collections + EOD cash handover alongside Mr. X's manual review for 7 days
- NeoCore must catch 100% of transactions
- NeoCore must surface anything the manual process missed
- Pass criteria: zero discrepancies for 5 of the 7 days; all discrepancies explained and corrected

---

## Test Infrastructure

### Test database
```bash
# Create test DB
createdb neobus_test
DATABASE_URL=postgresql://neobus:secret@localhost:5432/neobus_test npm run migrate
```

### Environment variables for tests
```
DATABASE_URL=postgresql://neobus:secret@localhost:5432/neobus_test
REDIS_URL=redis://localhost:6379/1   # use DB index 1 to separate from dev
JWT_SECRET=test-secret-not-for-production
JWT_REFRESH_SECRET=test-refresh-secret-not-for-production
```

### Running all tests
```bash
npm run test           # unit tests
npm run test:e2e       # e2e tests (requires running test DB)
npm run test:cov       # coverage report
```

### Coverage targets
- Unit tests: > 80% line coverage on all service files
- Business rule branches: 100%
- All acceptance criteria from each module's §10: 100%
