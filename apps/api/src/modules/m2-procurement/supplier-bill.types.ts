/**
 * Supplier Bill Domain Types
 * Tax invoice generation at approval for M2 Procurement 3-way matching
 */

import { BillStatus } from './enums/bill-status.enum.js';

// Re-export for convenience
export { BillStatus };

/**
 * Supplier Bill — Tax invoice from a supplier
 *
 * BR: Generate supplier bill for non-returns purchase transaction
 * BR: Route workflows: DRAFT → PENDING_APPROVAL → [APPROVED/REJECTED]
 * BR: 3-way match validation: PO.txn_date ≤ GRN.txn_date → PO.total_amount ≤ GRN.total_amount
 * BR: Ledger integration via LedgerPort for vendor accounting
 * BR: Route workflows: APPROVED → tax_invoice 생성 → receives_tax_invoice 생성
 */
export interface SupplierBill {
  /** Internal system ID */
  id: string;

  /** External company bill number */
  bill_number: string;

  /** Reference to purchase order */
  po_id: string;

  /** Reference to goods receipt note */
  grn_id?: string;

  /** Reference to billing invoice */
  tax_invoice_id?: string;

  /** Reference to supplier */
  supplier_id: string;

  /** Reference to site */
  site_id: string;

  /** Bill currency */
  currency: string;

  /** Bill date */
  bill_date: Date;

  /** Due date */
  due_date: Date;

  /** Subtotal amount */
  subtotal: string;

  /** Tax information */
  tax_total: string;

  /** Total amount */
  total_amount: string;

  /** GST split */
  cgst?: string;
  sgst?: string;
  igst?: string;

  /** Status according to state machine */
  status: BillStatus;

  /** 3-way match status */
  three_way_status: THREE_WAY_STATUS;

  /** Rejection reason if REJECTED */
  rejection_reason?: string;

  /** Approval reason if APPROVED */
  approval_reason?: string;

  /** Approval by (user ID) */
  approved_by?: string;

  /** Approval timestamp */
  approved_at?: Date;

  /** Created by (user ID) */
  created_by: string;

  /** Created at */
  created_at: Date;

  /** Updated at */
  updated_at: Date;

  /** 1:N relationship between GRN items and bill items */
  items: SupplierBillItem[];
}

/**
 * Supplier Bill Line Item
 */
export interface SupplierBillItem {
  id?: string;
  bill_id?: string;
  grn_item_id?: string;
  batch_id: string;

  /** Reference to material item */
  item_id: string;

  /** Item name for display */
  item_name: string;

  /** Quantity billed */
  quantity: string;

  /** Rate per unit */
  rate_per_unit: string;

  /** Line tax amount */
  tax_amount: string;

  /** Line total */
  line_total: string;

  /** Tax treatment (TAXABLE/EXEMPT/NIL_RATED) */
  tax_treatment?: string;

  /** Rate percentage */
  tax_rate?: string;
}

/**
 * 3-way match validation result
 */
export enum THREE_WAY_STATUS {
  /** Matches PO and GRN, ready for approval */
  MATCHED = 'MATCHED',

  /** PO.txn_date > GRN.txn_date — timing mismatch */
  TIMING_MISMATCH = 'TIMING_MISMATCH',

  /** PO.total_amount > GRN.total_amount — amount mismatch */
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',

  /** Timing mismatch and amount mismatch */
  FULL_MISMATCH = 'FULL_MISMATCH',
}

/**
 * DTO for creating a supplier bill
 */
export interface CreateBillDto {
  /** Supplier ID */
  supplier_id: string;

  /** Purchase order ID */
  po_id: string;

  /** Site ID */
  site_id: string;

  /** Bill date (defaults to today) */
  bill_date?: Date;

  /** Due days (defaults to 30) */
  due_days?: number;

  /** Line items */
  items: SupplierBillItem[];

  /** Approval boundary check */
  skip_approval_check?: boolean;
}

/**
 * DTO for updating bill status
 */
export interface UpdateBillStatusDto {
  status: BillStatus;
  reason?: BillApprovalReason;
}

/**
 * Approval reasons
 */
export enum BillApprovalReason {
  APPROVED_BY_OWNER = 'APPROVED_BY_OWNER',
  APPROVED_BY_SUPER_ADMIN = 'APPROVED_BY_SUPER_ADMIN',
}

/**
 * DTO for querying bills
 */
export interface BillQueryDto {
  /** Filter by supplier ID */
  supplier_id?: string;

  /** Filter by PO ID */
  po_id?: string;

  /** Filter by site ID */
  site_id?: string;

  /** Filter by status */
  status?: BillStatus;

  /** Filter by 3-way status */
  three_way_status?: THREE_WAY_STATUS;

  /** Search by bill number */
  bill_number?: string;
}

/**
 * Bill created event
 */
export interface BillCreatedEvent {
  event: 'bill.created';
  bill_id: string;
  bill_number: string;
  supplier_id: string;
  po_id: string;
  total_amount: string;
  created_at: Date;
  initiator_id: string;
}

/**
 * Bill approved event
 */
export interface BillApprovedEvent {
  event: 'bill.approved';
  bill_id: string;
  bill_number: string;
  supplier_id: string;
  amount: string;
  approved_by: string;
  approved_at: Date;
}
