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
  CreditPort,
  CreditEvaluation,
  InventoryPort,
  AtpResult,
  ReserveResult,
  ProcurementPort,
  ProductionPort,
  LedgerPort,
  ExceptionPort,
  ExceptionType,
  ExceptionPayload,
  NotifyPort,
  NotifyChannel,
  DashboardPort,
  PulseResponse,
  StatusMatrixResponse,
  EODViewResponse,
  KPIResponse,
  AnalyticsPort,
  CustomerProfitabilityResponse,
  SupplierScorecardResponse,
  YieldTrendResponse,
  ARAgingResponse,
} from './ports.interface.js';

// ─── CreditPort Stub (DEPRECATED: replaced by M6 CreditPortService shipped 2026-11-06) ────────

/**
 * @deprecated CreditPortStub has been replaced by M6's CreditPortService.
 * The real implementation has been wired in `m6-financials.module.ts`:
 *   { provide: CREDIT_PORT, useClass: CreditPortService }
 * This stub will be removed in a future cleanup PR.
 * Last verified: 2026-11-06 (M6 Part 2 integration)
 */
export class CreditPortStub implements CreditPort {
  async evaluate(
    customerId: string,
    _newOrderValue: string,
  ): Promise<CreditEvaluation> {
    console.warn(
      `[STUB] CreditPort.evaluate(${customerId}) — DEPRECATED. M6 CreditPortService is active since 2026-11-06. Returning OK always.`,
    );
    return {
      status: 'OK',
      currentArBalance: '0.00',
      creditLimit: '100000.00',
      maxOverdueDays: 15,
      oldestOverdueDays: null,
    };
  }

  async canDispatch(
    _orderId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    console.warn(
      '[STUB] CreditPort.canDispatch — DEPRECATED. M6 CreditPortService is active since 2026-11-06. Returning allowed always.',
    );
    return { allowed: true };
  }
}

// ─── InventoryPort Stub (replaced when M3 is built in Sprint 2) ───────────────

export class InventoryPortStub implements InventoryPort {
  async checkATP(
    _locationId: string,
    itemId: string,
    _qty: string,
    _deliveryDate: string,
  ): Promise<AtpResult> {
    console.warn(
      `[STUB] InventoryPort.checkATP(${itemId}) — returning unlimited stock`,
    );
    return {
      itemId,
      siteId: 'stub',
      availableQty: '999999.000',
      uom: 'KG',
      canFulfil: true,
    };
  }

  async reserve(
    orderLineId: string,
    _siteId: string,
    itemId: string,
    qty: string,
  ): Promise<ReserveResult> {
    console.warn(
      `[STUB] InventoryPort.reserve(${orderLineId}, ${itemId}) — returning fully allocated`,
    );
    return {
      allocated: qty,
      deficit: '0.000',
      reservationIds: [],
    };
  }

  async release(_orderLineId: string): Promise<void> {
    console.warn('[STUB] InventoryPort.release — no-op');
  }

  async postDispatch(
    _tripStopId: string,
    _lines: Array<{ itemId: string; batchId: string; qty: string }>,
  ): Promise<void> {
    console.warn('[STUB] InventoryPort.postDispatch — no-op');
  }

  async postReturn(
    _tripStopId: string,
    _lines: Array<{
      itemId: string;
      batchId: string;
      qty: string;
      damaged: boolean;
    }>,
  ): Promise<void> {
    console.warn('[STUB] InventoryPort.postReturn — no-op');
  }

  async postGRN(_grnId: string): Promise<void> {
    console.warn('[STUB] InventoryPort.postGRN — no-op');
  }

  async postConsumption(
    _workOrderId: string,
    _materialLineId: string,
    _itemId: string,
    _batchId: string,
    _qty: string,
  ): Promise<void> {
    console.warn('[STUB] InventoryPort.postConsumption — no-op');
  }

  async postOutput(
    _workOrderId: string,
    _itemId: string,
    _batchId: string,
    _qty: string,
  ): Promise<void> {
    console.warn('[STUB] InventoryPort.postOutput — no-op');
  }
}

// ─── ProcurementPort Stub (replaced when M2 is built in Sprint 3) ─────────────

export class ProcurementPortStub implements ProcurementPort {
  async latestLandedCost(itemId: string): Promise<string | null> {
    console.warn(
      `[STUB] ProcurementPort.latestLandedCost(${itemId}) — returning null (enter manually)`,
    );
    return null;
  }

  async createBackToBatchPO(orderLineId: string): Promise<string> {
    console.warn(
      `[STUB] ProcurementPort.createBackToBatchPO(${orderLineId}) — no-op, returning stub ID`,
    );
    return 'stub-po-id';
  }

  async createBackToBackPO(orderLineId: string): Promise<string> {
    return this.createBackToBatchPO(orderLineId);
  }

  async suggestBackups(
    _itemId: string,
    _deficitQty: string,
  ): Promise<
    Array<{
      supplierId: string;
      unitPrice: string;
      availableQty: string | null;
    }>
  > {
    console.warn(
      '[STUB] ProcurementPort.suggestBackups — returning empty list',
    );
    return [];
  }

