/**
 * Client-side Commercial & CRM Store / Seed Data for Phase F4
 * Provides cohesive state across Today's Prices, Quick Order, Orders Tracker, Quotes, Customer 360, and Returns.
 */

export interface DailyPriceRow {
  itemId: string;
  sku: string;
  itemName: string;
  category: 'RAW_MATERIAL' | 'PROCESSED_FG' | 'TRADED_GOOD';
  uom: string;
  yesterdayFloor: number;
  yesterdayTarget: number;
  landedCost: number;
  minMarginPct: number;
  floorPrice: number | null;
  targetPrice: number | null;
  priceSource?: string;
  isPublished?: boolean;
  atpStock: number;
  lastPricesForCustomer?: { date: string; price: number }[];
}

export interface SalesOrderLine {
  id: string;
  itemId: string;
  sku: string;
  itemName: string;
  category: 'RAW_MATERIAL' | 'PROCESSED_FG' | 'TRADED_GOOD';
  qty: number;
  uom: string;
  unitPrice: number;
  floorPrice: number;
  targetPrice: number;
  atpStock: number;
  gstPct: number;
  reservedQty: number;
}

export type SalesOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'COUNTER_OFFERED'
  | 'CONFIRMED'
  | 'IN_PRODUCTION_SOURCING'
  | 'READY'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'INVOICED'
  | 'PAID'
  | 'CANCELLED';

export interface SalesOrderRecord {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  siteName: string;
  deliveryDate: string;
  deliveryWindow: '10-12' | '04-08' | '13-16' | '18-21';
  status: SalesOrderStatus;
  createdAt: string;
  createdBy: string;
  lines: SalesOrderLine[];
  subtotal: number;
  gstTotal: number;
  grandTotal: number;
  marginPct: number;
  approvalReason?: string;
  counterOfferPrice?: number;
  counterOfferNote?: string;
  cancelReason?: string;
  linkedQuoteId?: string;
  linkedInvoiceNo?: string;
  linkedTripNo?: string;
  timeline: { step: string; timestamp: string; user: string; note?: string }[];
}

export interface QuoteRecord {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  status: 'DRAFT' | 'SENT' | 'CONVERTED' | 'EXPIRED' | 'LOST';
  createdAt: string;
  validUntil: string;
  lines: {
    itemId: string;
    sku: string;
    itemName: string;
    qty: number;
    uom: string;
    quotedPrice: number;
    gstPct: number;
  }[];
  totalAmount: number;
  notes?: string;
  lostReason?: string;
  convertedOrderId?: string;
}

export interface SalesReturnRecord {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  itemName: string;
  qty: number;
  uom: string;
  reason: string;
  condition: 'RESALEABLE' | 'DAMAGED';
  creditAmount: number;
  status: 'CREDIT_NOTE_REQUESTED' | 'APPROVED' | 'STOCK_RECEIVED';
  createdAt: string;
}

export const INITIAL_DAILY_PRICES: DailyPriceRow[] = [
  {
    itemId: 'itm-1',
    sku: 'FG-PANEER-200G',
    itemName: 'Fresh Malai Paneer 200g',
    category: 'PROCESSED_FG',
    uom: 'kg',
    yesterdayFloor: 90,
    yesterdayTarget: 96,
    landedCost: 75,
    minMarginPct: 16,
    floorPrice: 90,
    targetPrice: 95,
    atpStock: 1200,
    lastPricesForCustomer: [
      { date: '05 Nov', price: 91 },
      { date: '29 Oct', price: 93 },
      { date: '21 Oct', price: 92 },
      { date: '14 Oct', price: 90 },
      { date: '07 Oct', price: 94 },
    ],
  },
  {
    itemId: 'itm-2',
    sku: 'FG-CURD-500G',
    itemName: 'Farm Fresh Set Curd 500g',
    category: 'PROCESSED_FG',
    uom: 'ctn',
    yesterdayFloor: 135,
    yesterdayTarget: 142,
    landedCost: 112,
    minMarginPct: 15,
    floorPrice: 135,
    targetPrice: 140,
    atpStock: 250,
    lastPricesForCustomer: [
      { date: '05 Nov', price: 140 },
      { date: '28 Oct', price: 140 },
      { date: '19 Oct', price: 138 },
    ],
  },
  {
    itemId: 'itm-4',
    sku: 'TR-BUTTER-500G',
    itemName: 'Salted Dairy Butter 500g',
    category: 'TRADED_GOOD',
    uom: 'box',
    yesterdayFloor: 240,
    yesterdayTarget: 255,
    landedCost: 215,
    minMarginPct: 10,
    floorPrice: null, // Missing today!
    targetPrice: null,
    atpStock: 40,
    lastPricesForCustomer: [
      { date: '01 Nov', price: 252 },
      { date: '18 Oct', price: 250 },
    ],
  },
  {
    itemId: 'itm-5',
    sku: 'FG-GHEE-1L',
    itemName: 'Pure Desi Danedar Ghee 1L',
    category: 'PROCESSED_FG',
    uom: 'tin',
    yesterdayFloor: 590,
    yesterdayTarget: 625,
    landedCost: 500,
    minMarginPct: 15,
    floorPrice: 590,
    targetPrice: 620,
    atpStock: 340,
    lastPricesForCustomer: [
      { date: '04 Nov', price: 620 },
      { date: '22 Oct', price: 615 },
    ],
  },
];

