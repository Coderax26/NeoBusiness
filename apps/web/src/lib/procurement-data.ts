/**
 * Client-side Procurement & Suppliers Store / Seed Data for Phase F5
 * Provides cohesive state across Pipeline Home, Requisitions, Purchase Orders,
 * GRNs, Shortfall Workbench, Supplier Bills (AP), and Scorecards & Rate Monitoring.
 */

import type { ThreeWayMatchStatus } from '@neo/shared';

export type RequisitionSource =
  | 'SALES_ORDER_BACK_TO_BACK'
  | 'PRODUCTION_RM'
  | 'MIN_STOCK'
  | 'MANUAL';

export type RequisitionStatus = 'OPEN' | 'PO_CREATED' | 'CANCELLED';

export interface RequisitionRecord {
  id: string;
  requisitionNo: string;
  source: RequisitionSource;
  sourceRefId?: string;
  sourceRefLabel?: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  qty: number;
  uom: string;
  neededBy: string;
  reason: string;
  status: RequisitionStatus;
  preferredSupplierId: string;
  preferredSupplierName: string;
  latestRate: number;
  siteId: string;
  siteName: string;
  createdAt: string;
  cancelReason?: string;
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'WAITING_APPROVAL'
  | 'SENT_TO_SUPPLIER'
  | 'PARTLY_RECEIVED'
  | 'CLOSED'
  | 'CANCELLED';

export interface PurchaseOrderLine {
  lineId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  uom: string;
  orderedQty: number;
  confirmedQty: number;
  receivedQty: number;
  shortQty: number;
  unitRate: number;
  lastRate: number;
  variancePct: number;
  spikeFlag: boolean;
}

export interface PurchaseOrderRecord {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  receivingSiteId: string;
  receivingSiteName: string;
  status: PurchaseOrderStatus;
  expectedDelivery: string;
  paymentTermsDays: number;
  linkedSalesOrderId?: string;
  linkedSalesOrderNo?: string;
  priceSpikeException: boolean;
  priceSpikeSummary?: string;
  quantitiesConfirmed: boolean;
  createdAt: string;
  issuedAt?: string;
  cancelReason?: string;
  lines: PurchaseOrderLine[];
}

export interface GrnLineRecord {
  lineId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  uom: string;
  orderedQty: number;
  receivedQty: number;
  shortQty: number;
  unitPrice: number;
}

export interface GrnRecord {
  id: string;
  grnNumber: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  receivedDate: string;
  receivedBy: string;
  siteName: string;
  hasShortfall: boolean;
  lineCount?: number;
  lines: GrnLineRecord[];
}

export interface ShortfallBackupCandidate {
  supplierId: string;
  supplierName: string;
  quotedRate: number;
  fillRate: number;
  leadTimeDays: number;
}

export interface OpenShortfallRecord {
  id: string;
  poId: string;
  poNumber: string;
  grnId: string;
  grnNumber: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  uom: string;
  primarySupplierId: string;
  primarySupplierName: string;
  primaryRate: number;
  shortQty: number;
  impactedSalesOrders?: Array<{ id: string; orderNo: string; customerName: string }>;
  status: 'OPEN' | 'BACKUP_PO_CREATED' | 'ALLOCATED' | 'WRITTEN_OFF';
  backups: ShortfallBackupCandidate[];
}

export type SupplierBillStatus =
  | 'RECEIVED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'PAID'
  | 'DISPUTED';

export interface SupplierBillLine {
  itemId: string;
  itemName: string;
  uom: string;
  poQty: number;
  grnQty: number;
  billQty: number;
  poRate: number;
  billRate: number;
}

export interface SupplierBillRecord {
  id: string;
  billNumber: string;
  supplierId: string;
  supplierName: string;
  poId: string;
  poNumber: string;
  grnNumber: string;
  billDate: string;
  dueDate: string;
  status: SupplierBillStatus;
  three_way_status: ThreeWayMatchStatus;
  totalAmount: number;
  paidAmount: number;
  scanFileName?: string;
  rejectReason?: string;
  lines: SupplierBillLine[];
}

export interface SupplierPaymentRecord {
  id: string;
  billId: string;
  billNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  mode: 'BANK' | 'CASH' | 'UPI';
  reference: string;
  amount: number;
}

export interface SupplierScorecardRow {
  supplierId: string;
  code: string;
  name: string;
  fillRatePct: number;
  onTimePct: number;
  avgPriceVariancePct: number;
  poCount: number;
  grnCount: number;
  reliabilityScore: number;
  monthlySpend: number;
}

export interface MissingRateAlert {
  itemId: string;
  itemSku: string;
  itemName: string;
  uom: string;
  lastKnownRate?: number;
  daysSinceLastQuote: number;
  priority: 'HIGH' | 'MEDIUM';
}

export interface ItemPriceTrendPoint {
  date: string;
  rates: Record<string, number>;
}

export interface ItemPriceTrendSeries {
  itemId: string;
  itemName: string;
  uom: string;
  suppliers: Array<{ id: string; name: string; color: string }>;
  points: ItemPriceTrendPoint[];
}

export const PROCUREMENT_SUPPLIERS = [
  { id: 'sup-1', code: 'SUP-001', name: 'Sai Agro Traders', phone: '+91 98220 11001', reliability: 4.8, fillRate: 97.2, leadTimeDays: 2, termsDays: 15 },
  { id: 'sup-2', code: 'SUP-002', name: 'Kisan Dairy Co-op', phone: '+91 98220 22002', reliability: 4.6, fillRate: 94.5, leadTimeDays: 1, termsDays: 7 },
  { id: 'sup-3', code: 'SUP-003', name: 'Mahalaxmi Feed Mills', phone: '+91 98220 33003', reliability: 4.3, fillRate: 91.0, leadTimeDays: 3, termsDays: 30 },
  { id: 'sup-4', code: 'SUP-004', name: 'Patel Packaging Pvt Ltd', phone: '+91 98220 44004', reliability: 4.9, fillRate: 99.1, leadTimeDays: 2, termsDays: 30 },
];

export const PROCUREMENT_ITEMS = [
  { id: 'itm-maize', sku: 'RM-MAIZE-01', name: 'Yellow Maize Grain (Grade A)', uom: 'kg', lastRate: 26 },
  { id: 'itm-soy', sku: 'RM-SOY-02', name: 'Soybean Meal (46% Protein)', uom: 'kg', lastRate: 48 },
  { id: 'itm-molasses', sku: 'RM-MOL-03', name: 'Sugarcane Molasses', uom: 'kg', lastRate: 18 },
  { id: 'itm-hdpe', sku: 'PKG-HDPE-50', name: '50 kg HDPE Woven Sack', uom: 'pcs', lastRate: 22 },
];

export const INITIAL_REQUISITIONS: RequisitionRecord[] = [
  {
    id: 'req-1',
    requisitionNo: 'REQ-2026-041',
    source: 'SALES_ORDER_BACK_TO_BACK',
    sourceRefId: 'so-104',
    sourceRefLabel: 'SO-2026-104 (Sahyadri Dairy)',
    itemId: 'itm-soy',
    itemSku: 'RM-SOY-02',
    itemName: 'Soybean Meal (46% Protein)',
    qty: 500,
    uom: 'kg',
    neededBy: '2026-11-15',
    reason: 'Back-to-back customer order commitment',
    status: 'OPEN',
    preferredSupplierId: 'sup-1',
    preferredSupplierName: 'Sai Agro Traders',
    latestRate: 48,
    siteId: 'site-1',
    siteName: 'Pune Central Depot',
    createdAt: '2026-11-13 09:15',
  },
  {
    id: 'req-2',
    requisitionNo: 'REQ-2026-042',
    source: 'PRODUCTION_RM',
    sourceRefId: 'wo-88',
    sourceRefLabel: 'WO-2026-088 (Cattle Feed Batch)',
    itemId: 'itm-maize',
    itemSku: 'RM-MAIZE-01',
    itemName: 'Yellow Maize Grain (Grade A)',
    qty: 1200,
    uom: 'kg',
    neededBy: '2026-11-15',
    reason: 'Batch B-112 production RM issue',
    status: 'OPEN',
    preferredSupplierId: 'sup-1',
    preferredSupplierName: 'Sai Agro Traders',
    latestRate: 26,
    siteId: 'site-1',
    siteName: 'Pune Central Depot',
    createdAt: '2026-11-13 09:40',
  },
  {
    id: 'req-3',
    requisitionNo: 'REQ-2026-043',
    source: 'MIN_STOCK',
    sourceRefLabel: 'Reorder Point Trigger (Min 300 pcs)',
    itemId: 'itm-hdpe',
    itemSku: 'PKG-HDPE-50',
    itemName: '50 kg HDPE Woven Sack',
    qty: 1000,
    uom: 'pcs',
    neededBy: '2026-11-16',
    reason: 'Below safety stock (180 pcs remaining)',
    status: 'OPEN',
    preferredSupplierId: 'sup-4',
    preferredSupplierName: 'Patel Packaging Pvt Ltd',
    latestRate: 22,
    siteId: 'site-1',
    siteName: 'Pune Central Depot',
    createdAt: '2026-11-13 10:05',
  },
  {
    id: 'req-4',
    requisitionNo: 'REQ-2026-044',
    source: 'MANUAL',
    itemId: 'itm-molasses',
    itemSku: 'RM-MOL-03',
    itemName: 'Sugarcane Molasses',
    qty: 800,
    uom: 'kg',
    neededBy: '2026-11-17',
    reason: 'Festival week buffer stock',
    status: 'OPEN',
    preferredSupplierId: 'sup-3',
    preferredSupplierName: 'Mahalaxmi Feed Mills',
    latestRate: 18,
    siteId: 'site-2',
    siteName: 'Baramati Plant',
    createdAt: '2026-11-13 11:20',
  },
  {
    id: 'req-5',
    requisitionNo: 'REQ-2026-045',
    source: 'PRODUCTION_RM',
    sourceRefLabel: 'WO-2026-085',
    itemId: 'itm-maize',
    itemSku: 'RM-MAIZE-01',
    itemName: 'Yellow Maize Grain (Grade A)',
    qty: 1000,
    uom: 'kg',
    neededBy: '2026-11-12',
    reason: 'Converted to PO-2026-103',
    status: 'PO_CREATED',
    preferredSupplierId: 'sup-1',
    preferredSupplierName: 'Sai Agro Traders',
    latestRate: 26,
    siteId: 'site-1',
    siteName: 'Pune Central Depot',
    createdAt: '2026-11-12 08:30',
  },
];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrderRecord[] = [
  {
    id: 'po-101',
    poNumber: 'PO-2026-101',
    supplierId: 'sup-1',
    supplierName: 'Sai Agro Traders',
    supplierPhone: '+91 98220 11001',
    receivingSiteId: 'site-1',
    receivingSiteName: 'Pune Central Depot',
    status: 'WAITING_APPROVAL',
    expectedDelivery: '2026-11-15',
    paymentTermsDays: 15,
    linkedSalesOrderId: 'so-104',
    linkedSalesOrderNo: 'SO-2026-104',
    priceSpikeException: true,
    priceSpikeSummary: '₹54/kg is 12.5% higher than last time (₹48/kg)',
    quantitiesConfirmed: true,
    createdAt: '2026-11-13 08:45',
    lines: [
      {
        lineId: 'pol-1',
        itemId: 'itm-soy',
        itemSku: 'RM-SOY-02',
        itemName: 'Soybean Meal (46% Protein)',
        uom: 'kg',
        orderedQty: 1000,
        confirmedQty: 1000,
        receivedQty: 0,
        shortQty: 0,
        unitRate: 54,
        lastRate: 48,
        variancePct: 12.5,
        spikeFlag: true,
      },
    ],
  },
  {
    id: 'po-102',
    poNumber: 'PO-2026-102',
    supplierId: 'sup-4',
    supplierName: 'Patel Packaging Pvt Ltd',
    supplierPhone: '+91 98220 44004',
    receivingSiteId: 'site-1',
    receivingSiteName: 'Pune Central Depot',
    status: 'DRAFT',
    expectedDelivery: '2026-11-16',
    paymentTermsDays: 30,
    priceSpikeException: false,
    quantitiesConfirmed: false,
    createdAt: '2026-11-13 10:15',
    lines: [
      {
        lineId: 'pol-2',
        itemId: 'itm-hdpe',
        itemSku: 'PKG-HDPE-50',
        itemName: '50 kg HDPE Woven Sack',
        uom: 'pcs',
        orderedQty: 1500,
        confirmedQty: 1500,
        receivedQty: 0,
        shortQty: 0,
        unitRate: 22,
        lastRate: 22,
        variancePct: 0,
        spikeFlag: false,
      },
    ],
  },
  {
    id: 'po-103',
    poNumber: 'PO-2026-103',
    supplierId: 'sup-1',
    supplierName: 'Sai Agro Traders',
    supplierPhone: '+91 98220 11001',
    receivingSiteId: 'site-1',
    receivingSiteName: 'Pune Central Depot',
    status: 'PARTLY_RECEIVED',
    expectedDelivery: '2026-11-13',
    paymentTermsDays: 15,
    linkedSalesOrderId: 'so-102',
    linkedSalesOrderNo: 'SO-2026-102',
    priceSpikeException: false,
    quantitiesConfirmed: true,
    createdAt: '2026-11-11 14:20',
    issuedAt: '2026-11-11 15:00',
    lines: [
      {
        lineId: 'pol-3',
        itemId: 'itm-maize',
        itemSku: 'RM-MAIZE-01',
        itemName: 'Yellow Maize Grain (Grade A)',
        uom: 'kg',
        orderedQty: 1000,
        confirmedQty: 1000,
        receivedQty: 800,
        shortQty: 200,
        unitRate: 26,
        lastRate: 26,
        variancePct: 0,
        spikeFlag: false,
      },
    ],
  },
  {
    id: 'po-104',
    poNumber: 'PO-2026-104',
    supplierId: 'sup-3',
    supplierName: 'Mahalaxmi Feed Mills',
    supplierPhone: '+91 98220 33003',
    receivingSiteId: 'site-2',
    receivingSiteName: 'Baramati Plant',
    status: 'PARTLY_RECEIVED',
    expectedDelivery: '2026-11-14',
    paymentTermsDays: 30,
    priceSpikeException: false,
    quantitiesConfirmed: true,
    createdAt: '2026-11-12 11:00',
    issuedAt: '2026-11-12 11:30',
    lines: [
      {
        lineId: 'pol-4',
        itemId: 'itm-molasses',
        itemSku: 'RM-MOL-03',
        itemName: 'Sugarcane Molasses',
        uom: 'kg',
        orderedQty: 1200,
        confirmedQty: 1200,
        receivedQty: 1200,
        shortQty: 0,
        unitRate: 18,
        lastRate: 18,
        variancePct: 0,
        spikeFlag: false,
      },
      {
        lineId: 'pol-4b',
        itemId: 'itm-soy',
        itemSku: 'RM-SOY-02',
        itemName: 'Soybean Meal (46% Protein)',
        uom: 'kg',
        orderedQty: 500,
        confirmedQty: 500,
        receivedQty: 350,
        shortQty: 150,
        unitRate: 48,
        lastRate: 48,
        variancePct: 0,
        spikeFlag: false,
      },
    ],
  },
  {
    id: 'po-105',
    poNumber: 'PO-2026-105',
    supplierId: 'sup-2',
    supplierName: 'Kisan Dairy Co-op',
    supplierPhone: '+91 98220 22002',
    receivingSiteId: 'site-1',
    receivingSiteName: 'Pune Central Depot',
    status: 'CLOSED',
    expectedDelivery: '2026-11-10',
    paymentTermsDays: 7,
    priceSpikeException: false,
    quantitiesConfirmed: true,
    createdAt: '2026-11-08 09:00',
    issuedAt: '2026-11-08 09:30',
    lines: [
      {
        lineId: 'pol-5',
        itemId: 'itm-soy',
        itemSku: 'RM-SOY-02',
        itemName: 'Soybean Meal (46% Protein)',
        uom: 'kg',
        orderedQty: 600,
        confirmedQty: 600,
        receivedQty: 600,
        shortQty: 0,
        unitRate: 48,
        lastRate: 48,
        variancePct: 0,
        spikeFlag: false,
      },
    ],
  },
];

export const INITIAL_GRNS: GrnRecord[] = [
  {
    id: 'grn-201',
    grnNumber: 'GRN-2026-201',
    poId: 'po-103',
    poNumber: 'PO-2026-103',
    supplierId: 'sup-1',
    supplierName: 'Sai Agro Traders',
    receivedDate: '2026-11-13 07:45',
    receivedBy: 'Ramesh Patil (Storekeeper)',
    siteName: 'Pune Central Depot',
    hasShortfall: true,
    lines: [
      {
        lineId: 'grnl-1',
        itemId: 'itm-maize',
        itemSku: 'RM-MAIZE-01',
        itemName: 'Yellow Maize Grain (Grade A)',
        uom: 'kg',
        orderedQty: 1000,
        receivedQty: 800,
        shortQty: 200,
        unitPrice: 26,
      },
    ],
  },
  {
    id: 'grn-202',
    grnNumber: 'GRN-2026-202',
    poId: 'po-105',
    poNumber: 'PO-2026-105',
    supplierId: 'sup-2',
    supplierName: 'Kisan Dairy Co-op',
    receivedDate: '2026-11-10 16:20',
    receivedBy: 'Suresh Jadhav (Storekeeper)',
    siteName: 'Pune Central Depot',
    hasShortfall: false,
    lines: [
      {
        lineId: 'grnl-2',
        itemId: 'itm-soy',
        itemSku: 'RM-SOY-02',
        itemName: 'Soybean Meal (46% Protein)',
        uom: 'kg',
        orderedQty: 600,
        receivedQty: 600,
        shortQty: 0,
        unitPrice: 48,
      },
    ],
  },
  {
    id: 'grn-203',
    grnNumber: 'GRN-2026-203',
    poId: 'po-104',
    poNumber: 'PO-2026-104',
    supplierId: 'sup-3',
    supplierName: 'Mahalaxmi Feed Mills',
    receivedDate: '2026-11-13 09:15',
    receivedBy: 'Ramesh Patil (Storekeeper)',
    siteName: 'Baramati Plant',
    hasShortfall: true,
    lines: [
      {
        lineId: 'grnl-3',
        itemId: 'itm-soy',
        itemSku: 'RM-SOY-02',
        itemName: 'Soybean Meal (46% Protein)',
        uom: 'kg',
        orderedQty: 500,
        receivedQty: 350,
        shortQty: 150,
        unitPrice: 48,
      },
    ],
  },
];

export const INITIAL_SHORTFALLS: OpenShortfallRecord[] = [
  {
    id: 'sf-1',
    poId: 'po-103',
    poNumber: 'PO-2026-103',
    grnId: 'grn-201',
    grnNumber: 'GRN-2026-201',
    itemId: 'itm-maize',
    itemSku: 'RM-MAIZE-01',
    itemName: 'Yellow Maize Grain (Grade A)',
    uom: 'kg',
    primarySupplierId: 'sup-1',
    primarySupplierName: 'Sai Agro Traders',
    primaryRate: 26,
    shortQty: 200,
    impactedSalesOrders: [
      { id: 'so-102', orderNo: 'SO-2026-102', customerName: 'Gokul Milk Union' },
      { id: 'so-104', orderNo: 'SO-2026-104', customerName: 'Sahyadri Dairy' },
    ],
    status: 'OPEN',
    backups: [
      { supplierId: 'sup-2', supplierName: 'Kisan Dairy Co-op', quotedRate: 26.4, fillRate: 94.5, leadTimeDays: 1 },
      { supplierId: 'sup-3', supplierName: 'Mahalaxmi Feed Mills', quotedRate: 27.5, fillRate: 91.0, leadTimeDays: 3 },
    ],
  },
  {
    id: 'sf-2',
    poId: 'po-104',
    poNumber: 'PO-2026-104',
    grnId: 'grn-203',
    grnNumber: 'GRN-2026-203',
    itemId: 'itm-soy',
    itemSku: 'RM-SOY-02',
    itemName: 'Soybean Meal (46% Protein)',
    uom: 'kg',
    primarySupplierId: 'sup-3',
    primarySupplierName: 'Mahalaxmi Feed Mills',
    primaryRate: 48,
    shortQty: 150,
    impactedSalesOrders: [
      { id: 'so-105', orderNo: 'SO-2026-105', customerName: 'Krishi Kendra Agro' },
    ],
    status: 'OPEN',
    backups: [
      { supplierId: 'sup-1', supplierName: 'Sai Agro Traders', quotedRate: 48.8, fillRate: 97.2, leadTimeDays: 2 },
      { supplierId: 'sup-2', supplierName: 'Kisan Dairy Co-op', quotedRate: 51.0, fillRate: 94.5, leadTimeDays: 1 },
    ],
  },
];

export const INITIAL_SUPPLIER_BILLS: SupplierBillRecord[] = [
  {
    id: 'bill-301',
    billNumber: 'INV-KDC-884',
    supplierId: 'sup-2',
    supplierName: 'Kisan Dairy Co-op',
    poId: 'po-105',
    poNumber: 'PO-2026-105',
    grnNumber: 'GRN-2026-202',
    billDate: '2026-11-11',
    dueDate: '2026-11-18',
    status: 'APPROVED',
    three_way_status: 'MATCHES',
    totalAmount: 28800,
    paidAmount: 0,
    scanFileName: 'kdc-bill-884.pdf',
    lines: [
      {
        itemId: 'itm-soy',
        itemName: 'Soybean Meal (46% Protein)',
        uom: 'kg',
        poQty: 600,
        grnQty: 600,
        billQty: 600,
        poRate: 48,
        billRate: 48,
      },
    ],
  },
  {
    id: 'bill-302',
    billNumber: 'INV-SAT-412',
    supplierId: 'sup-1',
    supplierName: 'Sai Agro Traders',
    poId: 'po-103',
    poNumber: 'PO-2026-103',
    grnNumber: 'GRN-2026-201',
    billDate: '2026-11-13',
    dueDate: '2026-11-28',
    status: 'VERIFIED',
    three_way_status: 'TIMING_DIFFERS',
    totalAmount: 20800,
    paidAmount: 0,
    scanFileName: 'sat-bill-412.pdf',
    lines: [
      {
        itemId: 'itm-maize',
        itemName: 'Yellow Maize Grain (Grade A)',
        uom: 'kg',
        poQty: 1000,
        grnQty: 800,
        billQty: 800,
        poRate: 26,
        billRate: 26,
      },
    ],
  },
  {
    id: 'bill-303',
    billNumber: 'INV-MFM-190',
    supplierId: 'sup-3',
    supplierName: 'Mahalaxmi Feed Mills',
    poId: 'po-104',
    poNumber: 'PO-2026-104',
    grnNumber: 'GRN-2026-198',
    billDate: '2026-10-12',
    dueDate: '2026-11-11',
    status: 'RECEIVED',
    three_way_status: 'AMOUNT_DIFFERS',
    totalAmount: 23400,
    paidAmount: 0,
    lines: [
      {
        itemId: 'itm-molasses',
        itemName: 'Sugarcane Molasses',
        uom: 'kg',
        poQty: 1200,
        grnQty: 1200,
        billQty: 1200,
        poRate: 18,
        billRate: 19.5,
      },
    ],
  },
];

export const INITIAL_SUPPLIER_PAYMENTS: SupplierPaymentRecord[] = [
  {
    id: 'spay-1',
    billId: 'bill-300',
    billNumber: 'INV-PAT-071',
    supplierId: 'sup-4',
    supplierName: 'Patel Packaging Pvt Ltd',
    date: '2026-11-09',
    mode: 'BANK',
    reference: 'NEFT-8829104',
    amount: 33000,
  },
];

export const INITIAL_SUPPLIER_SCORECARDS: SupplierScorecardRow[] = [
  { supplierId: 'sup-4', code: 'SUP-004', name: 'Patel Packaging Pvt Ltd', fillRatePct: 99.1, onTimePct: 97.5, avgPriceVariancePct: 0.4, poCount: 18, grnCount: 18, reliabilityScore: 4.9, monthlySpend: 185000 },
  { supplierId: 'sup-1', code: 'SUP-001', name: 'Sai Agro Traders', fillRatePct: 97.2, onTimePct: 94.0, avgPriceVariancePct: 3.1, poCount: 24, grnCount: 23, reliabilityScore: 4.8, monthlySpend: 420000 },
  { supplierId: 'sup-2', code: 'SUP-002', name: 'Kisan Dairy Co-op', fillRatePct: 94.5, onTimePct: 92.0, avgPriceVariancePct: 1.2, poCount: 15, grnCount: 14, reliabilityScore: 4.6, monthlySpend: 290000 },
  { supplierId: 'sup-3', code: 'SUP-003', name: 'Mahalaxmi Feed Mills', fillRatePct: 91.0, onTimePct: 86.5, avgPriceVariancePct: 4.8, poCount: 11, grnCount: 10, reliabilityScore: 4.3, monthlySpend: 145000 },
];

export const INITIAL_MISSING_RATES: MissingRateAlert[] = [
  { itemId: 'itm-mineral', itemSku: 'RM-MIN-04', itemName: 'Mineral Mixture Premix', uom: 'kg', lastKnownRate: 92, daysSinceLastQuote: 34, priority: 'HIGH' },
  { itemId: 'itm-salt', itemSku: 'RM-SALT-05', itemName: 'Industrial Rock Salt', uom: 'kg', lastKnownRate: 9.5, daysSinceLastQuote: 22, priority: 'MEDIUM' },
];

export const INITIAL_PRICE_TRENDS: ItemPriceTrendSeries[] = [
  {
    itemId: 'itm-soy',
    itemName: 'Soybean Meal (46% Protein)',
    uom: 'kg',
    suppliers: [
      { id: 'sup-1', name: 'Sai Agro Traders', color: '#14b8a6' },
      { id: 'sup-2', name: 'Kisan Dairy Co-op', color: '#6366f1' },
      { id: 'sup-3', name: 'Mahalaxmi Feed Mills', color: '#f59e0b' },
    ],
    points: [
      { date: '15 Oct', rates: { 'sup-1': 45, 'sup-2': 46, 'sup-3': 47 } },
      { date: '22 Oct', rates: { 'sup-1': 46, 'sup-2': 46.5, 'sup-3': 48 } },
      { date: '29 Oct', rates: { 'sup-1': 47, 'sup-2': 47.5, 'sup-3': 48.5 } },
      { date: '05 Nov', rates: { 'sup-1': 48, 'sup-2': 48, 'sup-3': 49 } },
      { date: '13 Nov', rates: { 'sup-1': 54, 'sup-2': 49.5, 'sup-3': 51 } },
    ],
  },
  {
    itemId: 'itm-maize',
    itemName: 'Yellow Maize Grain (Grade A)',
    uom: 'kg',
    suppliers: [
      { id: 'sup-1', name: 'Sai Agro Traders', color: '#14b8a6' },
      { id: 'sup-2', name: 'Kisan Dairy Co-op', color: '#6366f1' },
      { id: 'sup-3', name: 'Mahalaxmi Feed Mills', color: '#f59e0b' },
    ],
    points: [
      { date: '15 Oct', rates: { 'sup-1': 24.5, 'sup-2': 25, 'sup-3': 26 } },
      { date: '22 Oct', rates: { 'sup-1': 25, 'sup-2': 25.5, 'sup-3': 26.5 } },
      { date: '29 Oct', rates: { 'sup-1': 25.5, 'sup-2': 26, 'sup-3': 27 } },
      { date: '05 Nov', rates: { 'sup-1': 26, 'sup-2': 26.2, 'sup-3': 27.2 } },
      { date: '13 Nov', rates: { 'sup-1': 26, 'sup-2': 26.4, 'sup-3': 27.5 } },
    ],
  },
];

