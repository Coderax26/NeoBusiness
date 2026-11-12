/**
 * @neo/mocks — Mock Service Engine & Realistic Operational Fixtures (M0–M7b)
 *
 * Powers mock-first UI development, Storybook, and E2E Scenario A–F verification.
 */

import type {
  PulseDto,
  StatusMatrixDto,
  ExceptionCardDto,
  ARAgingBucketDto,
  CustomerProfitabilityDto,
  ActiveTruckTelemetryDto,
  FactoryBatchDto,
  RequestOptions,
} from '../../api-client/src/index.js';
import {
  evaluatePriceBand,
  evaluateHandoverVariance,
  maskSensitivePayload,
  type UserRole,
} from '../../shared/src/index.js';

export const INITIAL_PULSE_FIXTURE: PulseDto = {
  siteId: 'site-pune-central',
  todaysSales: '482450.00',
  grossMarginPct: '11.40',
  cashCollectedToday: '95400.00',
  chequesInCustody: '33000.00',
  pendingExceptions: 3,
  hourlyVelocity: [32000, 48000, 65000, 81000, 94000, 78000, 84450],
  salesTargetInr: '600000.00',
};

export const INITIAL_STATUS_MATRIX_FIXTURE: StatusMatrixDto = {
  siteId: 'site-pune-central',
  ordersPendingDispatch: 18,
  batchesRunning: 6,
  trucksOnRoad: 5,
  supplierShortfalls: 2,
  pipelineStages: {
    confirmed: { count: 18, valueInr: '340000.00' },
    production: { count: 6, valueInr: '185000.00' },
    loading: { count: 3, valueInr: '92000.00' },
    inTransit: { count: 5, valueInr: '164000.00' },
    delivered: { count: 24, valueInr: '482450.00' },
  },
};

export const INITIAL_EXCEPTIONS_FIXTURE: ExceptionCardDto[] = [
  {
    id: 'exc-price-001',
    exceptionType: 'PRICE_OVERRIDE',
    referenceTable: 'sales_orders',
    referenceId: 'SO-2611-0042',
    status: 'PENDING',
    priority: 'HIGH',
    valueAtRisk: '6000.00',
    contextPayload: {
      customerName: 'ABC Traders',
      orderNumber: 'SO-2611-0042',
      itemName: 'Malai Paneer Block',
      qty: 500,
      uom: 'kg',
      requestedPrice: 88,
      floorPrice: 90,
      targetPrice: 95,
      landedCost: 82,
      lastPaidPrice: 91,
      orderTotalInr: 72000,
    },
    expiresAt: '2026-11-11T17:35:00.000Z',
    createdAt: '2026-11-11T16:35:00.000Z',
  },
  {
    id: 'exc-credit-002',
    exceptionType: 'CREDIT_BREACH',
    referenceTable: 'sales_orders',
    referenceId: 'SO-2611-0045',
    status: 'PENDING',
    priority: 'MEDIUM',
    valueAtRisk: '18500.00',
    contextPayload: {
      customerName: 'Shree Ganesh Caterers',
      orderNumber: 'SO-2611-0045',
      orderTotalInr: 48500,
    },
    expiresAt: '2026-11-11T17:45:00.000Z',
    createdAt: '2026-11-11T16:45:00.000Z',
  },
  {
    id: 'exc-supplier-003',
    exceptionType: 'SUPPLIER_VARIANCE',
    referenceTable: 'purchase_orders',
    referenceId: 'PO-2611-0019',
    status: 'PENDING',
    priority: 'HIGH',
    valueAtRisk: '9200.00',
    contextPayload: {
      itemName: 'Buffalo Skim Milk Powder',
      qty: 1000,
      uom: 'kg',
      requestedPrice: 242,
      floorPrice: 225,
      targetPrice: 225,
    },
    expiresAt: '2026-11-11T18:00:00.000Z',
    createdAt: '2026-11-11T17:00:00.000Z',
  },
];

