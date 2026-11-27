/**
 * Client-side Administration, Settings & Audit Seed Data (Phase F11)
 */

import type { ApprovalPolicyConfig, AuditLogEntry, UserRole } from '@neo/shared';

export interface AdminUserRecord {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  siteIds: string[];
  language: 'en' | 'mr';
  status: 'ACTIVE' | 'DISABLED';
  lastLogin: string;
  devicesCount: number;
  hasPin?: boolean;
}

export interface SiteRecord {
  id: string;
  code: string;
  name: string;
  siteType: 'FACTORY' | 'DEPOT' | 'WAREHOUSE';
  gstin: string;
  address: string;
  active: boolean;
  locations: Array<{ name: string; type: 'DRY_STORE' | 'COLD_STORE' | 'DISPATCH_BAY' }>;
}

export interface BusinessRuleSetting {
  id: string;
  group: 'Pricing' | 'Credit' | 'Procurement' | 'Production' | 'Inventory' | 'Finance' | 'Dashboard';
  question: string;
  scope: 'GLOBAL' | 'SITE' | 'ITEM_CATEGORY';
  scopeTarget: string;
  value: string;
  defaultValue: string;
  lastChangedBy: string;
  lastChangedAt: string;
}

export const INITIAL_ADMIN_USERS: AdminUserRecord[] = [
  { id: 'u-1', name: 'Anil Deshmukh', phone: '+91 98220 10001', role: 'OWNER', siteIds: ['site-baramati', 'site-pune'], language: 'en', status: 'ACTIVE', lastLogin: 'Today 17:02', devicesCount: 2 },
  { id: 'u-2', name: 'Priya Kulkarni', phone: '+91 98220 10002', role: 'OPS_COORD', siteIds: ['site-baramati', 'site-pune'], language: 'en', status: 'ACTIVE', lastLogin: 'Today 16:45', devicesCount: 1 },
  { id: 'u-3', name: 'Suresh Patil', phone: '+91 98220 10003', role: 'PROD_MGR', siteIds: ['site-baramati'], language: 'mr', status: 'ACTIVE', lastLogin: 'Today 15:20', devicesCount: 1 },
  { id: 'u-4', name: 'Raju Pawar', phone: '+91 98220 10004', role: 'DRIVER', siteIds: ['site-baramati'], language: 'mr', status: 'ACTIVE', lastLogin: 'Today 16:10', devicesCount: 1 },
  { id: 'u-5', name: 'Mahesh Desai', phone: '+91 98220 10005', role: 'COLLECTOR', siteIds: ['site-pune'], language: 'mr', status: 'ACTIVE', lastLogin: 'Today 14:55', devicesCount: 1 },
];

export const ROLE_MATRIX: Array<{ role: UserRole; summary: string; permissions: string[]; maskedFields: string[] }> = [
  { role: 'OWNER', summary: 'Full control across all sites, approvals, analytics, finance sign-off & admin.', permissions: ['dashboard.read_pulse', 'exception.resolve', 'analytics.read_customers', 'admin.manage', 'eod.signoff', 'audit.view'], maskedFields: [] },
  { role: 'OPS_COORD', summary: 'Can manage orders, trips, handovers, invoices, and operational lists across assigned sites.', permissions: ['order.view', 'order.create', 'fleet.view', 'finance.view', 'receipt.verify_handover'], maskedFields: ['admin.*'] },
  { role: 'PROD_MGR', summary: 'Runs recipes, work orders, wastage & attendance on factory floor; prices/margins hidden.', permissions: ['wo.read', 'wo.start', 'requisition.create'], maskedFields: ['cost', 'price', 'margin', 'customerLedger'] },
  { role: 'STOREKEEPER', summary: 'Records blind GRNs, stock transfers & physical counts; PO rates hidden (BR-05).', permissions: ['inventory.read', 'inventory.transfer', 'grn.record_blind'], maskedFields: ['ordered_qty', 'unit_price', 'margin'] },
  { role: 'DRIVER', summary: 'Executes assigned delivery trips, ePOD & COD capture via Driver PWA.', permissions: ['fleet.read', 'epod.capture'], maskedFields: ['margin', 'admin.*'] },
  { role: 'COLLECTOR', summary: 'Logs customer visits, collections & handovers via Collector PWA.', permissions: ['collection.create', 'ptp.create'], maskedFields: ['margin', 'admin.*'] },
];

export const INITIAL_SITES: SiteRecord[] = [
  {
    id: 'site-baramati',
    code: 'BRM-01',
    name: 'Baramati Plant',
    siteType: 'FACTORY',
    gstin: '27AAACN1234F1Z5',
    address: 'Plot E-14, MIDC Baramati, Pune 413133',
    active: true,
    locations: [
      { name: 'Dry RM Silo & Shed', type: 'DRY_STORE' },
      { name: 'Finished Goods Bay', type: 'DISPATCH_BAY' },
    ],
  },
  {
    id: 'site-pune',
    code: 'PUN-02',
    name: 'Pune Distribution Hub',
    siteType: 'DEPOT',
    gstin: '27AAACN1234F2Z4',
    address: 'Gate 82, Market Yard Annexe, Pune 411037',
    active: true,
    locations: [
      { name: 'Cold Supplement Store', type: 'COLD_STORE' },
      { name: 'City Dispatch Dock', type: 'DISPATCH_BAY' },
    ],
  },
];

