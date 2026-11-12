/**
 * @neo/api-client — Typed OpenAPI Contracts, Idempotent HTTP Client & Realtime Event Hub
 *
 * Matches backend endpoints across Modules M0–M7b and enforces:
 * - Idempotency-Key on all mutating calls with duplicate replay & payload mismatch detection
 * - Double-submit CSRF token on mutating requests
 * - SSE Realtime Event Hub with per-module query invalidation
 */

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  error?: {
    code:
    | 'VALIDATION'
    | 'FORBIDDEN'
    | 'CONFLICT'
    | 'RULE_BLOCKED'
    | 'PENDING_APPROVAL'
    | 'IDEMPOTENCY_MISMATCH'
    | 'OFFLINE';
    message: string;
  };
}

// ── M7b Control Tower & Analytics DTOs ────────────────────────────────────────
export interface PulseDto {
  siteId: string;
  todaysSales: string;
  grossMarginPct: string;
  cashCollectedToday: string;
  chequesInCustody?: string;
  pendingExceptions: number;
  hourlyVelocity?: number[];
  salesTargetInr?: string;
}

export interface StatusMatrixDto {
  siteId: string;
  ordersPendingDispatch: number;
  batchesRunning: number;
  trucksOnRoad: number;
  supplierShortfalls: number;
  pipelineStages?: {
    confirmed: { count: number; valueInr: string };
    production: { count: number; valueInr: string };
    loading: { count: number; valueInr: string };
    inTransit: { count: number; valueInr: string };
    delivered: { count: number; valueInr: string };
  };
}

/**
 * Exception types raised by the backend (M7a) — must stay identical to
 * `ExceptionType` in apps/api/src/shared/ports/ports.interface.ts (drift-guarded by test TC-F1-04).
 * Note: COD_ONLY is a *credit status*, not an exception type.
 */
export const EXCEPTION_TYPES = [
  'PRICE_OVERRIDE',
  'CREDIT_BREACH',
  'SUPPLIER_PRICE_SPIKE',
  'SUPPLIER_SHORTFALL',
  'ALLOCATION',
  'YIELD_VARIANCE',
  'WASTAGE_WRITEOFF',
  'STOCK_VARIANCE',
  'CREDIT_REBATE_WRITEOFF',
  'DELIVERY_DISPUTE',
  'MANUAL_LEDGER_ADJUSTMENT',
  'CASH_HANDOVER_VARIANCE',
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];
export interface ExceptionCardDto {
  id: string;
  exceptionType: ExceptionType;
  referenceTable: string;
  referenceId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COUNTERED' | 'EXPIRED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  valueAtRisk: string;
  contextPayload: {
    customerName?: string;
    orderNumber?: string;
    itemName?: string;
    qty?: number;
    uom?: string;
    requestedPrice?: number;
    floorPrice?: number;
    targetPrice?: number;
    landedCost?: number;
    lastPaidPrice?: number;
    orderTotalInr?: number;
  };
  resolvedBy?: string;
  resolvedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ResolveExceptionInput {
  action: 'APPROVED' | 'REJECTED' | 'COUNTERED';
  remarks: string;
  counter?: { proposedPrice: number };
  pin?: string;
}

export interface ARAgingBucketDto {
  bucket: '0_7' | '8_15' | '16_30' | '30_PLUS';
  label: string;
  amountInr: string;
  customerCount: number;
  invoiceCount: number;
}

export interface CustomerProfitabilityDto {
  customerId: string;
  businessName: string;
  customerCode: string;
  orderCount: number;
  revenue: string;
  grossProfit: string;
  grossMarginPct: string;
  lastOrderDate: string;
  creditRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ActiveTruckTelemetryDto {
  tripId: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  completedStops: number;
  totalStops: number;
  etaMinutes: number;
  isDelayed: boolean;
  delayMinutes: number;
  cashOnBoardInr: string;
  coordinates: { lat: number; lng: number };
}

export interface FactoryBatchDto {
  workOrderId: string;
  batchCode: string;
  itemName: string;
  targetQtyKg: number;
  stage: 'QUEUED' | 'COOKING' | 'PROCESSING' | 'PACKING' | 'COMPLETED';
  elapsedMinutes: number;
  plannedMinutes: number;
  yieldVariancePct: number;
  linkedOrderNumber?: string;
}

// ── Idempotent HTTP Client ────────────────────────────────────────────────────
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  csrfToken?: string;
  siteId?: string;
  headers?: Record<string, string>;
}

interface StoredIdempotentRecord {
  payloadHash: string;
  response: unknown;
}

export type TransportHandler = (
  path: string,
  options: RequestOptions,
) => Promise<unknown>;

export class NeoApiClient {
  private readonly idempotencyStore = new Map<string, StoredIdempotentRecord>();
  private csrfToken = 'csrf-session-token-v1';
  private activeSiteId = 'site-pune-central';
  private transport: TransportHandler;

  constructor(transport?: TransportHandler) {
    this.transport =
      transport ??
      (async () => {
        throw new Error('No transport configured');
      });
  }

  setTransport(transport: TransportHandler): void {
    this.transport = transport;
  }

  setCsrfToken(token: string): void {
    this.csrfToken = token;
  }