export const INITIAL_AR_AGING_FIXTURE: ARAgingBucketDto[] = [
  { bucket: '0_7', label: 'Current (0–7 Days)', amountInr: '840000.00', customerCount: 28, invoiceCount: 42 },
  { bucket: '8_15', label: 'Due (8–15 Days)', amountInr: '310000.00', customerCount: 11, invoiceCount: 16 },
  { bucket: '16_30', label: 'Overdue (16–30 Days)', amountInr: '145000.00', customerCount: 6, invoiceCount: 9 },
  { bucket: '30_PLUS', label: 'Critical (30+ Days)', amountInr: '85000.00', customerCount: 3, invoiceCount: 4 },
];

export const INITIAL_FLEET_TELEMETRY_FIXTURE: ActiveTruckTelemetryDto[] = [
  {
    tripId: 'trip-101',
    vehicleNumber: 'MH-12-Q-4401',
    driverName: 'Ramesh Jadhav',
    driverPhone: '+919822011001',
    completedStops: 4,
    totalStops: 8,
    etaMinutes: 14,
    isDelayed: false,
    delayMinutes: 0,
    cashOnBoardInr: '38500.00',
    coordinates: { lat: 18.5204, lng: 73.8567 },
  },
  {
    tripId: 'trip-102',
    vehicleNumber: 'MH-14-BA-1209',
    driverName: 'Vijay Kadam',
    driverPhone: '+919822011002',
    completedStops: 7,
    totalStops: 7,
    etaMinutes: 5,
    isDelayed: true,
    delayMinutes: 20,
    cashOnBoardInr: '24500.00',
    coordinates: { lat: 18.6298, lng: 73.7997 },
  },
];

export const INITIAL_FACTORY_BATCHES_FIXTURE: FactoryBatchDto[] = [
  {
    workOrderId: 'wo-201',
    batchCode: 'B-2611-04',
    itemName: 'Malai Paneer Block (500 kg)',
    targetQtyKg: 500,
    stage: 'COOKING',
    elapsedMinutes: 42,
    plannedMinutes: 60,
    yieldVariancePct: 0.4,
    linkedOrderNumber: 'SO-2611-0041',
  },
  {
    workOrderId: 'wo-202',
    batchCode: 'B-2611-05',
    itemName: 'Pure Cow Ghee Tin (200 kg)',
    targetQtyKg: 200,
    stage: 'PACKING',
    elapsedMinutes: 15,
    plannedMinutes: 30,
    yieldVariancePct: -1.2,
    linkedOrderNumber: 'SO-2611-0039',
  },
];

export const INITIAL_CUSTOMER_PROFITABILITY_FIXTURE: CustomerProfitabilityDto[] = [
  {
    customerId: 'cust-01',
    businessName: 'ABC Traders',
    customerCode: 'CUST-001',
    orderCount: 24,
    revenue: '1240000.00',
    grossProfit: '158720.00',
    grossMarginPct: '12.80',
    lastOrderDate: '2026-11-11',
    creditRiskLevel: 'LOW',
  },
  {
    customerId: 'cust-02',
    businessName: 'Hotel Sahyadri Palace',
    customerCode: 'CUST-002',
    orderCount: 19,
    revenue: '890000.00',
    grossProfit: '129050.00',
    grossMarginPct: '14.50',
    lastOrderDate: '2026-11-10',
    creditRiskLevel: 'LOW',
  },
  {
    customerId: 'cust-03',
    businessName: 'Shree Ganesh Caterers',
    customerCode: 'CUST-003',
    orderCount: 12,
    revenue: '540000.00',
    grossProfit: '42120.00',
    grossMarginPct: '7.80',
    lastOrderDate: '2026-11-09',
    creditRiskLevel: 'HIGH',
  },
];

export class NeoMockServer {
  private pulse: PulseDto = structuredClone(INITIAL_PULSE_FIXTURE);
  private statusMatrix: StatusMatrixDto = structuredClone(INITIAL_STATUS_MATRIX_FIXTURE);
  private exceptions: ExceptionCardDto[] = structuredClone(INITIAL_EXCEPTIONS_FIXTURE);
  private orders: Array<Record<string, unknown>> = [
    {
      id: 'SO-2611-0042',
      orderNumber: 'SO-2611-0042',
      customerName: 'ABC Traders',
      status: 'PENDING_APPROVAL',
      totalAmount: '72000.00',
    },
  ];
  private blindGrnRecords: Array<Record<string, unknown>> = [];

