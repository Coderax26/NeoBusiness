/**
 * Client-side Reports Library, Print Documents & Scheduled Reports Data (Phase F12)
 */

export interface ReportDefinition {
  id: string;
  area: 'Sales' | 'Receivables' | 'Cash' | 'Purchases' | 'Inventory' | 'Production' | 'Logistics' | 'Tax (GST)' | 'Management';
  title: string;
  description: string;
  favourite: boolean;
  lastRun: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  totalLabel?: string;
  totalValue?: string;
}

export const INITIAL_REPORTS: ReportDefinition[] = [
  {
    id: 'rpt-sales-cust',
    area: 'Sales',
    title: 'Customer-wise Sales & Margin',
    description: 'Which customers buy the most and how much gross margin we keep.',
    favourite: true,
    lastRun: 'Today 16:00',
    columns: ['Customer', 'Orders', 'Revenue (₹)', 'Gross Profit (₹)', 'Margin %'],
    rows: [
      ['Sahyadri Dairy', 24, '12,40,000.00', '1,58,000.00', '12.7%'],
      ['Gokul Milk Union', 19, '9,80,000.00', '1,02,000.00', '10.4%'],
      ['Nandini Agro Feeds', 15, '7,45,000.00', '96,850.00', '13.0%'],
    ],
    totalLabel: 'Total Revenue',
    totalValue: '₹29,65,000.00',
  },
  {
    id: 'rpt-ar-aging',
    area: 'Receivables',
    title: 'AR Aging Summary',
    description: 'Who owes us money and for how long (0–7 / 8–15 / 16–30 / 30+ days).',
    favourite: true,
    lastRun: 'Today 15:30',
    columns: ['Customer', '0-7d (₹)', '16-30d (₹)', '30+d (₹)', 'Total AR (₹)'],
    rows: [
      ['Sahyadri Dairy', '58,400.00', '60,000.00', '0.00', '1,18,400.00'],
      ['Gokul Milk Union', '54,000.00', '0.00', '38,000.00', '92,000.00'],
    ],
    totalLabel: 'Total Receivables',
    totalValue: '₹2,10,400.00',
  },
  {
    id: 'rpt-eod-cash',
    area: 'Cash',
    title: 'Daily Cash & EOD Summary',
    description: 'Opening cash, collections, handovers, and bank deposit slip reconciliation.',
    favourite: false,
    lastRun: 'Yesterday 20:14',
    columns: ['Date', 'Cash Collected (₹)', 'Deposited (₹)', 'Variance (₹)', 'Status'],
    rows: [
      ['2026-11-12', '42,500.00', '42,500.00', '0.00', 'CLOSED'],
      ['2026-11-11', '38,000.00', '38,000.00', '0.00', 'CLOSED'],
    ],
    totalLabel: '2-Day Deposits',
    totalValue: '₹80,500.00',
  },
  {
    id: 'rpt-stock-val',
    area: 'Inventory',
    title: 'Stock Summary with Value',
    description: 'Current stock quantities and valuation across Baramati Plant & Pune Hub.',
    favourite: false,
    lastRun: 'Today 14:15',
    columns: ['Item', 'Site', 'Qty', 'Valuation (₹)'],
    rows: [
      ['Dairy Gold Pellet 50kg', 'Baramati Plant', '420 bags', '6,30,000.00'],
      ['Yellow Maize', 'Baramati Plant', '14,500 kg', '3,55,250.00'],
    ],
    totalLabel: 'Total Stock Value',
    totalValue: '₹9,85,250.00',
  },
  {
    id: 'rpt-yield',
    area: 'Production',
    title: 'Batch Yield & Wastage Report',
    description: 'Planned vs actual output and wastage % per factory batch.',
    favourite: false,
    lastRun: 'Today 12:00',
    columns: ['Work Order', 'Product', 'Issued (kg)', 'Output (kg)', 'Yield %'],
    rows: [
      ['WO-2026-301', 'Dairy Gold Pellet', '1,000', '985', '98.5%'],
      ['WO-2026-302', 'Bypass Protein', '200', '192', '96.0%'],
    ],
  },
  {
    id: 'rpt-trip-perf',
    area: 'Logistics',
    title: 'Trip Register & Delivery Performance',
    description: 'Completed stops, COD collected, and on-time % per vehicle.',
    favourite: false,
    lastRun: 'Today 16:40',
    columns: ['Trip #', 'Vehicle', 'Stops', 'COD Collected (₹)', 'Status'],
    rows: [
      ['TRP-2026-501', 'MH-12-AB-1234', '2 / 3', '25,000.00', 'IN_TRANSIT'],
      ['TRP-2026-503', 'MH-14-CD-4421', '1 / 1', '18,000.00', 'COMPLETED'],
    ],
  },
  {
    id: 'rpt-gstr1',
    area: 'Tax (GST)',
    title: 'GSTR-1 Outward Supplies Summary',
    description: 'B2B/B2C outward supplies with HSN and Exempt/Nil/Taxable split.',
    favourite: false,
    lastRun: 'Nov 10',
    columns: ['HSN', 'Category', 'Taxable Value (₹)', 'Total GST (₹)'],
    rows: [
      ['2309', 'EXEMPT / NIL', '1,57,100.00', '0.00'],
      ['230990', 'TAXABLE 5% / 12%', '1,13,095.36', '10,904.64'],
    ],
  },
];

export const PRINTABLE_DOCUMENTS = [
  { id: 'doc-inv', title: 'Tax Invoice (A4)', docNo: 'INV-2026-0101', party: 'Sahyadri Dairy', amount: '₹1,00,000.00', mode: 'Server PDF' },
  { id: 'doc-chl', title: 'Delivery Challan (A4)', docNo: 'DC-2026-801', party: 'Sahyadri Dairy', amount: '₹58,400.00', mode: 'Server PDF' },
  { id: 'doc-dep', title: 'EOD Bank Deposit Slip', docNo: 'DEP-20261113', party: 'SBI Baramati', amount: '₹28,500.00', mode: 'Server PDF' },
  { id: 'doc-so', title: 'Sales Order / Proforma', docNo: 'SO-2611-0042', party: 'Sahyadri Dairy', amount: '₹72,000.00', mode: 'Print CSS A4' },
  { id: 'doc-po', title: 'Purchase Order', docNo: 'PO-2026-0412', party: 'Kaveri Maize Traders', amount: '₹1,45,000.00', mode: 'Print CSS A4' },
];

export const INITIAL_SCHEDULED_REPORTS = [
  { id: 'sch-1', reportTitle: 'Daily Business Summary', frequency: 'Daily at 9:00 PM', recipients: 'Owner (WhatsApp + Email)', active: true },
  { id: 'sch-2', reportTitle: 'AR Aging Summary', frequency: 'Every Monday 8:30 AM', recipients: 'Owner, Accounts Team', active: true },
];