export const INITIAL_CUSTOMERS_SUMMARY = [
  {
    id: 'cust-1',
    code: 'CUST-001',
    name: 'Sharma Sweets & Dairy',
    phone: '9822012345',
    gstin: '27AABCS1429B1ZB',
    site: 'Pune Central Depot',
    window: '10-12' as const,
    creditLimit: 100000,
    outstanding: 80000,
    overdueDays: 0,
    creditHold: false,
    lastOrderDate: '2026-11-11',
  },
  {
    id: 'cust-2',
    code: 'CUST-002',
    name: 'Hotel Royal Palace Catering',
    phone: '9823055443',
    gstin: '27AAACH2849C1ZA',
    site: 'Pune Central Depot',
    window: '04-08' as const,
    creditLimit: 100000,
    outstanding: 94000,
    overdueDays: 12,
    creditHold: false,
    lastOrderDate: '2026-11-10',
  },
  {
    id: 'cust-3',
    code: 'CUST-003',
    name: 'Modern Grocers Supermarket',
    phone: '9823199887',
    gstin: '27AABCM9988D1Z8',
    site: 'Baner Transit Depot',
    window: '13-16' as const,
    creditLimit: 40000,
    outstanding: 48500,
    overdueDays: 34,
    creditHold: true,
    lastOrderDate: '2026-10-28',
  },
];

