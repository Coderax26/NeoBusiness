/**
 * Plain-language labels, descriptions, and formatting helpers for Settings & Admin screens.
 */

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Business Owner (Full Admin)',
  OPS_COORD: 'Operations Coordinator',
  PROD_MGR: 'Production Manager',
  STOREKEEPER: 'Storekeeper',
  DRIVER: 'Delivery Driver',
  COLLECTOR: 'Payment Collector',
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: 'Full access to all locations, approvals, pricing, finances, and company settings.',
  OPS_COORD: 'Manages daily customer orders, delivery trips, invoices, and cash handovers at assigned sites.',
  PROD_MGR: 'Runs factory production batches, raw material requests, wastage logs, and shift attendance. Profit margins and prices are hidden.',
  STOREKEEPER: 'Records incoming supplier deliveries (blind count), stock transfers, and stock counts. Supplier rates are hidden.',
  DRIVER: 'Uses the mobile delivery screen to complete assigned trips, collect customer sign-off, and record cash on delivery.',
  COLLECTOR: 'Uses the mobile collection screen to visit customers, record payments, and submit cash handovers.',
};

export function getRoleLabel(role?: string | null): string {
  if (!role) return '';
  return ROLE_LABELS[role.toUpperCase()] || role.replace(/_/g, ' ');
}

export const SITE_TYPE_LABELS: Record<string, string> = {
  FACTORY: 'Factory / Production Plant',
  WAREHOUSE: 'Warehouse / Storage Hub',
  DEPOT: 'Warehouse / Distribution Hub',
  OFFICE: 'Office / Branch',
};

export const SITE_TYPE_DESCRIPTIONS: Record<string, string> = {
  FACTORY: 'Produces finished goods and can hold raw materials and dispatch customer orders.',
  WAREHOUSE: 'Stores finished goods or traded items and fulfills customer deliveries.',
  DEPOT: 'Stores finished goods or traded items and fulfills customer deliveries.',
  OFFICE: 'Administrative or sales office. Usually does not hold stock or dispatch orders.',
};

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL_STORE: 'Raw Material Storage',
  FINISHED_GOODS_STORE: 'Finished Goods Storage',
  TRADING_WAREHOUSE: 'Trading & Dispatch Storage',
  VEHICLE: 'Delivery Vehicle Stock',
  QUARANTINE: 'Hold / Damaged Stock Area',
  OFFICE: 'Office Area',
  DRY_STORE: 'Dry Storage',
  COLD_STORE: 'Cold Storage',
  DISPATCH_BAY: 'Dispatch Bay',
};

export function getLocationTypeLabel(type?: string | null): string {
  if (!type) return 'General Storage';
  return LOCATION_TYPE_LABELS[type.toUpperCase()] || type.replace(/_/g, ' ');
}

export const PERMISSION_LABELS: Record<string, string> = {
  'dashboard.read_pulse': 'View Owner Control Tower & daily business pulse',
  'exception.resolve': 'Approve or reject special requests (price overrides, credit exceptions)',
  'analytics.read_customers': 'View customer profitability and payment analytics',
  'admin.manage': 'Manage company profile, staff accounts, sites, and settings',
  'eod.signoff': 'Close and sign off the daily business accounts (End of Day)',
  'audit.view': 'View permanent activity and change history',
  'order.view': 'View customer sales orders',
  'order.create': 'Create and confirm customer sales orders',
  'fleet.view': 'View delivery trips and vehicles',
  'fleet.read': 'View assigned delivery trips',
  'finance.view': 'View customer invoices, balances, and payment handovers',
  'receipt.verify_handover': 'Count and verify cash/cheque handovers from drivers & collectors',
  'wo.read': 'View factory production work orders',
  'wo.start': 'Start and complete factory production batches',
  'requisition.create': 'Request raw materials from the storekeeper',
  'inventory.read': 'Check current stock quantities',
  'inventory.transfer': 'Transfer stock between storage areas or sites',
  'grn.record_blind': 'Count and record incoming supplier shipments',
  'epod.capture': 'Capture customer delivery signature & photo proof',
  'collection.create': 'Record customer payments received in the field',
  'ptp.create': 'Record customer payment promises (follow-up dates)',
};

