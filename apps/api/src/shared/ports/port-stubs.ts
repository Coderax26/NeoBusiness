/**
 * Port Stubs — placeholder implementations used until the real module is built.
 *
 * Rules:
 * - Stubs return safe defaults that allow upstream modules to operate
 * - Stubs do NOT throw errors — they return permissive values
 * - Each stub logs a warning so developers know which ports are still unimplemented
 * - Replace each stub with the real implementation when its owning module ships
 *
 * See README §4 (build order) for when each stub gets replaced.
 */

import {
  CreditPort, CreditEvaluation,
  InventoryPort, AtpResult, ReserveResult,
  ProcurementPort,
  ProductionPort,
  LedgerPort,
  ExceptionPort, ExceptionType, ExceptionPayload,
  NotifyPort, NotifyChannel,
} from './ports.interface.js';

// ─── CreditPort Stub (replaced when M6 AR ledger is built in Sprint 1) ────────

export class CreditPortStub implements CreditPort {
  async evaluate(customerId: string, _newOrderValue: string): Promise<CreditEvaluation> {
    console.warn(`[STUB] CreditPort.evaluate(${customerId}) — returning OK always`);
    return {
      status: 'OK',
      currentArBalance: '0.00',
      creditLimit: '100000.00',
      maxOverdueDays: 15,
      oldestOverdueDays: null,
    };
  }

  async canDispatch(_orderId: string): Promise<{ allowed: boolean; reason?: string }> {
    console.warn('[STUB] CreditPort.canDispatch — returning allowed always');
    return { allowed: true };
  }
}

// ─── InventoryPort Stub (replaced when M3 is built in Sprint 2) ───────────────

export class InventoryPortStub implements InventoryPort {
  async checkATP(_locationId: string, itemId: string, _qty: string, _deliveryDate: string): Promise<AtpResult> {
    console.warn(`[STUB] InventoryPort.checkATP(${itemId}) — returning unlimited stock`);
    return {
      itemId,
      siteId: 'stub',
      availableQty: '999999.000',
      uom: 'KG',
    };
  }

  async reserve(orderLineId: string, _siteId: string, itemId: string, qty: string): Promise<ReserveResult> {
    console.warn(`[STUB] InventoryPort.reserve(${orderLineId}, ${itemId}) — returning fully allocated`);
    return {
      allocated: qty,
      deficit: '0.000',
      reservationIds: [],
    };
  }

  async release(_orderLineId: string): Promise<void> {
    console.warn('[STUB] InventoryPort.release — no-op');
  }

  async postDispatch(_tripStopId: string, _lines: Array<{ itemId: string; batchId: string; qty: string }>): Promise<void> {
    console.warn('[STUB] InventoryPort.postDispatch — no-op');
  }

  async postReturn(_tripStopId: string, _lines: Array<{ itemId: string; batchId: string; qty: string; damaged: boolean }>): Promise<void> {
    console.warn('[STUB] InventoryPort.postReturn — no-op');
  }

  async postGRN(_grnId: string): Promise<void> {
    console.warn('[STUB] InventoryPort.postGRN — no-op');
  }
}

// ─── ProcurementPort Stub (replaced when M2 is built in Sprint 3) ─────────────

export class ProcurementPortStub implements ProcurementPort {
  async latestLandedCost(itemId: string): Promise<string | null> {
    console.warn(`[STUB] ProcurementPort.latestLandedCost(${itemId}) — returning null (enter manually)`);
    return null;
  }

  async createBackToBackPO(orderLineId: string): Promise<string> {
    console.warn(`[STUB] ProcurementPort.createBackToBackPO(${orderLineId}) — no-op, returning stub ID`);
    return 'stub-po-id';
  }

  async suggestBackups(_itemId: string, _deficitQty: string): Promise<Array<{ supplierId: string; unitPrice: string; availableQty: string | null }>> {
    console.warn('[STUB] ProcurementPort.suggestBackups — returning empty list');
    return [];
  }
}

// ─── ProductionPort Stub (replaced when M4 is built in Sprint 3) ──────────────

export class ProductionPortStub implements ProductionPort {
  async createRequisition(
    sourceOrderLineId: string,
    finishedItemId: string,
    netQty: string,
    requiredBy: Date,
  ): Promise<string> {
    console.warn(
      `[STUB] ProductionPort.createRequisition — logging only: line=${sourceOrderLineId}, item=${finishedItemId}, qty=${netQty}, by=${requiredBy.toISOString()}`,
    );
    return 'stub-requisition-id';
  }

  async workOrderStatus(_workOrderId: string): Promise<{ status: string; plannedQty: string; actualOutputQty: string | null } | null> {
    console.warn('[STUB] ProductionPort.workOrderStatus — returning null');
    return null;
  }
}

// ─── LedgerPort Stub (replaced when M6 is fully built in Sprint 1-2) ──────────

export class LedgerPortStub implements LedgerPort {
  async postInvoice(tripId: string): Promise<string[]> {
    console.warn(`[STUB] LedgerPort.postInvoice(${tripId}) — no-op`);
    return [];
  }

  async postReceipt(receiptId: string): Promise<void> {
    console.warn(`[STUB] LedgerPort.postReceipt(${receiptId}) — no-op`);
  }

  async postCreditNote(creditNoteId: string): Promise<void> {
    console.warn(`[STUB] LedgerPort.postCreditNote(${creditNoteId}) — no-op`);
  }
}

// ─── ExceptionPort Stub (replaced when M7a is built in Sprint 0-1) ────────────

export class ExceptionPortStub implements ExceptionPort {
  private handlers = new Map<ExceptionType, Function>();

  async raise(
    type: ExceptionType,
    referenceTable: string,
    referenceId: string,
    requestedBy: string,
    payload: ExceptionPayload,
  ): Promise<string> {
    console.warn(
      `[STUB] ExceptionPort.raise: type=${type}, ref=${referenceTable}:${referenceId}, by=${requestedBy}`,
      '\nPayload:', payload.summary,
    );
    return 'stub-exception-id';
  }

  onResolved(
    type: ExceptionType,
    handler: (exceptionId: string, action: string, remarks: string, counterJson?: object) => Promise<void>,
  ): void {
    this.handlers.set(type, handler);
    console.warn(`[STUB] ExceptionPort.onResolved registered for type=${type} (handler will never fire until M7a is built)`);
  }
}

// ─── NotifyPort Stub (replaced when M7a notification hub is built) ────────────

export class NotifyPortStub implements NotifyPort {
  async send(
    channel: NotifyChannel,
    templateCode: string,
    recipientRef: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    console.log(
      `[STUB] NotifyPort.send: channel=${channel}, template=${templateCode}, to=${recipientRef}`,
      '\nPayload:', JSON.stringify(payload, null, 2),
    );
  }
}
