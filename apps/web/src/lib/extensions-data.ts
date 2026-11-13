/**
 * Phase F13 — Advanced ERP Extensions (R4+ Feature-Flagged Catalogue)
 */

export interface ErpExtensionItem {
  id: string;
  domain: 'CRM & Sales' | 'Supply Chain' | 'Quality & Compliance' | 'Finance' | 'People (HR)' | 'Assets' | 'Intelligence';
  title: string;
  description: string;
  priority: 'H' | 'M' | 'L';
  enabledFlag: boolean;
}

export const INITIAL_EXTENSIONS: ErpExtensionItem[] = [
  { id: 'ext-1', domain: 'CRM & Sales', title: 'WhatsApp Order Console', description: 'Parse incoming customer WhatsApp messages into draft orders (OD-022 BSP).', priority: 'H', enabledFlag: false },
  { id: 'ext-2', domain: 'CRM & Sales', title: 'Standing Customer Price Lists & Online UPI Links', description: 'Negotiated customer rates with approval + UPI payment links on invoices.', priority: 'H', enabledFlag: false },
  { id: 'ext-3', domain: 'Supply Chain', title: 'Barcode / QR Labels & Floor Scanner', description: 'Keyboard-wedge & camera barcode scanning for batches, bins & blind counts.', priority: 'H', enabledFlag: true },
  { id: 'ext-4', domain: 'Quality & Compliance', title: 'Batch Traceability & QC Checks', description: 'Trace RM lot → production batch → customer delivery for recall readiness.', priority: 'H', enabledFlag: true },
  { id: 'ext-5', domain: 'Finance', title: 'Bank Reconciliation & Expense Approvals', description: 'Import bank statements and auto-match receipts/payments.', priority: 'H', enabledFlag: false },
  { id: 'ext-6', domain: 'People (HR)', title: 'Full Payroll & Driver Incentives', description: 'Piece-rate wages, PF/ESI, and delivery/collection incentives.', priority: 'M', enabledFlag: false },
  { id: 'ext-7', domain: 'Assets', title: 'Preventive Maintenance & Live GPS', description: 'Vehicle/machine service schedules and route optimisation.', priority: 'M', enabledFlag: false },
  { id: 'ext-8', domain: 'Intelligence', title: 'AI Assistant & Ad-hoc Report Builder', description: 'Natural-language queries and drag-and-drop custom dashboards.', priority: 'M', enabledFlag: false },
];

export const BATCH_TRACE_SAMPLE = {
  rmLot: 'LOT-MZ-2026-88 (Kaveri Maize Traders, GRN-2026-0218)',
  productionBatch: 'WO-2026-301 (Dairy Gold Pellet 50kg, Yield 98.5%)',
  deliveries: ['SO-2026-101 · Sahyadri Dairy (TRP-2026-501)', 'SO-2026-098 · Patil Dairy Farm (TRP-2026-503)'],
};

