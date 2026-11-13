/**
 * Client-side Control Tower, Approvals, Analytics & Notifications Seed Data (Phase F10)
 */

import type { ExceptionItem } from '@neo/shared';

export interface SitePulseSnapshot {
  siteId: string;
  siteName: string;
  todaySalesInr: number;
  salesDeltaPct: number;
  grossMarginPct: number;
  cashCollectedInr: number;
  ordersToDispatch: number;
  batchesRunning: number;
  trucksOnRoadLabel: string;
  supplierShortfalls: number;
  yesterdayEodStatus: 'CLOSED' | 'PENDING';
  yesterdayEodMinutes: number;
}

export const SITE_PULSE_DATA: SitePulseSnapshot[] = [
  {
    siteId: 'all',
    siteName: 'All Sites',
    todaySalesInr: 482000,
    salesDeltaPct: 8.4,
    grossMarginPct: 11.2,
    cashCollectedInr: 210000,
    ordersToDispatch: 18,
    batchesRunning: 3,
    trucksOnRoadLabel: 'Stop 4/9 · 6/7 · 2/5',
    supplierShortfalls: 2,
    yesterdayEodStatus: 'CLOSED',
    yesterdayEodMinutes: 14,
  },
  {
    siteId: 'site-baramati',
    siteName: 'Baramati Plant',
    todaySalesInr: 312000,
    salesDeltaPct: 10.2,
    grossMarginPct: 11.8,
    cashCollectedInr: 145000,
    ordersToDispatch: 11,
    batchesRunning: 3,
    trucksOnRoadLabel: 'Stop 4/9 · 6/7',
    supplierShortfalls: 1,
    yesterdayEodStatus: 'CLOSED',
    yesterdayEodMinutes: 14,
  },
  {
    siteId: 'site-pune',
    siteName: 'Pune Distribution Hub',
    todaySalesInr: 170000,
    salesDeltaPct: 5.1,
    grossMarginPct: 10.1,
    cashCollectedInr: 65000,
    ordersToDispatch: 7,
    batchesRunning: 0,
    trucksOnRoadLabel: 'Stop 2/5',
    supplierShortfalls: 1,
    yesterdayEodStatus: 'CLOSED',
    yesterdayEodMinutes: 19,
  },
];

export const OWNER_KPIS = [
  { label: 'EOD Time-to-Close', value: '14 min', hint: 'Average minutes from EOD start to Owner sign-off' },
  { label: 'ePOD Capture %', value: '96.4%', hint: 'Delivered stops with receiver signature or photo' },
  { label: 'Order Confirm Time', value: '11 min', hint: 'Median time from quote/order entry to confirmation' },
  { label: 'Margin Erosion', value: '0.4%', hint: 'Price overrides below target minus landed cost' },
  { label: 'Missed Entries', value: '1', hint: 'Open trips or unverified handovers past cutoff' },
];

export const SALES_TREND_30D = [
  { day: 'Oct 15', salesInr: 365000 },
  { day: 'Oct 20', salesInr: 410000 },
  { day: 'Oct 25', salesInr: 392000 },
  { day: 'Oct 30', salesInr: 448000 },
  { day: 'Nov 04', salesInr: 425000 },
  { day: 'Nov 09', salesInr: 461000 },
  { day: 'Nov 13', salesInr: 482000 },
];