  async getInboundQty(
    _itemId: string,
    _siteId: string,
  ): Promise<string> {
    console.warn(
      '[STUB] ProcurementPort.getInboundQty — returning 0 (no inbound POs)',
    );
    return '0.000';
  }
}

// ─── ProductionPort Stub (DEPRECATED: replaced by M4 WorkOrderService shipped 2026-11-03) ──────────────

/**
 * @deprecated ProductionPortStub has been replaced by M4's WorkOrderService.
 * The real implementation has been wired in `m4-production.module.ts`:
 *   { provide: PRODUCTION_PORT, useExisting: WorkOrderService }
 * This stub will be removed in a future cleanup PR.
 * Last verified: 2026-11-06 (Phase 7 acceptance tests passing)
 */
export class ProductionPortStub implements ProductionPort {
  async createRequisition(
    sourceOrderLineId: string,
    finishedItemId: string,
    netQty: string,
    requiredBy: Date,
  ): Promise<string> {
    console.warn(
      `[STUB] ProductionPort.createRequisition — DEPRECATED. M4 WorkOrderService is active since 2026-11-03. line=${sourceOrderLineId}, item=${finishedItemId}, qty=${netQty}, by=${requiredBy.toISOString()}`,
    );
    return 'stub-requisition-id';
  }

  async workOrderStatus(_workOrderId: string): Promise<{
    status: string;
    plannedQty: string;
    actualOutputQty: string | null;
  } | null> {
    console.warn(
      '[STUB] ProductionPort.workOrderStatus — DEPRECATED. M4 WorkOrderService is active since 2026-11-03',
    );
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
      '\nPayload:',
      payload.summary,
    );
    return 'stub-exception-id';
  }

  onResolved(
    type: ExceptionType,
    handler: (
      exceptionId: string,
      action: string,
      remarks: string,
      counterJson?: object,
    ) => Promise<void>,
  ): void {
    this.handlers.set(type, handler);
    console.warn(
      `[STUB] ExceptionPort.onResolved registered for type=${type} (handler will never fire until M7a is built)`,
    );
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
      '\nPayload:',
      JSON.stringify(payload, null, 2),
    );
  }
}

// ─── DashboardPort Stub (replaced when M7b is built in Sprint 3) ──────────────────

export class DashboardPortStub implements DashboardPort {
  async getPulse(
    siteId: string,
    _options?: { role?: string },
  ): Promise<PulseResponse> {
    console.warn(`[STUB] DashboardPort.getPulse(${siteId}) — returning zeros`);
    return {
      siteId,
      todaysSales: '0.00',
      grossMarginPct: '0.00',
      cashCollectedToday: '0.00',
      pendingExceptions: 0,
    };
  }

  async getStatusMatrix(
    siteId: string,
    _options?: { role?: string },
  ): Promise<StatusMatrixResponse> {
    console.warn(
      `[STUB] DashboardPort.getStatusMatrix(${siteId}) — returning zeros`,
    );
    return {
      siteId,
      ordersPendingDispatch: 0,
      batchesRunning: 0,
      trucksOnRoad: 0,
      supplierShortfalls: 0,
    };
  }

  async getEODView(siteId: string, date: string): Promise<EODViewResponse> {
    console.warn(
      `[STUB] DashboardPort.getEODView(${siteId}, ${date}) — returning empty`,
    );
    return {
      siteId,
      date,
      wallets: [],
      handovers: [],
      depositSlip: {
        totalCash: '0.00',
        totalCheque: '0.00',
        totalOnline: '0.00',
        total: '0.00',
      },
      signedOff: false,
    };
  }

  async getKPIs(siteId: string, date: string): Promise<KPIResponse> {
    console.warn(
      `[STUB] DashboardPort.getKPIs(${siteId}, ${date}) — returning zeros`,
    );
    return {
      siteId,
      date,
      ownerCallVolume: 0,
      eodTimeMinutes: 0,
      missedEntriesPct: '0.00',
      marginErosionVisibilityPct: '0.00',
      epodVisibilityPct: '0.00',
      routineOrderConfirmationMinutes: 0,
    };
  }
}

// ─── AnalyticsPort Stub (replaced when M7b is built in Sprint 3) ──────────────────

export class AnalyticsPortStub implements AnalyticsPort {
  async getCustomerProfitability(
    siteId: string,
    _dateRange: { from: string; to: string },
  ): Promise<CustomerProfitabilityResponse[]> {
    console.warn(
      `[STUB] AnalyticsPort.getCustomerProfitability(${siteId}) — returning empty`,
    );
    return [];
  }

  async getSupplierScorecard(
    siteId: string,
    _dateRange: { from: string; to: string },
  ): Promise<SupplierScorecardResponse[]> {
    console.warn(
      `[STUB] AnalyticsPort.getSupplierScorecard(${siteId}) — returning empty`,
    );
    return [];
  }

  async getYieldTrend(
    siteId: string,
    _dateRange: { from: string; to: string },
  ): Promise<YieldTrendResponse[]> {
    console.warn(
      `[STUB] AnalyticsPort.getYieldTrend(${siteId}) — returning empty`,
    );
    return [];
  }

  async getARAging(siteId: string): Promise<ARAgingResponse[]> {
    console.warn(
      `[STUB] AnalyticsPort.getARAging(${siteId}) — returning empty`,
    );
    return [];
  }
}
