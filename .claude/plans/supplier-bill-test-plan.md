# Supplier Bill Service Implementation Plan

## Overview
Implementation of `SupplierBillService` for M2 Procurement final polish, with TDD approach.

## Phase 1: Test File (supplier-bill.service.spec.ts)

### Test Cases to Write

1. **3-Way Match Validation**
   - Rejects bill creation when PO not found
   - Rejects bill creation when GRN not found
   - Validates amounts match PO/GRN totals

2. **State Machine Transitions**
   - DRAFT → PENDING_APPROVAL (valid transition)
   - PENDING_APPROVAL → APPROVED (valid with approval)
   - PENDING_APPROVAL → REJECTED (valid with rejection)
   - Invalid transitions should throw

3. **Permission Boundaries**
   - Only OWNER can approve
   - OPS_COORD can create in DRAFT status

4. **Domain Events**
   - bill.created event raised on create
   - bill.approved event raised on approval

## Phase 2: Implementation (supplier-bill.service.ts)

### Service Structure
```typescript
@Injectable()
export class SupplierBillService {
  // State machine
  // 3-way match validation
  // Ledger integration via LedgerPort
  // Domain events via Outbox
  // Notification via NotifyPort
}
```

### Key Methods
- `create(input: CreateBillDto): Promise<SupplierBill>`
- `updateStatus(id: string, status: BillStatus): Promise<SupplierBill>`
- `getById(id: string): Promise<SupplierBill>`
- `list(status?: BillStatus, supplierId?: string): Promise<SupplierBill[]>`

## Phase 3: Integration with M2 Module

### Update Files
- m2-procurement.module.ts - add SupplierBillService provider
- m2.controller.ts - add REST endpoints
- domain-events.ts - add bill.created, bill.approved events

## Status
- [ ] Write test file
- [ ] Implement service
- [ ] Wire into module
- [ ] Run tests