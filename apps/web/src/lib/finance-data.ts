/**
 * Client-side Finance, Collections & Accounts Store / Seed Data for Phase F9
 */

import type { ChequeStatus, OpeningBalanceStatus, TallyVoucherInput } from '@neo/shared';

export interface InvoiceLine {
  sku: string;
  itemName: string;
  hsn: string;
  taxCategory: 'TAXABLE_5' | 'TAXABLE_12' | 'EXEMPT' | 'NIL' | 'NON_GST';
  qty: number;
  rate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceRecord {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  daysOverdue: number;
  customerId: string;
  customerName: string;
  status: 'NOT_PAID' | 'PART_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  irnStatus: 'DISABLED_MVP';
  lines: InvoiceLine[];
}

export interface CustomerArSummary {
  customerId: string;
  customerName: string;
  creditLimit: number;
  creditHold: boolean;
  collectorName: string;
  bucket0to7: number;
  bucket8to15: number;
  bucket16to30: number;
  bucket30Plus: number;
  totalOutstanding: number;
  lastPaymentDate: string;
  ptpStatus: 'NONE' | 'PROMISED' | 'OVERDUE';
}

export interface ReceiptRecord {
  id: string;
  receiptNo: string;
  date: string;
  customerId: string;
  customerName: string;
  mode: 'CASH' | 'CHEQUE' | 'UPI' | 'BANK';
  amount: number;
  collectedBy: string;
  allocations: Array<{ invoiceId: string; invoiceNo: string; allocatedAmount: number }>;
  reversed: boolean;
  reversalReason?: string;
}

export interface HandoverChequeItem {
  id: string;
  chequeNo: string;
  bankName: string;
  amount: number;
  checked: boolean;
}

export interface HandoverRecord {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: 'Driver' | 'Collector';
  expectedCash: number;
  countedCash: number | null;
  variance: number;
  cheques: HandoverChequeItem[];
  status: 'PENDING' | 'VERIFIED' | 'DISPUTED' | 'RESOLVED';
  submittedAt: string;
}

export interface ChequeRecord {
  id: string;
  chequeNo: string;
  customerName: string;
  bankName: string;
  pdcDate: string;
  amount: number;
  status: ChequeStatus;
}

export interface CreditNoteRecord {
  id: string;
  cnNo: string;
  invoiceNo: string;
  customerName: string;
  reason: string;
  amount: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
}

export interface CodPendingStopRecord {
  stopId: string;
  tripNo: string;
  driverName: string;
  orderNo: string;
  customerName: string;
  expectedCod: number;
  collectedCod: number;
  status: 'PENDING' | 'SETTLED';
}

export interface PromiseToPayRecord {
  id: string;
  customerName: string;
  invoiceNo: string;
  promisedAmount: number;
  dueDate: string;
  bucket: 'TODAY' | 'OVERDUE' | 'UPCOMING' | 'BROKEN' | 'KEPT';
  notes: string;
}

export interface SupplierPayableRecord {
  id: string;
  billNo: string;
  supplierName: string;
  billDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  status: 'APPROVED' | 'PART_PAID' | 'PAID';
}

export const INITIAL_INVOICES: InvoiceRecord[] = [
  {
    id: 'inv-101',
    invoiceNo: 'INV-2026-0101',
    invoiceDate: '2026-10-10',
    dueDate: '2026-10-25',
    daysOverdue: 19,
    customerId: 'cust-1',
    customerName: 'Sahyadri Dairy',
    status: 'OVERDUE',
    totalAmount: 100000,
    paidAmount: 40000,
    balanceAmount: 60000,
    irnStatus: 'DISABLED_MVP',
    lines: [
      { sku: 'CF-50', itemName: 'Dairy Gold Pellet 50kg', hsn: '2309', taxCategory: 'EXEMPT', qty: 40, rate: 1500, taxAmount: 0, lineTotal: 60000 },
      { sku: 'MIN-10', itemName: 'Mineral Mix 10kg', hsn: '230990', taxCategory: 'TAXABLE_5', qty: 32, rate: 1190.48, taxAmount: 1904.64, lineTotal: 40000 },
    ],
  },
  {
    id: 'inv-102',
    invoiceNo: 'INV-2026-0102',
    invoiceDate: '2026-11-05',
    dueDate: '2026-11-20',
    daysOverdue: 0,
    customerId: 'cust-1',
    customerName: 'Sahyadri Dairy',
    status: 'NOT_PAID',
    totalAmount: 58400,
    paidAmount: 0,
    balanceAmount: 58400,
    irnStatus: 'DISABLED_MVP',
    lines: [
      { sku: 'CF-50', itemName: 'Dairy Gold Pellet 50kg', hsn: '2309', taxCategory: 'NIL', qty: 38, rate: 1450, taxAmount: 0, lineTotal: 55100 },
      { sku: 'FRT-01', itemName: 'Crate Deposit (Non-GST)', hsn: '9965', taxCategory: 'NON_GST', qty: 11, rate: 300, taxAmount: 0, lineTotal: 3300 },
    ],
  },
  {
    id: 'inv-103',
    invoiceNo: 'INV-2026-0103',
    invoiceDate: '2026-11-11',
    dueDate: '2026-11-26',
    daysOverdue: 0,
    customerId: 'cust-2',
    customerName: 'Gokul Milk Union',
    status: 'PART_PAID',
    totalAmount: 84000,
    paidAmount: 30000,
    balanceAmount: 54000,
    irnStatus: 'DISABLED_MVP',
    lines: [
      { sku: 'BYP-25', itemName: 'Bypass Protein 25kg', hsn: '2309', taxCategory: 'TAXABLE_12', qty: 50, rate: 1500, taxAmount: 9000, lineTotal: 84000 },
    ],
  },
  {
    id: 'inv-104',
    invoiceNo: 'INV-2026-0104',
    invoiceDate: '2026-11-13',
    dueDate: '2026-11-28',
    daysOverdue: 0,
    customerId: 'cust-3',
    customerName: 'Nandini Agro Feeds',
    status: 'PAID',
    totalAmount: 42000,
    paidAmount: 42000,
    balanceAmount: 0,
    irnStatus: 'DISABLED_MVP',
    lines: [
      { sku: 'CF-50', itemName: 'Dairy Gold Pellet 50kg', hsn: '2309', taxCategory: 'EXEMPT', qty: 28, rate: 1500, taxAmount: 0, lineTotal: 42000 },
    ],
  },
];

export const INITIAL_AR_AGING: CustomerArSummary[] = [
  {
    customerId: 'cust-1',
    customerName: 'Sahyadri Dairy',
    creditLimit: 200000,
    creditHold: false,
    collectorName: 'Mahesh Desai',
    bucket0to7: 58400,
    bucket8to15: 0,
    bucket16to30: 60000,
    bucket30Plus: 0,
    totalOutstanding: 118400,
    lastPaymentDate: '2026-11-01',
    ptpStatus: 'PROMISED',
  },
  {
    customerId: 'cust-2',
    customerName: 'Gokul Milk Union',
    creditLimit: 150000,
    creditHold: false,
    collectorName: 'Mahesh Desai',
    bucket0to7: 54000,
    bucket8to15: 0,
    bucket16to30: 0,
    bucket30Plus: 38000,
    totalOutstanding: 92000,
    lastPaymentDate: '2026-10-28',
    ptpStatus: 'OVERDUE',
  },
  {
    customerId: 'cust-3',
    customerName: 'Nandini Agro Feeds',
    creditLimit: 100000,
    creditHold: false,
    collectorName: 'Sandeep Jadhav',
    bucket0to7: 0,
    bucket8to15: 0,
    bucket16to30: 0,
    bucket30Plus: 0,
    totalOutstanding: 0,
    lastPaymentDate: '2026-11-13',
    ptpStatus: 'NONE',
  },
];

export const INITIAL_RECEIPTS: ReceiptRecord[] = [
  {
    id: 'rcp-1',
    receiptNo: 'RCP-2026-0411',
    date: '2026-11-13',
    customerId: 'cust-3',
    customerName: 'Nandini Agro Feeds',
    mode: 'UPI',
    amount: 42000,
    collectedBy: 'Direct UPI',
    allocations: [{ invoiceId: 'inv-104', invoiceNo: 'INV-2026-0104', allocatedAmount: 42000 }],
    reversed: false,
  },
  {
    id: 'rcp-2',
    receiptNo: 'RCP-2026-0410',
    date: '2026-11-11',
    customerId: 'cust-2',
    customerName: 'Gokul Milk Union',
    mode: 'CASH',
    amount: 30000,
    collectedBy: 'Mahesh Desai',
    allocations: [{ invoiceId: 'inv-103', invoiceNo: 'INV-2026-0103', allocatedAmount: 30000 }],
    reversed: false,
  },
];

export const INITIAL_HANDOVERS: HandoverRecord[] = [
  {
    id: 'hnd-1',
    staffId: 'drv-1',
    staffName: 'Raju Pawar',
    staffRole: 'Driver',
    expectedCash: 42500,
    countedCash: null,
    variance: 0,
    cheques: [
      { id: 'hc-1', chequeNo: '001234', bankName: 'SBI Baramati', amount: 8000, checked: true },
      { id: 'hc-2', chequeNo: '001240', bankName: 'HDFC Indapur', amount: 5000, checked: true },
      { id: 'hc-3', chequeNo: '556677', bankName: 'Bank of Maharashtra', amount: 5000, checked: false },
    ],
    status: 'PENDING',
    submittedAt: '2026-11-13 16:40',
  },
  {
    id: 'hnd-2',
    staffId: 'col-2',
    staffName: 'Sandeep Jadhav',
    staffRole: 'Collector',
    expectedCash: 9200,
    countedCash: 9200,
    variance: 0,
    cheques: [],
    status: 'VERIFIED',
    submittedAt: '2026-11-13 15:10',
  },
];

export const INITIAL_CHEQUES: ChequeRecord[] = [
  { id: 'chq-1', chequeNo: '001234', customerName: 'Sahyadri Dairy', bankName: 'SBI Baramati', pdcDate: '2026-11-13', amount: 8000, status: 'RECEIVED' },
  { id: 'chq-2', chequeNo: '001240', customerName: 'Gokul Milk Union', bankName: 'HDFC Indapur', pdcDate: '2026-11-14', amount: 15000, status: 'DEPOSITED' },
  { id: 'chq-3', chequeNo: '556677', customerName: 'Patil Dairy Farm', bankName: 'ICICI Daund', pdcDate: '2026-11-10', amount: 12000, status: 'CLEARED' },
];

export const INITIAL_CREDIT_NOTES: CreditNoteRecord[] = [
  {
    id: 'cn-1',
    cnNo: 'CN-2026-009',
    invoiceNo: 'INV-2026-0103',
    customerName: 'Gokul Milk Union',
    reason: 'Damaged 2 bags during unloading (ISS-2026-01)',
    amount: 2000,
    status: 'PENDING_APPROVAL',
    createdAt: '2026-11-13 15:05',
  },
];

export const INITIAL_COD_STOPS: CodPendingStopRecord[] = [
  {
    stopId: 'stp-1',
    tripNo: 'TRP-2026-501',
    driverName: 'Raju Pawar',
    orderNo: 'SO-2026-101',
    customerName: 'Sahyadri Dairy',
    expectedCod: 15000,
    collectedCod: 15000,
    status: 'PENDING',
  },
  {
    stopId: 'stp-2',
    tripNo: 'TRP-2026-501',
    driverName: 'Raju Pawar',
    orderNo: 'SO-2026-102',
    customerName: 'Gokul Milk Union',
    expectedCod: 12000,
    collectedCod: 10000,
    status: 'PENDING',
  },
];

export const INITIAL_PTPS: PromiseToPayRecord[] = [
  { id: 'ptp-1', customerName: 'Sahyadri Dairy', invoiceNo: 'INV-2026-0101', promisedAmount: 30000, dueDate: '2026-11-13', bucket: 'TODAY', notes: 'Owner promised NEFT by 6 PM' },
  { id: 'ptp-2', customerName: 'Gokul Milk Union', invoiceNo: 'INV-2026-0103', promisedAmount: 25000, dueDate: '2026-11-11', bucket: 'OVERDUE', notes: 'Follow up with accounts' },
  { id: 'ptp-3', customerName: 'Patil Dairy Farm', invoiceNo: 'INV-2026-0098', promisedAmount: 18000, dueDate: '2026-11-16', bucket: 'UPCOMING', notes: 'Cheque scheduled' },
];

export const INITIAL_SUPPLIER_PAYABLES: SupplierPayableRecord[] = [
  { id: 'ap-1', billNo: 'BILL-2026-081', supplierName: 'Kaveri Maize Traders', billDate: '2026-11-01', dueDate: '2026-11-16', totalAmount: 145000, paidAmount: 50000, status: 'PART_PAID' },
  { id: 'ap-2', billNo: 'BILL-2026-084', supplierName: 'Deccan Mineral Corp', billDate: '2026-11-10', dueDate: '2026-11-25', totalAmount: 64000, paidAmount: 0, status: 'APPROVED' },
];

export const INITIAL_TALLY_VOUCHERS: TallyVoucherInput[] = [
  { voucherNo: 'INV-2026-0104', voucherType: 'Sales', date: '2026-11-13', partyName: 'Nandini Agro Feeds', amount: 42000, narration: 'Sales Invoice INV-2026-0104' },
  { voucherNo: 'RCP-2026-0411', voucherType: 'Receipt', date: '2026-11-13', partyName: 'Nandini Agro Feeds', amount: 42000, narration: 'UPI Receipt against INV-2026-0104' },
  { voucherNo: 'RCP-2026-0410', voucherType: 'Receipt', date: '2026-11-11', partyName: 'Gokul Milk Union', amount: 30000, narration: 'Cash Receipt against INV-2026-0103' },
  { voucherNo: 'CN-2026-009', voucherType: 'Credit Note', date: '2026-11-13', partyName: 'Gokul Milk Union', amount: 2000, narration: 'Damage claim ISS-2026-01' },
];

export interface OpeningBalanceRow {
  id: string;
  partyType: 'CUSTOMER' | 'SUPPLIER';
  partyName: string;
  openingBalance: number;
  valid: boolean;
  error?: string;
}

export interface OpeningBalanceBatch {
  id: string;
  batchNo: string;
  cutoffDate: string;
  status: OpeningBalanceStatus;
  rows: OpeningBalanceRow[];
}

export const INITIAL_OPENING_BATCH: OpeningBalanceBatch = {
  id: 'ob-1',
  batchNo: 'OB-2026-FY',
  cutoffDate: '2026-11-01',
  status: 'DRAFT',
  rows: [
    { id: 'obr-1', partyType: 'CUSTOMER', partyName: 'Sahyadri Dairy', openingBalance: 60000, valid: true },
    { id: 'obr-2', partyType: 'CUSTOMER', partyName: 'Gokul Milk Union', openingBalance: 38000, valid: true },
    { id: 'obr-3', partyType: 'SUPPLIER', partyName: 'Kaveri Maize Traders', openingBalance: 95000, valid: true },
  ],
};