export const INITIAL_BUSINESS_RULES: BusinessRuleSetting[] = [
  { id: 'br-1', group: 'Pricing', question: 'What is the minimum profit margin you accept? (%)', scope: 'ITEM_CATEGORY', scopeTarget: 'Supplements', value: '10', defaultValue: '10', lastChangedBy: 'Anil Deshmukh', lastChangedAt: '2026-11-10 09:30' },
  { id: 'br-2', group: 'Procurement', question: 'Backup supplier tolerance above primary rate? (%)', scope: 'GLOBAL', scopeTarget: 'All', value: '2', defaultValue: '2', lastChangedBy: 'System Seed', lastChangedAt: '2026-10-01 00:00' },
  { id: 'br-3', group: 'Production', question: 'Factory batch yield variance tolerance? (±%)', scope: 'GLOBAL', scopeTarget: 'All', value: '3', defaultValue: '3', lastChangedBy: 'System Seed', lastChangedAt: '2026-10-01 00:00' },
  { id: 'br-4', group: 'Finance', question: 'Minimum invoice value requiring E-Way Bill? (₹)', scope: 'GLOBAL', scopeTarget: 'All', value: '50000', defaultValue: '50000', lastChangedBy: 'System Seed', lastChangedAt: '2026-10-01 00:00' },
  { id: 'br-5', group: 'Dashboard', question: 'Control Tower auto-refresh interval? (seconds)', scope: 'GLOBAL', scopeTarget: 'All', value: '30', defaultValue: '30', lastChangedBy: 'System Seed', lastChangedAt: '2026-10-01 00:00' },
];

export const INITIAL_APPROVAL_POLICIES: ApprovalPolicyConfig[] = [
  { id: 'ap-1', exceptionType: 'PRICE_OVERRIDE', primaryApproverRole: 'OWNER', delegateUser: 'Priya Kulkarni', delegateCapInr: 5000, escalationWaitMinutes: 60, secondEscalationUser: 'Anil Deshmukh', requireApprover: true, active: true },
  { id: 'ap-2', exceptionType: 'CREDIT_BREACH', primaryApproverRole: 'OWNER', delegateUser: 'Priya Kulkarni', delegateCapInr: 10000, escalationWaitMinutes: 60, secondEscalationUser: 'Anil Deshmukh', requireApprover: true, active: true },
  { id: 'ap-3', exceptionType: 'CASH_HANDOVER_VARIANCE', primaryApproverRole: 'OWNER', delegateUser: 'None', delegateCapInr: 0, escalationWaitMinutes: 30, secondEscalationUser: 'Anil Deshmukh', requireApprover: true, active: true },
];

export const MESSAGE_TEMPLATES = [
  { id: 'tpl-1', code: 'ORDER_CONFIRM_WA', channel: 'WHATSAPP', preview: 'Namaste {{customer}}, Order {{orderNo}} for ₹{{amount}} is confirmed.', providerId: 'WA_TMPL_901' },
  { id: 'tpl-2', code: 'OTP_LOGIN_SMS', channel: 'SMS', preview: 'Your NeoBus login OTP is {{otp}}. Valid for 5 minutes.', providerId: 'DLT_1107169' },
  { id: 'tpl-3', code: 'PAYMENT_REMINDER_WA', channel: 'WHATSAPP', preview: 'Gentle reminder: Invoice {{invoiceNo}} balance ₹{{balance}} is due.', providerId: 'WA_TMPL_904' },
];

export const NUMBER_SERIES = [
  { docType: 'Sales Order', prefix: 'SO-2611-', nextNumber: '0053', sample: 'SO-2611-0053' },
  { docType: 'Tax Invoice', prefix: 'INV-2026-', nextNumber: '0106', sample: 'INV-2026-0106' },
  { docType: 'Purchase Order', prefix: 'PO-2026-', nextNumber: '0415', sample: 'PO-2026-0415' },
  { docType: 'GRN', prefix: 'GRN-2026-', nextNumber: '0220', sample: 'GRN-2026-0220' },
  { docType: 'Delivery Trip', prefix: 'TRP-2026-', nextNumber: '504', sample: 'TRP-2026-504' },
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-1',
    timestampIst: '2026-11-13 10:32 IST',
    actorName: 'Priya Kulkarni',
    actorRole: 'OPS_COORD',
    module: 'Sales',
    action: 'UPDATE',
    entityType: 'Customer',
    entityNo: 'SO-2611-0042',
    summary: 'Priya changed credit limit of Sahyadri Dairy from ₹1,00,000 to ₹1,50,000',
    beforeJson: { creditLimit: 100000 },
    afterJson: { creditLimit: 150000 },
    ipAddress: '192.168.1.24',
  },
  {
    id: 'aud-2',
    timestampIst: '2026-11-13 15:40 IST',
    actorName: 'Anil Deshmukh',
    actorRole: 'OWNER',
    module: 'Control',
    action: 'APPROVE',
    entityType: 'Exception',
    entityNo: 'WO-2026-302',
    summary: 'Anil Deshmukh approved Factory Yield Variance (−4.0%) for WO-2026-302',
    beforeJson: { status: 'PENDING' },
    afterJson: { status: 'APPROVED' },
    ipAddress: '192.168.1.10',
  },
];