export const INITIAL_EXCEPTIONS: ExceptionItem[] = [
  {
    id: 'exc-1',
    type: 'PRICE_OVERRIDE',
    title: 'Price Override — Sahyadri Dairy wants 500 kg Dairy Gold at ₹88',
    siteId: 'site-baramati',
    siteName: 'Baramati Plant',
    requesterName: 'Priya Kulkarni',
    amountInr: 44000,
    waitingMinutes: 4,
    escalatesInMinutes: 56,
    delegatedTo: 'Owner (Anil Deshmukh)',
    status: 'PENDING',
    originOrderNo: 'SO-2611-0042',
    originOrderUnlocked: false,
    facts: {
      'Floor Price': '₹90.00',
      'Target Price': '₹95.00',
      'Last Price': '₹91.00',
      'Margin at ₹88': '6.8%',
      'Order Impact': 'SO-2611-0042 paused (₹72,000)',
    },
  },
  {
    id: 'exc-2',
    type: 'CASH_HANDOVER_VARIANCE',
    title: 'Cash Handover Variance — Raju Pawar (−₹500)',
    siteId: 'site-baramati',
    siteName: 'Baramati Plant',
    requesterName: 'Cashier Desk',
    amountInr: 500,
    waitingMinutes: 12,
    escalatesInMinutes: 48,
    status: 'PENDING',
    facts: {
      'Expected Cash': '₹42,500.00',
      'Counted Cash': '₹42,000.00',
      'Variance': '−₹500.00',
      'Trip': 'TRP-2026-501',
    },
  },
  {
    id: 'exc-3',
    type: 'CREDIT_BREACH',
    title: 'Credit Limit Breach — Gokul Milk Union (+₹28,000 over limit)',
    siteId: 'site-pune',
    siteName: 'Pune Distribution Hub',
    requesterName: 'Mahesh Desai',
    amountInr: 28000,
    waitingMinutes: 19,
    escalatesInMinutes: 41,
    status: 'PENDING',
    originOrderNo: 'SO-2611-0049',
    originOrderUnlocked: false,
    facts: {
      'Credit Limit': '₹1,50,000.00',
      'Current AR': '₹1,50,000.00',
      'Overdue 30+d': '₹38,000.00',
      'New Order': '₹28,000.00',
    },
  },
  {
    id: 'exc-4',
    type: 'SUPPLIER_PRICE_SPIKE',
    title: 'Supplier Price Spike — Yellow Maize +6.2% vs last GRN',
    siteId: 'site-baramati',
    siteName: 'Baramati Plant',
    requesterName: 'Procurement Desk',
    amountInr: 18600,
    waitingMinutes: 27,
    escalatesInMinutes: 33,
    status: 'PENDING',
    facts: {
      'Supplier': 'Kaveri Maize Traders',
      'Last Rate': '₹24.50/kg',
      'Quoted Rate': '₹26.02/kg',
      'Variance': '+6.2%',
    },
  },
  {
    id: 'exc-5',
    type: 'YIELD_VARIANCE',
    title: 'Factory Yield Variance — Batch WO-2026-302 at 96.0% (−4.0%)',
    siteId: 'site-baramati',
    siteName: 'Baramati Plant',
    requesterName: 'Suresh Patil (Prod Mgr)',
    amountInr: 3200,
    waitingMinutes: 40,
    escalatesInMinutes: 20,
    status: 'APPROVED',
    resolvedBy: 'Anil Deshmukh',
    resolvedAt: '15:40',
    remarks: 'Moisture loss within seasonal expectation',
    facts: {
      'Issued RM': '200 kg',
      'Output': '192 kg',
      'Tolerance': '±3%',
    },
  },
];

export const ANALYTICS_CUSTOMERS = [
  { customer: 'Sahyadri Dairy', revenue: 1240000, grossProfit: 158000, marginPct: 12.7, orders: 24 },
  { customer: 'Gokul Milk Union', revenue: 980000, grossProfit: 102000, marginPct: 10.4, orders: 19 },
  { customer: 'Nandini Agro Feeds', revenue: 745000, grossProfit: 96850, marginPct: 13.0, orders: 15 },
  { customer: 'Patil Dairy Farm', revenue: 510000, grossProfit: 48450, marginPct: 9.5, orders: 11 },
];

export const ANALYTICS_SUPPLIERS = [
  { supplier: 'Kaveri Maize Traders', fillRatePct: 97.5, priceVarPct: 1.8, pos: 14, grns: 14 },
  { supplier: 'Deccan Mineral Corp', fillRatePct: 92.0, priceVarPct: 0.5, pos: 9, grns: 8 },
  { supplier: 'Western Molasses Co', fillRatePct: 88.5, priceVarPct: 3.1, pos: 6, grns: 5 },
];

export const ANALYTICS_FACTORY = [
  { week: 'Oct W3', plannedKg: 42000, outputKg: 41200, yieldPct: 98.1, wastagePct: 1.1 },
  { week: 'Oct W4', plannedKg: 45000, outputKg: 44100, yieldPct: 98.0, wastagePct: 1.3 },
  { week: 'Nov W1', plannedKg: 48000, outputKg: 47280, yieldPct: 98.5, wastagePct: 0.9 },
  { week: 'Nov W2', plannedKg: 50000, outputKg: 49100, yieldPct: 98.2, wastagePct: 1.0 },
];

export interface NotificationLogRecord {
  id: string;
  channel: 'WHATSAPP' | 'SMS' | 'PUSH' | 'IN_APP';
  recipient: string;
  template: string;
  status: 'SENT' | 'FAILED' | 'RETRIED';
  timestamp: string;
  errorDetail?: string;
}

export const INITIAL_NOTIFICATIONS: NotificationLogRecord[] = [
  {
    id: 'ntf-1',
    channel: 'WHATSAPP',
    recipient: 'Sahyadri Dairy (+91 98220 11223)',
    template: 'Tax Invoice INV-2026-0102 PDF',
    status: 'SENT',
    timestamp: '2026-11-13 16:45',
  },
  {
    id: 'ntf-2',
    channel: 'SMS',
    recipient: 'Gokul Milk Union (+91 98230 44556)',
    template: 'Payment Overdue Reminder (30+ days)',
    status: 'FAILED',
    timestamp: '2026-11-13 16:30',
    errorDetail: 'DLT template timeout — retry queued',
  },
  {
    id: 'ntf-3',
    channel: 'IN_APP',
    recipient: 'Owner (Anil Deshmukh)',
    template: 'Price Override Requested: SO-2611-0042',
    status: 'SENT',
    timestamp: '2026-11-13 17:05',
  },
];