  createTransport(callerRole: UserRole = 'OWNER') {
    return async (path: string, options: RequestOptions = {}) => {
      const method = options.method ?? 'GET';

      if (method === 'GET' && path.startsWith('/dashboard/pulse')) {
        return { data: maskSensitivePayload(callerRole, structuredClone(this.pulse)) };
      }

      if (method === 'GET' && path.startsWith('/dashboard/status-matrix')) {
        return { data: maskSensitivePayload(callerRole, structuredClone(this.statusMatrix)) };
      }

      if (method === 'GET' && path.startsWith('/exceptions')) {
        return { data: structuredClone(this.exceptions) };
      }

      if (method === 'POST' && path.match(/^\/exceptions\/([^/]+)\/resolve$/)) {
        const id = path.split('/')[2];
        const card = this.exceptions.find((e) => e.id === id);
        if (!card) {
          return {
            data: null,
            error: { code: 'VALIDATION', message: 'Exception not found' },
          };
        }

        // Concurrency protection: if already resolved on another tab/device, return read-only state
        if (card.status !== 'PENDING') {
          return {
            data: structuredClone(card),
            meta: { alreadyResolved: true },
          };
        }

        const body = (options.body ?? {}) as {
          action: 'APPROVED' | 'REJECTED' | 'COUNTERED';
          remarks: string;
          counter?: { proposedPrice: number };
        };

        card.status = body.action;
        card.resolvedBy = 'Owner (Mr. X)';
        card.resolvedAt = new Date().toISOString();
        this.pulse.pendingExceptions = Math.max(0, this.pulse.pendingExceptions - 1);

        // Unlock associated order if approved or countered
        const linkedOrder = this.orders.find((o) => o.id === card.referenceId);
        if (linkedOrder) {
          linkedOrder.status =
            body.action === 'APPROVED'
              ? 'CONFIRMED'
              : body.action === 'COUNTERED'
                ? 'COUNTER_OFFERED'
                : 'REJECTED';
        }

        return { data: structuredClone(card) };
      }

      if (method === 'POST' && path === '/orders') {
        const body = (options.body ?? {}) as {
          customerName: string;
          lines: Array<{
            itemName: string;
            qty: number;
            unitPrice: number;
            floorPrice: number;
            targetPrice: number;
            landedCost: number;
          }>;
        };

        const evaluations = body.lines.map((line) =>
          evaluatePriceBand(line.unitPrice, line.floorPrice, line.targetPrice, line.landedCost),
        );
        const requiresOverride = evaluations.some((e) => e.requiresOverride);
        const status = requiresOverride ? 'PENDING_APPROVAL' : 'CONFIRMED';
        const orderId = `SO-2611-${1000 + this.orders.length + 1}`;

        const created = {
          id: orderId,
          orderNumber: orderId,
          customerName: body.customerName,
          status,
          requiresOverride,
          lines: body.lines,
        };
        this.orders.push(created);
        return { data: created };
      }

      if (method === 'GET' && path.startsWith('/grn/blind/')) {
        // Blind GRN endpoint: returns items WITHOUT orderedQty or unitPrice (BR-05)
        const rawPo = {
          poId: 'PO-2611-0019',
          supplierName: 'Sahyadri Dairy Farms',
          lines: [
            {
              lineId: 'po-line-1',
              itemId: 'item-paneer',
              itemName: 'Fresh Raw Chakka',
              uom: 'kg',
              orderedQty: 1000,
              unitPrice: 185,
            },
          ],
        };
        return {
          data: maskSensitivePayload('STOREKEEPER', rawPo, 'BLIND_GRN'),
        };
      }

      if (method === 'POST' && path === '/grn/blind') {
        const record = {
          grnId: `GRN-${this.blindGrnRecords.length + 1}`,
          ...(options.body as Record<string, unknown>),
        };
        this.blindGrnRecords.push(record);
        return { data: record };
      }

      if (method === 'POST' && path === '/handover/verify') {
        const body = (options.body ?? {}) as {
          expectedCash: number;
          countedCash: number;
        };
        const evalResult = evaluateHandoverVariance(body.expectedCash, body.countedCash);
        return { data: evalResult };
      }

      return { data: {} };
    };
  }
}