  setActiveSiteId(siteId: string): void {
    this.activeSiteId = siteId;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
    const method = options.method ?? 'GET';
    const isMutating = method !== 'GET';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Site-Id': options.siteId ?? this.activeSiteId,
      ...(options.headers ?? {}),
    };

    if (isMutating) {
      const csrf = options.csrfToken ?? this.csrfToken;
      if (!csrf) {
        return {
          data: null as unknown as T,
          error: {
            code: 'FORBIDDEN',
            message: 'Missing CSRF token on mutating request',
          },
        };
      }
      headers['X-CSRF-Token'] = csrf;

      const idemKey = options.idempotencyKey ?? `idem-${Date.now()}-${Math.random()}`;
      headers['Idempotency-Key'] = idemKey;

      const payloadHash = JSON.stringify({ path, method, body: options.body ?? null });
      const existing = this.idempotencyStore.get(idemKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          return {
            data: null as unknown as T,
            error: {
              code: 'IDEMPOTENCY_MISMATCH',
              message:
                'Idempotency-Key already used with a different request payload',
            },
          };
        }
        return existing.response as ApiEnvelope<T>;
      }

      const rawResponse = await this.transport(path, {
        ...options,
        method,
        headers,
      });
      const envelope: ApiEnvelope<T> =
        rawResponse && typeof rawResponse === 'object' && 'data' in rawResponse
          ? (rawResponse as ApiEnvelope<T>)
          : { data: rawResponse as T };

      this.idempotencyStore.set(idemKey, {
        payloadHash,
        response: envelope,
      });

      return envelope;
    }

    const rawResponse = await this.transport(path, {
      ...options,
      method,
      headers,
    });
    return rawResponse && typeof rawResponse === 'object' && 'data' in rawResponse
      ? (rawResponse as ApiEnvelope<T>)
      : { data: rawResponse as T };
  }
}

// ── Realtime SSE Event Hub ────────────────────────────────────────────────────
export type RealtimeEventType =
  | 'exception.requested'
  | 'exception.resolved'
  | 'order.confirmed'
  | 'stock.reserved'
  | 'workorder.completed'
  | 'trip.dispatched'
  | 'delivery.completed'
  | 'collection.logged'
  | 'handover.verified'
  | 'stock.low'
  | 'stock.expiring'
  | 'notification.failed';

export type ConnectionState = 'LIVE' | 'POLLING' | 'OFFLINE';

export const EVENT_QUERY_INVALIDATION_MAP: Record<RealtimeEventType, string[][]> = {
  'exception.requested': [['m7', 'exceptions'], ['m7', 'pulse']],
  'exception.resolved': [['m7', 'exceptions'], ['m7', 'pulse'], ['m1', 'orders']],
  'order.confirmed': [['m1', 'orders'], ['m7', 'pulse'], ['m7', 'status-matrix']],
  'stock.reserved': [['m3', 'stock'], ['m1', 'orders']],
  'workorder.completed': [['m4', 'workorders'], ['m3', 'stock'], ['m7', 'status-matrix']],
  'trip.dispatched': [['m5', 'trips'], ['m5', 'dispatch'], ['m7', 'status-matrix']],
  'delivery.completed': [['m5', 'trips'], ['m6', 'invoices'], ['m7', 'pulse']],
  'collection.logged': [['m6', 'collections'], ['m6', 'custody'], ['m7', 'pulse']],
  'handover.verified': [['m6', 'custody'], ['m6', 'eod'], ['m7', 'pulse']],
  'stock.low': [['m7', 'stock-alerts'], ['m3', 'stock']],
  'stock.expiring': [['m7', 'stock-alerts'], ['m3', 'expiry']],
  'notification.failed': [['m7', 'notifications']],
};

export class RealtimeEventHub {
  private state: ConnectionState = 'LIVE';
  private missedHeartbeats = 0;
  private readonly invalidatedKeysLog: string[][][] = [];
  private readonly listeners = new Map<
    RealtimeEventType,
    Array<(payload: Record<string, unknown>) => void>
  >();

  getState(): ConnectionState {
    return this.state;
  }

  recordHeartbeat(success: boolean): ConnectionState {
    if (success) {
      this.missedHeartbeats = 0;
      this.state = 'LIVE';
    } else {
      this.missedHeartbeats += 1;
      // After 2 missed refreshes, transition to POLLING fallback (docs/claude/10_FE_Web_Frontend.md §7.4)
      this.state = this.missedHeartbeats >= 2 ? 'POLLING' : this.state;
    }
    return this.state;
  }

  setOffline(): void {
    this.state = 'OFFLINE';
  }

  on(
    event: RealtimeEventType,
    handler: (payload: Record<string, unknown>) => void,
  ): () => void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(handler);
    this.listeners.set(event, existing);
    return () => {
      const current = this.listeners.get(event) ?? [];
      this.listeners.set(
        event,
        current.filter((h) => h !== handler),
      );
    };
  }

  emit(event: RealtimeEventType, payload: Record<string, unknown> = {}): string[][] {
    const keysToInvalidate = EVENT_QUERY_INVALIDATION_MAP[event] ?? [];
    this.invalidatedKeysLog.push(keysToInvalidate);
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) {
      h(payload);
    }
    return keysToInvalidate;
  }

  getInvalidatedKeysLog(): string[][][] {
    return this.invalidatedKeysLog;
  }
}


export * from './routes.generated.js';
