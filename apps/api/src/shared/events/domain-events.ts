/**
 * Domain Event definitions — the contracts for all cross-module async communication.
 *
 * Rules:
 * - Events are published via the Outbox (inside the DB transaction)
 * - Events are consumed by BullMQ handlers in the subscribing module
 * - Event payloads must be serializable to JSON
 * - Events are immutable records of something that already happened
 *
 * See docs/ARCHITECTURE.md §4.3 and README §3.2 for the event contract table.
 */

// ─── Event envelope ────────────────────────────────────────────────────────────

export interface DomainEvent<T = Record<string, unknown>> {
  id: string; // UUIDv7
  type: EventType;
  aggregateId: string; // primary key of the source entity
  payload: T;
  publishedAt: string; // ISO 8601 UTC
  moduleSource: ModuleSource;
}

export type ModuleSource =
  'm0' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7';

export type EventType =
  | 'price.updated'
  | 'order.pending_approval'
  | 'order.confirmed'
  | 'order.credit_evaluated'
  | 'order.cancelled'
  | 'stock.reserved'
  | 'stock.insufficient'
  | 'stock.low'
  | 'stock.expiring'
  | 'production.requisition_created'
  | 'production.work_order_created'
  | 'production.work_order_started'
  | 'production.consumption_recorded'
  | 'production.output_recorded'
  | 'production.work_order_completed'
  | 'workorder.started'
  | 'workorder.completed'
  | 'po.price_spike_detected'
  | 'po.shortfall_detected'
  | 'grn.posted'
  | 'bill.created'
  | 'bill.approved'
  | 'bill.rejected'
  | 'trip.loaded'
  | 'trip.dispatched'
  | 'trip.closed'
  | 'delivery.completed'
  | 'delivery.partial'
  | 'delivery.failed'
  | 'stops.returned'
  | 'collection.logged'
  | 'handover.verified'
  | 'invoice.issued'
  | 'eod.closed'
  | 'exception.requested'
  | 'exception.resolved'
  | 'issue.reported'
  | 'issue.escalated'
  | 'notification.failed'
  | 'rm.shortage'
  | 'dashboard.refresh_pulse'
  | 'dashboard.refresh_ops'
  | 'dashboard.refresh_inventory_alerts'
  | 'dashboard.refresh_analytics';

// ─── Per-event payload types ────────────────────────────────────────────────────

export interface PriceUpdatedPayload {
  itemId: string;
  date: string;
  floorPrice: string;
  targetPrice: string;
  landedCost: string;
}

export interface OrderConfirmedPayload {
  orderId: string;
  customerId: string;
  siteId: string;
  lines: Array<{
    orderLineId: string;
    itemId: string;
    qty: string;
    unitPrice: string;
    itemCategory: string;
  }>;
  deliveryDate: string;
}

export interface OrderCancelledPayload {
  orderId: string;
  reason: string;
}

export interface OrderCreditEvaluatedPayload {
  orderId: string;
  creditEvaluation: {
    status: 'OK' | 'HOLD' | 'COD_ONLY';
    currentArBalance: string;
    creditLimit: string;
    maxOverdueDays: number;
    oldestOverdueDays: number | null;
    reason?: string;
  };
}

export interface GrnPostedPayload {
  siteId: string;
  poId: string;
  itemId: string;
  requestedQty: string;
  receivedQty: string;
}

export interface TripLoadedPayload {
  tripId: string;
  siteId: string;
  lines: Array<{ itemId: string; batchId: string; qty: string }>;
}

export interface StockReservedPayload {
  orderLineId: string;
  itemId: string;
  reservedQty: string;
  deficitQty: string;
  reservationIds: string[];
}

export interface StockInsufficientPayload {
  orderLineId: string;
  itemId: string;
  requestedQty: string;
  availableQty: string;
  itemCategory: string;
}

export interface WorkorderCompletedPayload {
  workOrderId: string;
  finishedItemId: string;
  actualOutputQty: string;
  wastageQty: string;
  siteId: string;
  linkedSalesOrderId: string | null;
}

export interface TripDispatchedPayload {
  tripId: string;
  siteId: string;
  stops: Array<{
    stopId: string;
    salesOrderId: string;
    customerId: string;
    isCod: boolean;
  }>;
}

export interface DeliveryCompletedPayload {
  stopId: string;
  tripId: string;
  orderId: string;
  customerId: string;
  deliveredLines: Array<{
    itemId: string;
    deliveredQty: string;
    batchId: string;
  }>;
  returnedLines: Array<{
    itemId: string;
    returnedQty: string;
    batchId: string;
    damaged: boolean;
  }>;
  codAmount: string;
}

export interface DeliveryFailedPayload {
  stopId: string;
  tripId: string;
  orderId: string;
  customerId: string;
  reasonCode: string;
}

export interface TripClosedPayload {
  tripId: string;
  siteId: string;
}

export interface StopsReturnedPayload {
  stopId: string;
  tripId: string;
  orderId: string;
  customerId: string;
  returnedLines: Array<{
    itemId: string;
    returnedQty: string;
    batchId: string;
    damaged: boolean;
    reason?: string;
  }>;
  totalValue: string;
}

export interface IssueReportedPayload {
  issueId: string;
  tripId: string;
  category: string;
  valueAtRisk: string;
}