export const INITIAL_SALES_ORDERS: SalesOrderRecord[] = [
  {
    id: 'ord-101',
    orderNumber: 'SO-2026-1041',
    customerId: 'cust-1',
    customerName: 'Sharma Sweets & Dairy',
    siteName: 'Pune Central Depot',
    deliveryDate: '2026-11-13',
    deliveryWindow: '10-12',
    status: 'PENDING_APPROVAL',
    createdAt: '2026-11-13T09:15:00',
    createdBy: 'Anita Desai',
    lines: [
      {
        id: 'l-1',
        itemId: 'itm-1',
        sku: 'FG-PANEER-200G',
        itemName: 'Fresh Malai Paneer 200g',
        category: 'PROCESSED_FG',
        qty: 500,
        uom: 'kg',
        unitPrice: 88,
        floorPrice: 90,
        targetPrice: 95,
        atpStock: 1200,
        gstPct: 5,
        reservedQty: 0,
      },
    ],
    subtotal: 44000,
    gstTotal: 2200,
    grandTotal: 46200,
    marginPct: 7.7,
    approvalReason: 'Fresh Malai Paneer 200g is ₹2 below today’s floor (₹90)',
    timeline: [
      { step: 'Draft', timestamp: '13 Nov, 09:12 AM', user: 'Anita Desai' },
      { step: 'Waiting approval', timestamp: '13 Nov, 09:15 AM', user: 'Anita Desai', note: 'Below floor by ₹2' },
    ],
  },
  {
    id: 'ord-102',
    orderNumber: 'SO-2026-1040',
    customerId: 'cust-2',
    customerName: 'Hotel Royal Palace Catering',
    siteName: 'Pune Central Depot',
    deliveryDate: '2026-11-13',
    deliveryWindow: '04-08',
    status: 'READY',
    createdAt: '2026-11-13T08:05:00',
    createdBy: 'Anita Desai',
    lines: [
      {
        id: 'l-2',
        itemId: 'itm-2',
        sku: 'FG-CURD-500G',
        itemName: 'Farm Fresh Set Curd 500g',
        category: 'PROCESSED_FG',
        qty: 200,
        uom: 'ctn',
        unitPrice: 140,
        floorPrice: 135,
        targetPrice: 140,
        atpStock: 250,
        gstPct: 5,
        reservedQty: 200,
      },
    ],
    subtotal: 28000,
    gstTotal: 1400,
    grandTotal: 29400,
    marginPct: 20.0,
    linkedTripNo: 'TRP-2026-088',
    timeline: [
      { step: 'Draft', timestamp: '13 Nov, 08:00 AM', user: 'Anita Desai' },
      { step: 'Confirmed', timestamp: '13 Nov, 08:05 AM', user: 'Anita Desai' },
      { step: 'Ready', timestamp: '13 Nov, 08:40 AM', user: 'Arjun Rao' },
    ],
  },
  {
    id: 'ord-103',
    orderNumber: 'SO-2026-1039',
    customerId: 'cust-1',
    customerName: 'Sharma Sweets & Dairy',
    siteName: 'Pune Central Depot',
    deliveryDate: '2026-11-12',
    deliveryWindow: '10-12',
    status: 'DELIVERED',
    createdAt: '2026-11-12T10:15:00',
    createdBy: 'Anita Desai',
    lines: [
      {
        id: 'l-3',
        itemId: 'itm-5',
        sku: 'FG-GHEE-1L',
        itemName: 'Pure Desi Danedar Ghee 1L',
        category: 'PROCESSED_FG',
        qty: 30,
        uom: 'tin',
        unitPrice: 620,
        floorPrice: 590,
        targetPrice: 620,
        atpStock: 340,
        gstPct: 12,
        reservedQty: 30,
      },
    ],
    subtotal: 18600,
    gstTotal: 2232,
    grandTotal: 20832,
    marginPct: 19.3,
    linkedInvoiceNo: 'INV-2026-0512',
    linkedTripNo: 'TRP-2026-085',
    timeline: [
      { step: 'Confirmed', timestamp: '12 Nov, 10:15 AM', user: 'Anita Desai' },
      { step: 'Dispatched', timestamp: '12 Nov, 11:30 AM', user: 'Mehul Shah' },
      { step: 'Delivered', timestamp: '12 Nov, 01:05 PM', user: 'Mehul Shah' },
    ],
  },
];

export const INITIAL_QUOTES: QuoteRecord[] = [
  {
    id: 'qt-1',
    quoteNumber: 'QT-2026-021',
    customerId: 'cust-1',
    customerName: 'Sharma Sweets & Dairy',
    status: 'SENT',
    createdAt: '2026-11-11',
    validUntil: '2026-11-16',
    lines: [
      {
        itemId: 'itm-1',
        sku: 'FG-PANEER-200G',
        itemName: 'Fresh Malai Paneer 200g',
        qty: 300,
        uom: 'kg',
        quotedPrice: 92,
        gstPct: 5,
      },
    ],
    totalAmount: 28980,
    notes: 'Diwali bulk order quote',
  },
  {
    id: 'qt-2',
    quoteNumber: 'QT-2026-020',
    customerId: 'cust-2',
    customerName: 'Hotel Royal Palace Catering',
    status: 'DRAFT',
    createdAt: '2026-11-12',
    validUntil: '2026-11-19',
    lines: [
      {
        itemId: 'itm-5',
        sku: 'FG-GHEE-1L',
        itemName: 'Pure Desi Danedar Ghee 1L',
        qty: 50,
        uom: 'tin',
        quotedPrice: 615,
        gstPct: 12,
      },
    ],
    totalAmount: 34440,
  },
];

export const INITIAL_RETURNS: SalesReturnRecord[] = [
  {
    id: 'ret-1',
    returnNumber: 'SR-2026-011',
    orderId: 'ord-103',
    orderNumber: 'SO-2026-1039',
    customerId: 'cust-1',
    customerName: 'Sharma Sweets & Dairy',
    itemName: 'Pure Desi Danedar Ghee 1L',
    qty: 2,
    uom: 'tin',
    reason: 'Damaged in transit',
    condition: 'DAMAGED',
    creditAmount: 1388.8,
    status: 'CREDIT_NOTE_REQUESTED',
    createdAt: '2026-11-13',
  },
];