export const MASKED_FIELD_LABELS: Record<string, string> = {
  'admin.*': 'Company settings, staff management, and audit logs',
  customerLedger: 'Customer account balances and payment history',
  ordered_qty: 'Expected purchase order quantities (for blind counting)',
  unit_price: 'Purchase and selling unit prices',
  cost: 'Product manufacturing & purchase costs',
  price: 'Selling prices & discount rates',
  margin: 'Profit margins and markup percentages',
};

export const APPROVAL_EVENT_COPY: Record<
  string,
  { title: string; when: string; example: string }
> = {
  PRICE_OVERRIDE: {
    title: 'Selling Below Minimum Price',
    when: 'Triggers when a coordinator enters a rate lower than today’s minimum allowed floor price.',
    example: 'Example: Floor price is ₹450, order entered at ₹435.',
  },
  CREDIT_BREACH: {
    title: 'Customer Over Credit Limit or Overdue',
    when: 'Triggers when a new order pushes a customer past their credit limit or they have overdue bills.',
    example: 'Example: Customer limit is ₹1,00,000 and new order brings balance to ₹1,15,000.',
  },
  SUPPLIER_PRICE_SPIKE: {
    title: 'Supplier Rate Increase Alert',
    when: 'Triggers when a purchase order price is higher than the usual supplier rate beyond the allowed limit.',
    example: 'Example: Usual rate ₹200/kg, new supplier quote ₹215/kg.',
  },
  SUPPLIER_SHORTFALL: {
    title: 'Supplier Short Delivery',
    when: 'Triggers when received goods are less than what was ordered from the supplier.',
    example: 'Example: Ordered 100 bags, received 85 bags.',
  },
  ALLOCATION: {
    title: 'Stock Shortage Allocation',
    when: 'Triggers when available stock is not enough to cover all confirmed orders and needs priority allocation.',
    example: 'Example: 400 kg in stock for 550 kg total orders.',
  },
  YIELD_VARIANCE: {
    title: 'Factory Batch Output Difference',
    when: 'Triggers when finished production output differs from the standard recipe expectation.',
    example: 'Example: Expected 500 kg output, actual output 465 kg.',
  },
  WASTAGE_WRITEOFF: {
    title: 'High Production Wastage or Spoilage',
    when: 'Triggers when reported batch wastage exceeds the normal allowance and needs manager review.',
    example: 'Example: More than 5% raw material spilled or spoiled.',
  },
  STOCK_VARIANCE: {
    title: 'Physical Stock Count Mismatch',
    when: 'Triggers when a warehouse stock count does not match the system balance.',
    example: 'Example: System shows 200 bags, physical count finds 188 bags.',
  },
  CREDIT_REBATE_WRITEOFF: {
    title: 'Customer Credit Note or Write-Off',
    when: 'Triggers when staff request a discount, return credit, or bad-debt write-off on a customer account.',
    example: 'Example: ₹3,500 rebate for damaged crates.',
  },
  CASH_HANDOVER_VARIANCE: {
    title: 'Cash Handover Mismatch',
    when: 'Triggers when cash handed over by a driver or collector does not match receipts recorded in the app.',
    example: 'Example: App recorded ₹18,500 collected, ₹17,300 handed in.',
  },
};

export type BusinessRuleControlType = 'boolean' | 'percent' | 'decimal_percent' | 'currency' | 'number' | 'select' | 'text';

export interface BusinessRuleMeta {
  group:
    | 'Pricing & Margins'
    | 'Customer Credit'
    | 'Orders & Delivery'
    | 'Purchasing'
    | 'Factory & Stock'
    | 'Finance & Accounts'
    | 'Alerts & Display';
  label: string;
  description: string;
  control: BusinessRuleControlType;
  unit?: string;
  options?: Array<{ value: string; label: string }>;
}

export const INTERNAL_RULE_KEYS = new Set(['COMPANY_PROFILE', 'ROLLOUT_CONFIG']);

