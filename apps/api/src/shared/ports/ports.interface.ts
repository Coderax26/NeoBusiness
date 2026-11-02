/**
 * Port interfaces — the typed contracts between modules.
 *
 * Rules:
 * - Modules never import each other's services or repositories directly.
 * - Cross-module synchronous calls go through these port interfaces.
 * - Each port has a corresponding NestJS injection token.
 * - Stub implementations are provided until the real module is built.
 *
 * See docs/ARCHITECTURE.md §4.2 for the full port contract table.
 */

// ─── Injection tokens ────────────────────────────────────────────────────────

export const PRICING_PORT = Symbol('PRICING_PORT');
export const ITEM_PORT = Symbol('ITEM_PORT');
export const CREDIT_PORT = Symbol('CREDIT_PORT');
export const INVENTORY_PORT = Symbol('INVENTORY_PORT');
export const PROCUREMENT_PORT = Symbol('PROCUREMENT_PORT');
export const PRODUCTION_PORT = Symbol('PRODUCTION_PORT');
export const LEDGER_PORT = Symbol('LEDGER_PORT');
export const EXCEPTION_PORT = Symbol('EXCEPTION_PORT');
export const NOTIFY_PORT = Symbol('NOTIFY_PORT');

// ─── Pricing Port (owned by M1) ───────────────────────────────────────────────

export interface PriceBand {
  itemId: string;
  date: string; // YYYY-MM-DD
  latestLandedCost: string; // numeric string (Money)
  floorPrice: string;
  targetPrice: string;
  minMarginPct: number;
}

export interface PriceMemoryEntry {
  date: string;
  qty: string;
  unitPrice: string;
  orderId: string;
}

export interface PricingPort {
  getBand(itemId: string, date: string): Promise<PriceBand | null>;
  lastPrices(
    customerId: string,
    itemId: string,
    limit?: number,
  ): Promise<PriceMemoryEntry[]>;
}

// ─── Item Port (owned by M1) ──────────────────────────────────────────────────

export interface ItemSummary {
  id: string;
  skuCode: string;
  name: string;
  category: 'TRADED_GOOD' | 'RAW_MATERIAL' | 'PROCESSED_FG' | 'PACKAGING';
  primaryUom: string;
  secondaryUom: string | null;
  shelfLifeDays: number | null;
  taxRatePct: string;
  hsnCode: string | null;
  isCatchWeight: boolean;
  standardWeightPerSecondaryKg: string | null;
}

export interface UomConversion {
  itemId: string;
  fromUom: string;
  toUom: string;
  factor: string; // numeric string
}

export interface ItemPort {
  getItem(itemId: string): Promise<ItemSummary | null>;
  getUomConversion(
    itemId: string,
    fromUom: string,
    toUom: string,
  ): Promise<UomConversion | null>;
}

// ─── Credit Port (owned by M1, reads M6) ─────────────────────────────────────

export type CreditStatus = 'OK' | 'HOLD' | 'COD_ONLY';

export interface CreditEvaluation {
  status: CreditStatus;
  currentArBalance: string;
  creditLimit: string;
  maxOverdueDays: number;
  oldestOverdueDays: number | null;
  reason?: string;
}

export interface CreditPort {
  evaluate(
    customerId: string,
    newOrderValue: string,
  ): Promise<CreditEvaluation>;
  canDispatch(orderId: string): Promise<{ allowed: boolean; reason?: string }>;
}

// ─── Inventory Port (owned by M3) ─────────────────────────────────────────────

export interface AtpResult {
  itemId: string;
  siteId: string;
  locationId?: string;
  availableQty: string; // numeric string (Qty)
  uom: string;
  canFulfil: boolean;
}

export interface ReserveResult {
  allocated: string; // qty that was reserved
  deficit: string; // qty that could not be reserved (0 if fully covered)
  reservationIds: string[];
}

export interface InventoryPort {
  checkATP(
    locationId: string,
    itemId: string,
    qty: string,
    deliveryDate: string,
  ): Promise<AtpResult>;
  reserve(
    orderLineId: string,
    siteId: string,
    itemId: string,
    qty: string,
    deliveryDate: string,
  ): Promise<ReserveResult>;
  release(orderLineId: string): Promise<void>;
  postDispatch(
    tripStopId: string,
    lines: Array<{ itemId: string; batchId: string; qty: string }>,
  ): Promise<void>;
  postReturn(
    tripStopId: string,
    lines: Array<{
      itemId: string;
      batchId: string;
      qty: string;
      damaged: boolean;
    }>,
  ): Promise<void>;
  postGRN(grnId: string): Promise<void>;
}

// ─── Procurement Port (owned by M2) ──────────────────────────────────────────

export interface ProcurementPort {
  latestLandedCost(itemId: string): Promise<string | null>; // null = not available yet
  createBackToBackPO(orderLineId: string): Promise<string>; // returns PO draft ID
  suggestBackups(
    itemId: string,
    deficitQty: string,
  ): Promise<
    Array<{
      supplierId: string;
      unitPrice: string;
      availableQty: string | null;
    }>
  >;
}

// ─── Production Port (owned by M4) ────────────────────────────────────────────

export interface ProductionPort {
  createRequisition(
    sourceOrderLineId: string,
    finishedItemId: string,
    netQty: string,
    requiredBy: Date,
  ): Promise<string>; // returns requisition ID
  workOrderStatus(
    workOrderId: string,
  ): Promise<{
    status: string;
    plannedQty: string;
    actualOutputQty: string | null;
  } | null>;
}

// ─── Ledger Port (owned by M6) ────────────────────────────────────────────────

export interface LedgerPort {
  postInvoice(tripId: string): Promise<string[]>; // returns invoice IDs created
  postReceipt(receiptId: string): Promise<void>;
  postCreditNote(creditNoteId: string): Promise<void>;
}

// ─── Exception Port (owned by M7a) ────────────────────────────────────────────

export type ExceptionType =
  | 'PRICE_OVERRIDE'
  | 'CREDIT_BREACH'
  | 'SUPPLIER_PRICE_SPIKE'
  | 'SUPPLIER_SHORTFALL'
  | 'ALLOCATION'
  | 'YIELD_VARIANCE'
  | 'WASTAGE_WRITEOFF'
  | 'STOCK_VARIANCE'
  | 'CREDIT_REBATE_WRITEOFF'
  | 'DELIVERY_DISPUTE'
  | 'MANUAL_LEDGER_ADJUSTMENT'
  | 'CASH_HANDOVER_VARIANCE';

export interface ExceptionPayload {
  title: string;
  summary: string;
  facts: Array<{ label: string; value: string }>;
  impact: string;
  actions: Array<{ code: string; label: string }>;
  deepLink?: string;
  valueAtRisk?: string;
}

export interface ExceptionPort {
  raise(
    type: ExceptionType,
    referenceTable: string,
    referenceId: string,
    requestedBy: string,
    payload: ExceptionPayload,
    siteId?: string,
  ): Promise<string>; // returns exception_approvals ID

  onResolved(
    type: ExceptionType,
    handler: (
      exceptionId: string,
      action: string,
      remarks: string,
      counterJson?: object,
    ) => Promise<void>,
  ): void;
}

// ─── Notify Port (owned by M7a) ───────────────────────────────────────────────

export type NotifyChannel = 'FCM' | 'WHATSAPP' | 'SMS' | 'IN_APP';

export interface NotifyPort {
  send(
    channel: NotifyChannel,
    templateCode: string,
    recipientRef: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}
