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
  id: string;            // UUIDv7
  type: EventType;
  aggregateId: string;   // primary key of the source entity
  payload: T;
  publishedAt: string;   // ISO 8601 UTC
  moduleSource: ModuleSource;
}

export type ModuleSource = 'm0' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7';

export type EventType =
  | 'price.updated'
  | 'order.pending_approval'
  | 'order.confirmed'
  | 'order.cancelled'
  | 'stock.reserved'
  | 'stock.insufficient'
  | 'stock.low'
  | 'stock.expiring'
  | 'production.requisition_created'
  | 'workorder.started'
  | 'workorder.completed'
  | 'po.price_spike_detected'
  | 'po.shortfall_detected'
  | 'grn.posted'
  | 'trip.loaded'
  | 'trip.dispatched'
  | 'trip.closed'
  | 'delivery.completed'
  | 'delivery.partial'
  | 'delivery.failed'
  | 'collection.logged'
  | 'handover.verified'
  | 'invoice.issued'
  | 'eod.closed'
  | 'exception.requested'
  | 'exception.resolved'
  | 'issue.reported'
  | 'issue.escalated'
  | 'notification.failed'
  | 'rm.shortage';

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
  deliveredLines: Array<{ itemId: string; deliveredQty: string; batchId: string }>;
  returnedLines: Array<{ itemId: string; returnedQty: string; batchId: string; damaged: boolean }>;
  codAmount: string;
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

export interface EodClosedPayload {
  eodId: string;
  date: string;
  siteId: string;
  signedOffBy: string;
  signedOffAt: string;
}