export const BUSINESS_RULE_META: Record<string, BusinessRuleMeta> = {
  min_margin_pct_default: {
    group: 'Pricing & Margins',
    label: 'Minimum Profit Margin',
    description: 'Lowest profit percentage allowed when the system calculates daily minimum selling prices.',
    control: 'decimal_percent',
    unit: '%',
  },
  customer_price_variance_pct: {
    group: 'Pricing & Margins',
    label: 'Price Change Warning Threshold',
    description: 'Warn staff if a new order price differs from what this customer paid last time by more than this percentage.',
    control: 'percent',
    unit: '%',
  },
  standing_customer_prices_enabled: {
    group: 'Pricing & Margins',
    label: 'Allow Special Contract Rates',
    description: 'Allow pre-agreed customer price lists even when they are lower than today’s general floor price.',
    control: 'boolean',
  },
  default_credit_limit_inr: {
    group: 'Customer Credit',
    label: 'Starting Credit Limit for New Customers',
    description: 'Default maximum unpaid balance allowed when adding a new customer.',
    control: 'currency',
    unit: '₹',
  },
  default_max_overdue_days: {
    group: 'Customer Credit',
    label: 'Overdue Days Before Credit Hold',
    description: 'Automatically flag new orders for approval if a customer has unpaid bills older than this many days.',
    control: 'number',
    unit: 'days',
  },
  ar_aging_buckets: {
    group: 'Customer Credit',
    label: 'Payment Aging Ranges (Days)',
    description: 'Day brackets used to group unpaid customer bills in collection reports (for example: 0-7,8-15,16-30,30+).',
    control: 'text',
  },
  collection_worklist_time: {
    group: 'Customer Credit',
    label: 'Daily Collection List Time',
    description: 'Time each morning (IST) when the daily list of customers to call or visit is prepared.',
    control: 'text',
    unit: 'IST',
  },
  quote_validity_hours: {
    group: 'Orders & Delivery',
    label: 'How Long Quotes Stay Valid',
    description: 'Number of hours a customer price quote stays valid before expiring.',
    control: 'number',
    unit: 'hours',
  },
  dispatch_buffer_hours: {
    group: 'Orders & Delivery',
    label: 'Packing Lead Time Before Delivery',
    description: 'How many hours before the delivery slot goods must be packed and ready at the site.',
    control: 'number',
    unit: 'hours',
  },
  trip_close_deadline: {
    group: 'Orders & Delivery',
    label: 'Daily Trip Closing Cut-Off Time',
    description: 'Expected evening time (IST) by which all delivery trips should be completed and closed.',
    control: 'text',
    unit: 'IST',
  },
  intersite_order_fulfillment: {
    group: 'Orders & Delivery',
    label: 'Multi-Site Order Fulfillment Mode',
    description: 'Choose whether one sales order ships from a single fulfillment site or can split across multiple sites.',
    control: 'select',
    options: [
      { value: 'SINGLE_SITE_MVP', label: 'One Fulfillment Site per Order (Standard)' },
      { value: 'HUB_AND_SPOKE', label: 'Split Across Hub & Spoke Sites' },
    ],
  },
  epod_otp_required: {
    group: 'Orders & Delivery',
    label: 'Require Customer OTP at Delivery',
    description: 'Ask the customer for a one-time code on delivery (when off, driver collects signature/photo only).',
    control: 'boolean',
  },
  owner_escalation_value_inr: {
    group: 'Orders & Delivery',
    label: 'Delivery Dispute Amount Requiring Owner Review',
    description: 'Delivery mismatches or disputes at or above this amount go straight to the business owner.',
    control: 'currency',
    unit: '₹',
  },
  escalation_wait_minutes: {
    group: 'Orders & Delivery',
    label: 'Wait Time Before Escalating Unanswered Requests',
    description: 'If an approval request is not answered within these minutes, send a reminder to the owner.',
    control: 'number',
    unit: 'minutes',
  },
  multisite_coordinator_enabled: {
    group: 'Orders & Delivery',
    label: 'Allow Coordinators to Access Multiple Sites',
    description: 'Let operations coordinators view and manage more than one factory or warehouse.',
    control: 'boolean',
  },
  supplier_price_variance_pct: {
    group: 'Purchasing',
    label: 'Supplier Price Increase Limit',
    description: 'If a supplier’s rate jumps by more than this percentage, lock the purchase order for owner approval.',
    control: 'percent',
    unit: '%',
  },
  supplier_shortfall_exception_pct: {
    group: 'Purchasing',
    label: 'Short Delivery Alert Threshold',
    description: 'Raise an alert if a supplier delivers less than ordered by this percentage (0 = alert on any shortfall).',
    control: 'percent',
    unit: '%',
  },
  supplier_price_spike_baseline: {
    group: 'Purchasing',
    label: 'How Usual Supplier Price Is Checked',
    description: 'Reference price used to detect sudden supplier price increases.',
    control: 'select',
    options: [
      { value: 'SAME_SUPPLIER_FIRST', label: 'Compare against same supplier’s last bill first' },
      { value: 'ITEM_LAST_COST', label: 'Compare against item’s overall last purchase cost' },
    ],
  },
  backup_supplier_tolerance_pct: {
    group: 'Purchasing',
    label: 'Backup Supplier Price Allowance',
    description: 'How much costlier (%) a backup supplier can be before flagging when primary supplier is short.',
    control: 'percent',
    unit: '%',
  },
  landed_cost_freight_allocation: {
    group: 'Purchasing',
    label: 'Freight Cost in Product Costing',
    description: 'Whether transport charges are added into unit product cost automatically.',
    control: 'select',
    options: [
      { value: 'NONE_MVP', label: 'Use Purchase Price Only (Simple)' },
      { value: 'BY_WEIGHT', label: 'Include Freight by Weight' },
      { value: 'BY_VALUE', label: 'Include Freight by Value' },
    ],
  },
  supplier_bill_auto_approve_cap_inr: {
    group: 'Purchasing',
    label: 'Auto-Approve Matched Supplier Bills Up To',
    description: 'Bills matching both the purchase order and receiving count under this amount are approved automatically.',
    control: 'currency',
    unit: '₹',
  },
  yield_variance_tolerance_pct: {
    group: 'Factory & Stock',
    label: 'Allowed Production Output Difference',
    description: 'Flag a batch for review if finished output differs from the recipe expectation by more than ±%.',
    control: 'percent',
    unit: '±%',
  },
  wastage_writeoff_owner_approval_pct: {
    group: 'Factory & Stock',
    label: 'Wastage Limit Requiring Owner Approval',
    description: 'Wastage above this percentage of standard recipe usage requires owner sign-off.',
    control: 'percent',
    unit: '%',
  },
  yield_variance_basis: {
    group: 'Factory & Stock',
    label: 'How Production Yield Is Measured',
    description: 'Baseline used to compare finished batch weight against ingredients used.',
    control: 'select',
    options: [
      { value: 'ISSUED_RAW_MATERIAL', label: 'Against Actual Raw Materials Issued' },
      { value: 'PLANNED_BOM', label: 'Against Standard Planned Recipe' },
    ],
  },
  production_mode: {
    group: 'Factory & Stock',
    label: 'Production Planning Style',
    description: 'Controls whether batches are mostly made against confirmed orders or for stock replenishment.',
    control: 'select',
    options: [
      { value: 'MAKE_TO_ORDER_PRIMARY', label: 'Make to Order First (+ Minimum Stock Top-Up)' },
      { value: 'MAKE_TO_STOCK', label: 'Make to Stock First' },
    ],
  },
  eway_bill_threshold_inr: {
    group: 'Finance & Accounts',
    label: 'Invoice Value Requiring E-Way Bill',
    description: 'Minimum consignment amount (₹) at which an E-Way Bill number is required before dispatch.',
    control: 'currency',
    unit: '₹',
  },
  einvoicing_enabled: {
    group: 'Finance & Accounts',
    label: 'Government GST E-Invoicing (IRN)',
    description: 'Turn on only if your business turnover requires live GST portal IRN generation on tax invoices.',
    control: 'boolean',
  },
  custody_wallet_scope: {
    group: 'Finance & Accounts',
    label: 'Driver & Collector Handover Tracking',
    description: 'Which payment types must be physically counted and handed over at end of shift.',
    control: 'select',
    options: [
      { value: 'CASH_AND_CHEQUE', label: 'Cash & Cheques Only (UPI goes straight to bank)' },
      { value: 'CASH_ONLY', label: 'Cash Only' },
    ],
  },
  handover_cashier_role: {
    group: 'Finance & Accounts',
    label: 'Who Verifies Cash Handovers',
    description: 'Staff role authorized to count and confirm cash/cheques handed in by drivers and collectors.',
    control: 'select',
    options: [
      { value: 'OPS_COORD', label: 'Operations Coordinator' },
      { value: 'OWNER', label: 'Business Owner Only' },
    ],
  },
  invoice_allocation_policy: {
    group: 'Finance & Accounts',
    label: 'How Customer Payments Clear Bills',
    description: 'Order in which incoming customer payments are applied to unpaid invoices.',
    control: 'select',
    options: [
      { value: 'FIFO', label: 'Oldest Unpaid Invoice First' },
      { value: 'MANUAL', label: 'Select Specific Invoice Manually' },
    ],
  },
  accounting_bridge_target: {
    group: 'Finance & Accounts',
    label: 'Accounting Software Export Format',
    description: 'Format used when exporting invoices, receipts, and bills for your accountant.',
    control: 'select',
    options: [
      { value: 'TALLY_PRIME', label: 'TallyPrime Compatible' },
      { value: 'GENERIC_CSV', label: 'Standard Excel / CSV' },
    ],
  },
  todays_sales_definition: {
    group: 'Finance & Accounts',
    label: 'How “Today’s Sales” Is Counted',
    description: 'Chooses what counts toward Today’s Sales on the Owner Control Tower.',
    control: 'select',
    options: [
      { value: 'TAX_INVOICES_ISSUED', label: 'Tax Invoices Issued Today' },
      { value: 'ORDERS_CONFIRMED', label: 'Sales Orders Confirmed Today' },
    ],
  },
  otp_channel_default: {
    group: 'Alerts & Display',
    label: 'Login Verification Code Channel',
    description: 'Primary way one-time login codes are sent to field staff.',
    control: 'select',
    options: [
      { value: 'SMS', label: 'Text Message (SMS)' },
      { value: 'WHATSAPP', label: 'WhatsApp' },
    ],
  },
  whatsapp_bsp_adapter: {
    group: 'Alerts & Display',
    label: 'Customer Message Delivery Backup',
    description: 'If WhatsApp delivery is unavailable, choose whether to fall back to SMS automatically.',
    control: 'select',
    options: [
      { value: 'PLUGGABLE_SMS_FALLBACK', label: 'WhatsApp with Automatic SMS Backup' },
      { value: 'WHATSAPP_ONLY', label: 'WhatsApp Only' },
    ],
  },
  default_language: {
    group: 'Alerts & Display',
    label: 'Default App Language',
    description: 'Starting language for newly created staff accounts on office and mobile screens.',
    control: 'select',
    options: [
      { value: 'en', label: 'English' },
      { value: 'mr', label: 'Marathi (मराठी)' },
    ],
  },
  dashboard_refresh_interval_seconds: {
    group: 'Alerts & Display',
    label: 'Dashboard Auto-Refresh Time',
    description: 'How often the home dashboard refreshes numbers automatically.',
    control: 'number',
    unit: 'seconds',
  },
};