export interface CollectionLoggedPayload {
  receiptId: string;
  customerId: string;
  collectedByUserId: string;
  amount: string;
  paymentMode: string;
}

export interface ExceptionResolvedPayload {
  exceptionId: string;
  exceptionType: string;
  referenceId: string;
  action: 'APPROVED' | 'REJECTED' | 'COUNTERED';
  remarks: string;
  counterJson?: Record<string, unknown>;
  resolvedBy: string;
}

export interface StockExpiringPayload {
  siteId: string;
  itemId: string;
  batchId: string;
  qty: string;
  expiryDate: string;
}

export interface StockLowPayload {
  siteId: string;
  itemId: string;
  availableQty: string;
  thresholdQty: string;
}

export interface EodClosedPayload {
  eodId: string;
  date: string;
  siteId: string;
  signedOffBy: string;
  signedOffAt: string;
}

export interface DashboardRefreshPulsePayload {
  siteId: string;
  trigger:
    | 'trip_dispatched'
    | 'collection_logged'
    | 'exception_raised'
    | 'exception_resolved'
    | 'manual';
}

export interface DashboardRefreshOpsPayload {
  siteId: string;
  trigger:
    | 'trip_status_changed'
    | 'work_order_status_changed'
    | 'shortfall_detected'
    | 'manual';
}

export interface DashboardRefreshInventoryAlertsPayload {
  siteId: string;
  trigger: 'stock_changed' | 'batch_expiring' | 'manual';
}

export interface DashboardRefreshAnalyticsPayload {
  siteId: string;
  trigger:
    | 'order_completed'
    | 'grn_posted'
    | 'work_order_completed'
    | 'collection_logged'
    | 'eod_closed'
    | 'manual';
}

export interface BillCreatedPayload {
  billId: string;
  billNumber: string;
  supplierId: string;
  poId: string;
  siteId: string;
  amount: string;
  currency: string;
  actorId: string;
  createdAt: string;
}

export interface BillApprovedPayload {
  billId: string;
  billNumber: string;
  supplierId: string;
  siteId: string;
  amount: string;
  currency: string;
  taxInvoiceId: string;
  invoiceNo: string;
  approvedBy: string;
  approvedAt: string;
}

export interface BillRejectedPayload {
  billId: string;
  billNumber: string;
  supplierId: string;
  siteId: string;
  reason: string;
  rejectedBy: string;
  rejectedAt: string;
}

export interface HandoverVerifiedPayload {
  handoverId: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
  verifiedBy: string;
  verifiedAt: string;
  status: 'VERIFIED' | 'DISPUTED';
}

export interface InvoiceIssuedPayload {
  invoiceId: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  siteId: string;
  amount: string;
  taxAmount: string;
  totalAmount: string;
  issuedAt: string;
}

export interface ProductionRequisitionPayload {
  requisitionId: string;
  workOrderId: string;
  itemId: string;
  requiredQty: string;
  unitOfIssue: string;
  requiredBy: string;
  siteId: string;
}

export interface WorkorderStartedPayload {
  workOrderId: string;
  startedAt: string;
  siteId: string;
}

export interface DomainEventPayloads {
  'order.confirmed': OrderConfirmedPayload;
  'order.credit_evaluated': OrderCreditEvaluatedPayload;
  'order.cancelled': OrderCancelledPayload;
  'stock.reserved': StockReservedPayload;
  'stock.insufficient': StockInsufficientPayload;
  'stock.low': StockLowPayload;
  'stock.expiring': StockExpiringPayload;
  'production.requisition_created': ProductionRequisitionPayload;
  'production.work_order_created': WorkorderStartedPayload;
  'production.work_order_started': WorkorderStartedPayload;
  'production.consumption_recorded': Record<string, unknown>;
  'production.output_recorded': WorkorderCompletedPayload;
  'production.work_order_completed': WorkorderCompletedPayload;
  'workorder.started': WorkorderStartedPayload;
  'workorder.completed': WorkorderCompletedPayload;
  'grn.posted': GrnPostedPayload;
  'bill.created': BillCreatedPayload;
  'bill.approved': BillApprovedPayload;
  'bill.rejected': BillRejectedPayload;
  'trip.loaded': TripLoadedPayload;
  'delivery.completed': DeliveryCompletedPayload;
  'delivery.failed': DeliveryFailedPayload;
  'stops.returned': StopsReturnedPayload;
  'trip.closed': TripClosedPayload;
  'collection.logged': CollectionLoggedPayload;
  'handover.verified': HandoverVerifiedPayload;
  'invoice.issued': InvoiceIssuedPayload;
  'eod.closed': EodClosedPayload;
  'exception.requested': ExceptionResolvedPayload;
  'exception.resolved': ExceptionResolvedPayload;
  'issue.reported': IssueReportedPayload;
  'issue.escalated': IssueReportedPayload;
  'notification.failed': IssueReportedPayload;
  'rm.shortage': IssueReportedPayload;
  'dashboard.refresh_pulse': DashboardRefreshPulsePayload;
  'dashboard.refresh_ops': DashboardRefreshOpsPayload;
  'dashboard.refresh_inventory_alerts': DashboardRefreshInventoryAlertsPayload;
  'dashboard.refresh_analytics': DashboardRefreshAnalyticsPayload;
}

export type TypedDomainEvent<T extends keyof DomainEventPayloads> = DomainEvent<
  DomainEventPayloads[T]
> & { type: T };