export function formatRuleKeyFallback(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  DELETE: 'Removed',
  REVERSE: 'Reversed',
  SIGN_OFF: 'Signed Off',
  REVOKE: 'Signed Out Devices',
};

const AUDIT_FIELD_LABELS: Record<string, string> = {
  creditLimit: 'Credit Limit',
  credit_limit: 'Credit Limit',
  creditDays: 'Credit Days',
  credit_days: 'Credit Days',
  status: 'Status',
  order_status: 'Order Status',
  is_active: 'Active Status',
  isActive: 'Active Status',
  is_fulfillment_site: 'Fulfillment Site',
  isFulfillmentSite: 'Fulfillment Site',
  name: 'Name',
  full_name: 'Full Name',
  fullName: 'Full Name',
  role: 'Role',
  site_type: 'Site Type',
  siteType: 'Site Type',
  address: 'Address',
  gstin: 'GST Number',
  fulfillment_site_id: 'Fulfillment Site',
  default_site_id: 'Default Fulfillment Site',
  delegate_value_cap_inr: 'Assistant Approval Limit',
  escalation_wait_minutes: 'Escalation Wait Time',
  value_json: 'Setting Value',
};

function formatAuditValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return 'None';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return val.toLocaleString('en-IN');
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(formatAuditValue).join(', ') || 'None';
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export function formatAuditChanges(
  beforeObj: Record<string, any> | null | undefined,
  afterObj: Record<string, any> | null | undefined,
): Array<{ field: string; before: string; after: string }> {
  const before = beforeObj && typeof beforeObj === 'object' ? beforeObj : {};
  const after = afterObj && typeof afterObj === 'object' ? afterObj : {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({
      field:
        AUDIT_FIELD_LABELS[k] ||
        k
          .replace(/([A-Z])/g, ' $1')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim(),
      before: formatAuditValue(before[k]),
      after: formatAuditValue(after[k]),
    }));
}
