/**
 * Seed script — populates the M0 foundation tables with demo data.
 *
 * Run after migrations:
 *   node dist/scripts/seed.js
 *
 * Idempotent: every insert uses ON CONFLICT DO NOTHING or an
 * existence check, so re-running the script is safe.
 *
 * The PINs below are demo credentials hashed with bcrypt (cost 10).
 * They are NOT real secrets — replace them before any real deployment.
 */

import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { Knex } from 'knex';
import { createKnex } from '../shared/database/knex-instance.js';

dotenv.config();

// ── Demo sites ────────────────────────────────────────────────────────────────
const SITES = [
  {
    name: 'NeoCore Factory — Mumbai',
    site_type: 'FACTORY' as const,
    address: 'Plot 42, MIDC, Andheri East, Mumbai 400059',
  },
  {
    name: 'Central Warehouse — Navi Mumbai',
    site_type: 'WAREHOUSE' as const,
    address: 'Sector 17, Navi Mumbai, Maharashtra 400703',
  },
  {
    name: 'NeoCore Office — Corporate',
    site_type: 'OFFICE' as const,
    address: 'Bandra Kurla Complex, Mumbai 400051',
  },
];

// ── Demo users (PIN is the bcrypt input; password == PIN for simplicity) ──────
// These are demo credentials only. Never commit real PINs.
const USERS = [
  {
    phone: '+919876543210',
    full_name: 'Ravi Kumar',
    role: 'OWNER',
    assigned_site_index: 0, // factory
    pin: '1234',
    is_active: true,
  },
  {
    phone: '+919876543211',
    full_name: 'Anita Desai',
    role: 'OPS_COORD',
    assigned_site_index: 0,
    pin: '2233',
    is_active: true,
  },
  {
    phone: '+919876543212',
    full_name: 'Suresh Patel',
    role: 'PROD_MGR',
    assigned_site_index: 0,
    pin: '3344',
    is_active: true,
  },
  {
    phone: '+919876543213',
    full_name: 'Mehul Shah',
    role: 'DRIVER',
    assigned_site_index: 0,
    pin: '4455',
    is_active: true,
  },
  {
    phone: '+919876543214',
    full_name: 'Priya Nair',
    role: 'COLLECTOR',
    assigned_site_index: 0,
    pin: '5566',
    is_active: true,
  },
  {
    phone: '+919876543215',
    full_name: 'Arjun Rao',
    role: 'STOREKEEPER',
    assigned_site_index: 1, // warehouse
    pin: '6677',
    is_active: true,
  },
];

// OPS_COORD has access to factory + warehouse; OWNER has access to all 3 sites
const SITE_ACCESS: { phone: string; site_index: number }[] = [
  { phone: '+919876543210', site_index: 0 },
  { phone: '+919876543210', site_index: 1 },
  { phone: '+919876543210', site_index: 2 },
  { phone: '+919876543211', site_index: 0 },
  { phone: '+919876543211', site_index: 1 },
];

async function upsertSite(
  knex: Knex,
  site: (typeof SITES)[number],
): Promise<string> {
  const existing = await knex('sites').where('name', site.name).first();
  if (existing) return String(existing.id);

  const [row] = await knex('sites')
    .insert({
      name: site.name,
      site_type: site.site_type,
      address: site.address,
      is_active: true,
    })
    .returning('id');
  return String(row.id);
}

async function upsertUser(
  knex: Knex,
  user: (typeof USERS)[number],
  siteId: string,
): Promise<string> {
  const pinHash = await bcrypt.hash(user.pin, 10);
  const existing = await knex('users').where('phone', user.phone).first();
  if (existing) {
    await knex('users').where('id', existing.id).update({
      full_name: user.full_name,
      role: user.role,
      assigned_site_id: siteId,
      pin_hash: pinHash,
      password_hash: null,
      is_active: user.is_active,
    });
    return String(existing.id);
  }

  const [row] = await knex('users')
    .insert({
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      assigned_site_id: siteId,
      pin_hash: pinHash,
      is_active: user.is_active,
    })
    .returning('id');
  return String(row.id);
}

async function upsertSiteAccess(
  knex: Knex,
  userId: string,
  siteId: string,
): Promise<void> {
  await knex('user_site_access')
    .insert({ user_id: userId, site_id: siteId })
    .onConflict(['user_id', 'site_id'])
    .ignore();
}

async function upsertApprovalPolicies(knex: Knex): Promise<void> {
  const policies = [
    { exception_type: 'PRICE_OVERRIDE', primary_approver_role: 'OWNER', can_delegate: true, escalation_wait_minutes: 60 },
    { exception_type: 'CREDIT_BREACH', primary_approver_role: 'OWNER', can_delegate: true, escalation_wait_minutes: 60 },
    { exception_type: 'SUPPLIER_PRICE_SPIKE', primary_approver_role: 'OWNER', can_delegate: false, escalation_wait_minutes: 60 },
    { exception_type: 'SUPPLIER_SHORTFALL', primary_approver_role: 'OWNER', can_delegate: true, escalation_wait_minutes: 60 },
    { exception_type: 'ALLOCATION', primary_approver_role: 'OWNER', can_delegate: true, escalation_wait_minutes: 60 },
    { exception_type: 'YIELD_VARIANCE', primary_approver_role: 'OWNER', can_delegate: false, escalation_wait_minutes: 60 },
    { exception_type: 'WASTAGE_WRITEOFF', primary_approver_role: 'OWNER', can_delegate: false, escalation_wait_minutes: 60 },
    { exception_type: 'STOCK_VARIANCE', primary_approver_role: 'OWNER', can_delegate: true, escalation_wait_minutes: 60 },
    { exception_type: 'CREDIT_REBATE_WRITEOFF', primary_approver_role: 'OWNER', can_delegate: false, escalation_wait_minutes: 60 },
  ];
  await knex('approval_policies').insert(policies).onConflict('exception_type').ignore();
}

async function seedCustomersAndItems(
  knex: Knex,
  siteIds: string[],
  ownerId: string,
  opsId: string,
): Promise<void> {
  const customersData = [
    {
      customer_code: 'CUST-001',
      business_name: 'Hotel Sahyadri Grand',
      contact_person: 'Rajesh Patil',
      phone: '+919822011001',
      billing_address: 'MG Road, Pune 411001',
      credit_limit: 100000.0,
      current_ar_balance: 80000.0,
      state_code: '27',
      default_site_id: siteIds[0],
      gstin: '27AABCH1234F1Z5',
      price_tier: 'TIER_A',
      preferred_delivery_window: '10-12',
    },
    {
      customer_code: 'CUST-002',
      business_name: 'Annapurna Catering Services',
      contact_person: 'Sunita Deshmukh',
      phone: '+919822011002',
      billing_address: 'Baner Road, Pune 411045',
      credit_limit: 150000.0,
      current_ar_balance: 45000.0,
      state_code: '27',
      default_site_id: siteIds[0],
      gstin: '27AABCA5678G1Z2',
      price_tier: 'TIER_A',
      preferred_delivery_window: '04-08',
    },
    {
      customer_code: 'CUST-003',
      business_name: 'FreshMart Superstore Vashi',
      contact_person: 'Vikram Joshi',
      phone: '+919822011003',
      billing_address: 'Sector 17, Vashi, Navi Mumbai 400703',
      credit_limit: 250000.0,
      current_ar_balance: 110000.0,
      state_code: '27',
      default_site_id: siteIds[1] ?? siteIds[0],
      gstin: '27AABCF9012H1Z9',
      price_tier: 'VIP',
      preferred_delivery_window: '13-16',
    },
    {
      customer_code: 'CUST-004',
      business_name: 'Deccan Spice Kitchens',
      contact_person: 'Prakash Kulkarni',
      phone: '+919822011004',
      billing_address: 'FC Road, Pune 411004',
      credit_limit: 75000.0,
      current_ar_balance: 72000.0,
      state_code: '27',
      default_site_id: siteIds[0],
      gstin: '27AABCD3456J1Z1',
      price_tier: 'STANDARD',
      preferred_delivery_window: '10-12',
    },
  ];

  const customerIds: Record<string, string> = {};
  for (const c of customersData) {
    const existing = await knex('customers').where('customer_code', c.customer_code).first();
    if (existing) {
      customerIds[c.customer_code] = String(existing.id);
    } else {
      const [inserted] = await knex('customers')
        .insert({ ...c, is_active: true, created_by: ownerId, updated_by: ownerId })
        .returning('id');
      customerIds[c.customer_code] = String(inserted.id);
      console.log(`[seed] customer: ${c.customer_code} -> ${inserted.id}`);
    }
  }

  const itemsData = [
    {
      sku_code: 'FG-PNR-200',
      name: 'Fresh Malai Paneer 200g',
      item_category: 'PROCESSED_FG',
      primary_uom: 'KG',
      tax_rate_pct: 0.05,
      hsn_code: '04061000',
      min_margin_pct: 0.16,
      tax_treatment: 'TAXABLE',
      landedCost: 75.0,
      floorPrice: 90.0,
      targetPrice: 95.0,
    },
    {
      sku_code: 'FG-GHEE-1L',
      name: 'Pure Cow Ghee 1L Tin',
      item_category: 'PROCESSED_FG',
      primary_uom: 'LITER',
      tax_rate_pct: 0.12,
      hsn_code: '04059020',
      min_margin_pct: 0.12,
      tax_treatment: 'TAXABLE',
      landedCost: 480.0,
      floorPrice: 545.5,
      targetPrice: 575.0,
    },
    {
      sku_code: 'TRD-BUT-500',
      name: 'Pasteurized Table Butter 500g',
      item_category: 'TRADED_GOOD',
      primary_uom: 'KG',
      tax_rate_pct: 0.12,
      hsn_code: '04051000',
      min_margin_pct: 0.12,
      tax_treatment: 'TAXABLE',
      landedCost: 360.0,
      floorPrice: 410.0,
      targetPrice: 435.0,
    },
    {
      sku_code: 'FG-CURD-5K',
      name: 'Probiotic Dahi Bucket 5kg',
      item_category: 'PROCESSED_FG',
      primary_uom: 'KG',
      tax_rate_pct: 0.05,
      hsn_code: '04031000',
      min_margin_pct: 0.15,
      tax_treatment: 'TAXABLE',
      landedCost: 290.0,
      floorPrice: 341.5,
      targetPrice: 365.0,
    },
    {
      sku_code: 'RM-MILK-01',
      name: 'Raw Buffalo Milk (6.5% Fat)',
      item_category: 'RAW_MATERIAL',
      primary_uom: 'LITER',
      tax_rate_pct: 0.0,
      hsn_code: '04012000',
      min_margin_pct: 0.1,
      tax_treatment: 'EXEMPT',
      landedCost: 52.0,
      floorPrice: 58.0,
      targetPrice: 62.0,
    },
    {
      sku_code: 'PKG-BOX-10',
      name: '5-Ply Corrugated Master Carton',
      item_category: 'PACKAGING',
      primary_uom: 'CARTON',
      tax_rate_pct: 0.18,
      hsn_code: '48191010',
      min_margin_pct: 0.1,
      tax_treatment: 'TAXABLE',
      landedCost: 38.0,
      floorPrice: 42.5,
      targetPrice: 46.0,
    },
  ];

  const today = new Date().toISOString().split('T')[0];
  const itemIds: Record<string, string> = {};

  for (const item of itemsData) {
    const { landedCost, floorPrice, targetPrice, ...itemCols } = item;
    const existing = await knex('items').where('sku_code', item.sku_code).first();
    let itemId: string;
    if (existing) {
      itemId = String(existing.id);
    } else {
      const [inserted] = await knex('items')
        .insert({ ...itemCols, is_active: true, created_by: ownerId, updated_by: ownerId })
        .returning('id');
      itemId = String(inserted.id);
      console.log(`[seed] item: ${item.sku_code} -> ${itemId}`);
    }
    itemIds[item.sku_code] = itemId;

    await knex('daily_price_lists')
      .insert({
        item_id: itemId,
        effective_date: today,
        latest_landed_cost: landedCost,
        floor_price: floorPrice,
        target_price: targetPrice,
        min_margin_pct_used: item.min_margin_pct,
        source: 'AUTO',
        published_at: new Date(),
        updated_by: ownerId,
      })
      .onConflict(['item_id', 'effective_date'])
      .merge({
        latest_landed_cost: landedCost,
        floor_price: floorPrice,
        target_price: targetPrice,
        min_margin_pct_used: item.min_margin_pct,
        source: 'AUTO',
        published_at: new Date(),
        updated_by: ownerId,
        updated_at: new Date(),
      });
  }

  // Seed initial sales orders idempotently
  const seedOrders = [
    {
      order_no: 'SO-2611-0001',
      customerCode: 'CUST-001',
      siteId: siteIds[0],
      order_status: 'CONFIRMED',
      delivery_time_window: '10-12',
      skuCode: 'FG-PNR-200',
      qty: 500,
      unitPrice: 92.0,
      floorPrice: 90.0,
      targetPrice: 95.0,
      landedCost: 75.0,
    },
    {
      order_no: 'SO-2611-0002',
      customerCode: 'CUST-002',
      siteId: siteIds[0],
      order_status: 'PENDING_APPROVAL',
      delivery_time_window: '04-08',
      skuCode: 'FG-GHEE-1L',
      qty: 200,
      unitPrice: 540.0,
      floorPrice: 545.5,
      targetPrice: 575.0,
      landedCost: 480.0,
    },
    {
      order_no: 'SO-2611-0003',
      customerCode: 'CUST-003',
      siteId: siteIds[1] ?? siteIds[0],
      order_status: 'READY',
      delivery_time_window: '13-16',
      skuCode: 'TRD-BUT-500',
      qty: 160,
      unitPrice: 427.5,
      floorPrice: 410.0,
      targetPrice: 435.0,
      landedCost: 360.0,
    },
  ];

  for (const so of seedOrders) {
    const existing = await knex('sales_orders').where('order_no', so.order_no).first();
    let orderId: string;
    let lineId: string | null = null;

    if (existing) {
      orderId = String(existing.id);
      const existingLine = await knex('sales_order_lines').where('order_id', orderId).first();
      lineId = existingLine ? String(existingLine.id) : null;
    } else {
      const lineTotal = Number((so.qty * so.unitPrice).toFixed(2));
      const marginPct = Number((((so.unitPrice - so.landedCost) / so.unitPrice) * 100).toFixed(2));
      const [orderRow] = await knex('sales_orders')
        .insert({
          order_no: so.order_no,
          customer_id: customerIds[so.customerCode],
          fulfillment_site_id: so.siteId,
          order_status: so.order_status,
          total_amount: lineTotal.toFixed(2),
          margin_pct: marginPct,
          created_by: opsId,
          approved_by: so.order_status === 'CONFIRMED' || so.order_status === 'READY' ? ownerId : null,
          confirmed_at: so.order_status !== 'PENDING_APPROVAL' ? new Date() : null,
          delivery_date: today,
          delivery_time_window: so.delivery_time_window,
          credit_flag: 'OK',
          payment_terms: 'CREDIT',
        })
        .returning('id');
      orderId = String(orderRow.id);

      const [lineRow] = await knex('sales_order_lines')
        .insert({
          order_id: orderId,
          item_id: itemIds[so.skuCode],
          ordered_qty: so.qty,
          quoted_unit_price: so.unitPrice.toFixed(2),
          floor_price_snapshot: so.floorPrice.toFixed(2),
          target_price_snapshot: so.targetPrice.toFixed(2),
          landed_cost_snapshot: so.landedCost.toFixed(2),
          margin_pct_snapshot: marginPct,
          line_total: lineTotal.toFixed(2),
        })
        .returning('id');
      lineId = String(lineRow.id);

      await knex('order_status_log').insert({
        order_id: orderId,
        from_status: 'DRAFT',
        to_status: so.order_status,
        by_user: opsId,
        reason: 'Seeded initial operational order',
      });

      console.log(`[seed] sales_order: ${so.order_no} -> ${orderId}`);
    }

    if (so.order_status === 'PENDING_APPROVAL' && lineId) {
      const existingEx = await knex('exception_approvals')
        .where({
          exception_type: 'PRICE_OVERRIDE',
          reference_table: 'sales_order_lines',
          reference_id: lineId,
        })
        .first();
      if (!existingEx) {
        const marginPct = Number((((so.unitPrice - so.landedCost) / so.unitPrice) * 100).toFixed(2));
        await knex('exception_approvals').insert({
          exception_type: 'PRICE_OVERRIDE',
          reference_table: 'sales_order_lines',
          reference_id: lineId,
          requested_by: opsId,
          site_id: so.siteId,
          context_payload_json: {
            title: `${so.order_no} Price Below Floor`,
            summary: `Coordinator quoted ₹${so.unitPrice} below daily floor ₹${so.floorPrice} for ${so.qty} units.`,
            impact: `Gross margin is ${marginPct}%`,
            facts: [
              { label: 'Order', value: so.order_no },
              { label: 'Requested Price', value: String(so.unitPrice) },
              { label: 'Floor Price', value: String(so.floorPrice) },
            ],
            actions: [
              { code: 'APPROVE', label: 'Approve Price' },
              { code: 'COUNTER', label: 'Counter Price' },
              { code: 'REJECT', label: 'Reject' },
            ],
          },
          status: 'PENDING',
          priority: 'HIGH',
          value_at_risk: ((so.floorPrice - so.unitPrice) * so.qty).toFixed(2),
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
        });
      }
    }
  }
}

async function upsertRolePermissions(knex: Knex): Promise<void> {
  const grants: Array<{ role: string; permission_code: string; scope: string }> = [
    // Exception Queue access for Owner & Ops Coordinator
    { role: 'OPS_COORD', permission_code: 'exception.read', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'exception.resolve', scope: 'SITE' },
    // Sales & Catalog operational permissions for OPS_COORD
    { role: 'OPS_COORD', permission_code: 'order.manage', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'customer.modify', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'collection.log', scope: 'SITE' },
    // Procurement & Inventory permissions for OPS_COORD
    { role: 'OPS_COORD', permission_code: 'supplier.create', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'supplier.update', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'supplier.rate.manage', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'po.confirm', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'po.issue', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'requisition.create', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'requisition.update', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'grn.create', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'grn.update', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'inventory.adjust', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'inventory.transfer', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'inventory.reserve', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'inventory.grn', scope: 'SITE' },
    // Production visibility for OPS_COORD
    { role: 'OPS_COORD', permission_code: 'production.bom.read', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'production.workorder.read', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'production.requisition.read', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'production.wastage.read', scope: 'SITE' },
    { role: 'OPS_COORD', permission_code: 'production.attendance.read', scope: 'SITE' },
    // PROD_MGR full production permissions
    { role: 'PROD_MGR', permission_code: 'production.bom.read', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.bom.create', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.bom.update', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.bom.activate', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.workorder.read', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.workorder.create', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.workorder.start', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.workorder.consume', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.workorder.output', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.workorder.complete', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.requisition.read', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.requisition.create', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.requisition.approve', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.wastage.read', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.wastage.create', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.attendance.read', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'production.attendance.create', scope: 'SITE' },
    { role: 'PROD_MGR', permission_code: 'item.view', scope: 'ALL' },
    // STOREKEEPER warehouse & GRN permissions
    { role: 'STOREKEEPER', permission_code: 'inventory.read', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'inventory.adjust', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'inventory.transfer', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'inventory.reserve', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'inventory.grn', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'grn.read', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'grn.create', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'grn.update', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'po.read', scope: 'SITE' },
    { role: 'STOREKEEPER', permission_code: 'supplier.read', scope: 'ALL' },
    { role: 'STOREKEEPER', permission_code: 'item.view', scope: 'ALL' },
    // DRIVER & COLLECTOR floor execution permissions
    { role: 'DRIVER', permission_code: 'fleet.read', scope: 'OWN' },
    { role: 'DRIVER', permission_code: 'fleet.read_own', scope: 'OWN' },
    { role: 'DRIVER', permission_code: 'fleet.deliver', scope: 'OWN' },
    { role: 'DRIVER', permission_code: 'collection.log', scope: 'SITE' },
    { role: 'DRIVER', permission_code: 'invoice.read', scope: 'SITE' },
    { role: 'COLLECTOR', permission_code: 'collection.log', scope: 'SITE' },
    { role: 'COLLECTOR', permission_code: 'finance.view', scope: 'SITE' },
    { role: 'COLLECTOR', permission_code: 'invoice.read', scope: 'SITE' },
    { role: 'COLLECTOR', permission_code: 'customer.view', scope: 'SITE' },
  ];

  await knex('role_permissions')
    .insert(grants)
    .onConflict(['role', 'permission_code'])
    .ignore();
}

function isoDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

async function seedOperationalData(
  knex: Knex,
  siteIds: string[],
  userIds: Record<string, string>,
): Promise<void> {
  const ownerId = userIds['+919876543210'];
  const opsId = userIds['+919876543211'];
  const prodId = userIds['+919876543212'] || ownerId;
  const driverId = userIds['+919876543213'] || ownerId;
  const collectorId = userIds['+919876543214'] || opsId;
  const storeId = userIds['+919876543215'] || opsId;
  const factorySiteId = siteIds[0];
  const warehouseSiteId = siteIds[1] ?? siteIds[0];
  const officeSiteId = siteIds[2] ?? siteIds[0];
  const today = isoDateOffset(0);

  // Set realistic min_stock_qty thresholds on seeded items so stock alerts work
  const minThresholds: Record<string, number> = {
    'FG-PNR-200': 250,
    'FG-GHEE-1L': 100,
    'TRD-BUT-500': 120,
    'FG-CURD-5K': 150,
    'RM-MILK-01': 500,
    'PKG-BOX-10': 200,
  };
  const itemRows = await knex('items').select('id', 'sku_code', 'primary_uom', 'tax_rate_pct');
  const itemsBySku: Record<string, any> = {};
  for (const row of itemRows) {
    itemsBySku[row.sku_code] = row;
    if (minThresholds[row.sku_code] !== undefined) {
      await knex('items')
        .where('id', row.id)
        .update({ min_stock_qty: minThresholds[row.sku_code] });
    }
  }

  const customerRows = await knex('customers').select('id', 'customer_code', 'business_name', 'phone', 'state_code');
  const custByCode: Record<string, any> = {};
  for (const c of customerRows) custByCode[c.customer_code] = c;

  const orderRows = await knex('sales_orders').select('id', 'order_no', 'customer_id', 'fulfillment_site_id', 'total_amount');
  const orderByNo: Record<string, any> = {};
  for (const o of orderRows) orderByNo[o.order_no] = o;

  const paneer = itemsBySku['FG-PNR-200'];
  const ghee = itemsBySku['FG-GHEE-1L'];
  const butter = itemsBySku['TRD-BUT-500'];
  const curd = itemsBySku['FG-CURD-5K'];
  const rawMilk = itemsBySku['RM-MILK-01'];
  const carton = itemsBySku['PKG-BOX-10'];

  const cust1 = custByCode['CUST-001'];
  const cust2 = custByCode['CUST-002'];
  const cust3 = custByCode['CUST-003'];
  const cust4 = custByCode['CUST-004'];

  // ── A. Ensure a DELIVERED_FULL sales order created today for mv_pulse_today ──
  const deliveredTodayNo = 'SO-2611-0004';
  if (!orderByNo[deliveredTodayNo] && cust4 && curd) {
    const lineTotal = 365.0 * 120;
    const [o4] = await knex('sales_orders')
      .insert({
        order_no: deliveredTodayNo,
        customer_id: cust4.id,
        fulfillment_site_id: factorySiteId,
        order_status: 'DELIVERED_FULL',
        total_amount: lineTotal.toFixed(2),
        margin_pct: 20.55,
        created_by: opsId,
        approved_by: ownerId,
        confirmed_at: new Date(),
        delivery_date: today,
        delivery_time_window: '08-10',
        credit_flag: 'OK',
        payment_terms: 'CREDIT',
      })
      .returning('*');
    orderByNo[deliveredTodayNo] = o4;
    await knex('sales_order_lines').insert({
      order_id: o4.id,
      item_id: curd.id,
      ordered_qty: 120,
      delivered_qty: 120,
      quoted_unit_price: '365.00',
      floor_price_snapshot: '341.50',
      target_price_snapshot: '365.00',
      landed_cost_snapshot: '290.00',
      margin_pct_snapshot: 20.55,
      line_total: lineTotal.toFixed(2),
    });
  }

  // ── B. M1: Customer Contacts, Communication Log, Quotes, UOM Conversions, WhatsApp Opt-ins ──
  for (const [code, contact] of [
    ['CUST-001', { name: 'Rajesh Patil', phone: '+919822011001', role: 'ACCOUNT_MANAGER' }],
    ['CUST-002', { name: 'Sunita Deshmukh', phone: '+919822011002', role: 'PURCHASING' }],
    ['CUST-003', { name: 'Vikram Joshi', phone: '+919822011003', role: 'FINANCE' }],
    ['CUST-004', { name: 'Prakash Kulkarni', phone: '+919822011004', role: 'ACCOUNT_MANAGER' }],
  ] as const) {
    const cust = custByCode[code];
    if (!cust) continue;
    const existingContact = await knex('customer_contacts')
      .where({ customer_id: cust.id, is_primary: true })
      .first();
    if (!existingContact) {
      await knex('customer_contacts').insert({
        customer_id: cust.id,
        name: contact.name,
        phone: contact.phone,
        role: contact.role,
        is_primary: true,
        created_by: opsId,
        updated_by: opsId,
      });
    }
    await knex('whatsapp_optins')
      .insert({ phone: contact.phone, party_type: 'CUSTOMER', party_id: cust.id })
      .onConflict('phone')
      .ignore();

    const existingComm = await knex('communication_log').where({ customer_id: cust.id }).first();
    if (!existingComm) {
      await knex('communication_log').insert([
        {
          customer_id: cust.id,
          channel: 'CALL',
          note: 'Confirmed weekly paneer & ghee dispatch schedule for morning slot.',
          user_id: opsId,
          at: new Date(Date.now() - 86400 * 1000),
          created_by: opsId,
          updated_by: opsId,
        },
        {
          customer_id: cust.id,
          channel: 'WHATSAPP',
          note: 'Shared updated weekly rate card & open invoice statement.',
          user_id: collectorId,
          at: new Date(Date.now() - 12 * 3600 * 1000),
          created_by: collectorId,
          updated_by: collectorId,
        },
      ]);
    }
  }

  if (paneer && ghee) {
    await knex('uom_conversions')
      .insert([
        { item_id: paneer.id, from_uom: 'CRATE', to_uom: 'KG', factor: 10, effective_from: new Date(), is_active: true, created_by: ownerId, updated_by: ownerId },
        { item_id: ghee.id, from_uom: 'CARTON', to_uom: 'LITER', factor: 12, effective_from: new Date(), is_active: true, created_by: ownerId, updated_by: ownerId },
      ])
      .onConflict(['item_id', 'from_uom', 'to_uom'])
      .ignore();
  }

  const seedQuotes = [
    { quote_no: 'QT-2611-0001', cust: cust1, siteId: factorySiteId, status: 'SENT', item: paneer, qty: 300, price: 94.0, floor: 90.0, target: 95.0, cost: 75.0 },
    { quote_no: 'QT-2611-0002', cust: cust3, siteId: warehouseSiteId, status: 'DRAFT', item: ghee, qty: 120, price: 565.0, floor: 545.5, target: 575.0, cost: 480.0 },
  ];
  for (const q of seedQuotes) {
    if (!q.cust || !q.item) continue;
    const exists = await knex('quotes').where({ quote_no: q.quote_no, site_id: q.siteId }).first();
    if (!exists) {
      const total = Number((q.qty * q.price).toFixed(2));
      const marginPct = Number((((q.price - q.cost) / q.price) * 100).toFixed(2));
      const [qRow] = await knex('quotes')
        .insert({
          quote_no: q.quote_no,
          customer_id: q.cust.id,
          site_id: q.siteId,
          status: q.status,
          total_amount: total.toFixed(2),
          margin_pct: marginPct,
          valid_until: new Date(Date.now() + 7 * 86400 * 1000),
          created_by: opsId,
          updated_by: opsId,
        })
        .returning('id');
      await knex('quote_lines').insert({
        quote_id: qRow.id,
        item_id: q.item.id,
        qty: q.qty,
        quoted_unit_price: q.price.toFixed(2),
        floor_price_snapshot: q.floor.toFixed(2),
        target_price_snapshot: q.target.toFixed(2),
        landed_cost_snapshot: q.cost.toFixed(2),
        margin_pct_snapshot: marginPct,
        created_by: opsId,
        updated_by: opsId,
      });
    }
  }

  // ── C. Fleet Vehicles & M3 Locations ──
  const vehicleSpecs = [
    { site_id: factorySiteId, registration_no: 'MH-04-DK-4821', vehicle_type: 'INSULATED_REEFER', capacity_kg: 2500 },
    { site_id: warehouseSiteId, registration_no: 'MH-43-BP-9014', vehicle_type: 'COLD_CHILLER_VAN', capacity_kg: 1500 },
  ];
  const vehicleByReg: Record<string, any> = {};
  for (const v of vehicleSpecs) {
    let row = await knex('vehicles').where({ site_id: v.site_id, registration_no: v.registration_no }).first();
    if (!row) {
      [row] = await knex('vehicles').insert({ ...v, is_active: true }).returning('*');
    }
    vehicleByReg[v.registration_no] = row;
  }

  const locationSpecs = [
    { site_id: factorySiteId, name: 'Factory Raw Milk Chiller Tank', location_type: 'RAW_MATERIAL_STORE' },
    { site_id: factorySiteId, name: 'Factory Cold Room A (FG)', location_type: 'FINISHED_GOODS_STORE' },
    { site_id: factorySiteId, name: 'Factory Quarantine Bay', location_type: 'QUARANTINE' },
    { site_id: warehouseSiteId, name: 'Navi Mumbai Cold Hub B1', location_type: 'TRADING_WAREHOUSE' },
    { site_id: officeSiteId, name: 'Corporate Sample Room', location_type: 'OFFICE' },
  ];
  const locByName: Record<string, any> = {};
  for (const loc of locationSpecs) {
    let row = await knex('locations').where({ site_id: loc.site_id, name: loc.name }).first();
    if (!row) {
      [row] = await knex('locations')
        .insert({ ...loc, is_active: true, created_by: ownerId, updated_by: ownerId })
        .returning('*');
    }
    locByName[loc.name] = row;
  }
  const locFactoryRm = locByName['Factory Raw Milk Chiller Tank']?.id;
  const locFactoryFg = locByName['Factory Cold Room A (FG)']?.id;
  const locWh = locByName['Navi Mumbai Cold Hub B1']?.id;

  // ── D. M2 Suppliers, Supplier Items, Rate Contracts, Requisitions, POs ──
  const supplierSpecs = [
    {
      supplier_code: 'SUP-001',
      company_name: 'Sahyadri Dairy Producers Co-op',
      phone: '+919820110001',
      whatsapp_no: '+919820110001',
      payment_terms_days: 15,
      gstin: '27AABCS1122K1Z3',
      reliability_score_pct: 96.5,
      lead_time_days_avg: 1,
      current_ap_balance: 145000.0,
    },
    {
      supplier_code: 'SUP-002',
      company_name: 'Konkan Agro & Creameries Pvt Ltd',
      phone: '+919820110002',
      whatsapp_no: '+919820110002',
      payment_terms_days: 30,
      gstin: '27AABCK3344L1Z8',
      reliability_score_pct: 91.0,
      lead_time_days_avg: 2,
      current_ap_balance: 82000.0,
    },
    {
      supplier_code: 'SUP-003',
      company_name: 'Everest Corrugated Packaging',
      phone: '+919820110003',
      whatsapp_no: '+919820110003',
      payment_terms_days: 30,
      gstin: '27AABCE5566M1Z1',
      reliability_score_pct: 94.0,
      lead_time_days_avg: 3,
      current_ap_balance: 36500.0,
    },
  ];
  const supByCode: Record<string, any> = {};
  for (const s of supplierSpecs) {
    let row = await knex('suppliers').where({ supplier_code: s.supplier_code }).first();
    if (!row) {
      [row] = await knex('suppliers')
        .insert({ id: randomUUID(), ...s, is_approved: true, is_active: true, created_by: ownerId, updated_by: ownerId })
        .returning('*');
    }
    supByCode[s.supplier_code] = row;
  }
  const sup1 = supByCode['SUP-001'];
  const sup2 = supByCode['SUP-002'];
  const sup3 = supByCode['SUP-003'];

  if (sup1 && sup2 && sup3 && rawMilk && butter && carton && ghee) {
    await knex('supplier_items')
      .insert([
        { supplier_id: sup1.id, item_id: rawMilk.id, is_primary: true, pack_size: 40, min_order_qty: 200, created_by: ownerId, updated_by: ownerId },
        { supplier_id: sup2.id, item_id: butter.id, is_primary: true, pack_size: 20, min_order_qty: 50, created_by: ownerId, updated_by: ownerId },
        { supplier_id: sup2.id, item_id: ghee.id, is_primary: false, pack_size: 12, min_order_qty: 24, created_by: ownerId, updated_by: ownerId },
        { supplier_id: sup3.id, item_id: carton.id, is_primary: true, pack_size: 50, min_order_qty: 100, created_by: ownerId, updated_by: ownerId },
      ])
      .onConflict(['supplier_id', 'item_id'])
      .ignore();

    const rcExists = await knex('rate_contracts').where({ supplier_id: sup1.id, item_id: rawMilk.id }).first();
    if (!rcExists) {
      await knex('rate_contracts').insert([
        {
          id: randomUUID(),
          supplier_id: sup1.id,
          item_id: rawMilk.id,
          agreed_price: '51.50',
          valid_from: isoDateOffset(-30),
          valid_to: isoDateOffset(60),
          approved_by: ownerId,
          created_by: ownerId,
          updated_by: ownerId,
        },
        {
          id: randomUUID(),
          supplier_id: sup3.id,
          item_id: carton.id,
          agreed_price: '37.50',
          valid_from: isoDateOffset(-15),
          valid_to: isoDateOffset(90),
          approved_by: ownerId,
          created_by: ownerId,
          updated_by: ownerId,
        },
      ]);
    }

    const srqExists = await knex('supplier_rate_quotes').where({ supplier_id: sup2.id, item_id: butter.id }).first();
    if (!srqExists) {
      await knex('supplier_rate_quotes').insert([
        { id: randomUUID(), supplier_id: sup1.id, item_id: rawMilk.id, quoted_price: '52.00', quoted_at: new Date(), source: 'PO', created_by: opsId, updated_by: opsId },
        { id: randomUUID(), supplier_id: sup2.id, item_id: butter.id, quoted_price: '358.00', quoted_at: new Date(), source: 'WHATSAPP', created_by: opsId, updated_by: opsId },
      ]);
    }

    const prSpecs = [
      { req_no: 'PR-2611-0001', item_id: rawMilk.id, qty: 1200, needed_by: isoDateOffset(1), source: 'PRODUCTION', status: 'PO_CREATED' },
      { req_no: 'PR-2611-0002', item_id: carton.id, qty: 400, needed_by: isoDateOffset(2), source: 'MANUAL', status: 'OPEN' },
    ];
    for (const pr of prSpecs) {
      await knex('purchase_requisitions')
        .insert({ id: randomUUID(), ...pr, requested_by: prodId, created_by: prodId, updated_by: prodId })
        .onConflict('req_no')
        .ignore();
    }
  }

  // Purchase Orders + Lines + Shortfall + Price Spike Exception
  const poByNo: Record<string, any> = {};
  if (sup1 && sup2 && sup3 && rawMilk && butter && carton) {
    const poSpecs = [
      { po_no: 'PO-2611-0001', supplier: sup1, siteId: factorySiteId, status: 'ISSUED', item: rawMilk, ordered: 1000, confirmed: 900, received: 750, price: 52.0, lastPrice: 51.5, variancePct: 0.97, shortfallQty: 100 },
      { po_no: 'PO-2611-0002', supplier: sup2, siteId: warehouseSiteId, status: 'PARTIALLY_RECEIVED', item: butter, ordered: 200, confirmed: 200, received: 140, price: 360.0, lastPrice: 358.0, variancePct: 0.56, shortfallQty: 0 },
      { po_no: 'PO-2611-0003', supplier: sup3, siteId: factorySiteId, status: 'PENDING_APPROVAL', item: carton, ordered: 500, confirmed: 500, received: 0, price: 44.0, lastPrice: 37.5, variancePct: 17.33, shortfallQty: 0 },
    ];
    for (const p of poSpecs) {
      let poRow = await knex('purchase_orders').where({ po_no: p.po_no }).first();
      if (!poRow) {
        const totalAmt = Number((p.ordered * p.price).toFixed(2));
        [poRow] = await knex('purchase_orders')
          .insert({
            id: randomUUID(),
            po_no: p.po_no,
            supplier_id: p.supplier.id,
            receiving_site_id: p.siteId,
            po_status: p.status,
            total_amount: totalAmt.toFixed(2),
            expected_delivery: isoDateOffset(1),
            approved_by: p.status === 'PENDING_APPROVAL' ? null : ownerId,
            created_by: opsId,
            updated_by: opsId,
          })
          .returning('*');
        const [poLine] = await knex('purchase_order_lines')
          .insert({
            id: randomUUID(),
            po_id: poRow.id,
            item_id: p.item.id,
            ordered_qty: p.ordered,
            confirmed_qty: p.confirmed,
            received_qty: p.received,
            unit_price: p.price.toFixed(2),
            last_purchase_price_snapshot: p.lastPrice.toFixed(2),
            price_variance_pct: p.variancePct,
            created_by: opsId,
            updated_by: opsId,
          })
          .returning('*');

        if (p.shortfallQty > 0) {
          await knex('po_shortfalls').insert({
            id: randomUUID(),
            po_line_id: poLine.id,
            deficit_qty: p.shortfallQty,
            status: 'OPEN',
            created_by: opsId,
            updated_by: opsId,
          });
        }

        if (p.status === 'PENDING_APPROVAL') {
          const existingPoEx = await knex('exception_approvals')
            .where({
              exception_type: 'SUPPLIER_PRICE_SPIKE',
              reference_table: 'purchase_orders',
              reference_id: String(poRow.id),
            })
            .first();
          if (!existingPoEx) {
            await knex('exception_approvals').insert({
              exception_type: 'SUPPLIER_PRICE_SPIKE',
              reference_table: 'purchase_orders',
              reference_id: String(poRow.id),
              requested_by: opsId,
              site_id: p.siteId,
              context_payload_json: {
                title: `${p.po_no} Supplier Price Spike (+${p.variancePct}%)`,
                summary: `${p.supplier.company_name} quoted ₹${p.price} vs contract ₹${p.lastPrice}.`,
                impact: `Additional cost ₹${((p.price - p.lastPrice) * p.ordered).toFixed(0)}`,
                actions: [
                  { code: 'APPROVE', label: 'Approve PO Rate' },
                  { code: 'REJECT', label: 'Reject PO' },
                ],
              },
              status: 'PENDING',
              priority: 'HIGH',
              value_at_risk: ((p.price - p.lastPrice) * p.ordered).toFixed(2),
              expires_at: new Date(Date.now() + 4 * 3600 * 1000),
            });
          }
        }
      }
      poByNo[p.po_no] = poRow;
    }
  }

  // ── E. M3 Inventory Batches, GRNs, Ledger, Reservations, Transfers, Adjustments, Stock Counts ──
  // NOTE: batch_number is globally unique per site (uq_mv_inventory_alerts)! And qty_available is GENERATED ALWAYS.
  const batchByNo: Record<string, any> = {};
  if (paneer && ghee && butter && curd && rawMilk && carton && locFactoryRm && locFactoryFg && locWh) {
    const batchSpecs = [
      { site_id: factorySiteId, item_id: rawMilk.id, location_id: locFactoryRm, batch_number: 'BAT-RM-MILK-001', status: 'AVAILABLE', qty_on_hand: 320, qty_committed: 0, expiry_date: isoDateOffset(2), mfg_date: isoDateOffset(0), landed_cost_per_unit: 52.0 },
      { site_id: factorySiteId, item_id: paneer.id, location_id: locFactoryFg, batch_number: 'BAT-FG-PNR-001', status: 'AVAILABLE', qty_on_hand: 680, qty_committed: 180, expiry_date: isoDateOffset(5), mfg_date: isoDateOffset(-1), landed_cost_per_unit: 75.0 },
      { site_id: factorySiteId, item_id: ghee.id, location_id: locFactoryFg, batch_number: 'BAT-FG-GHEE-001', status: 'AVAILABLE', qty_on_hand: 240, qty_committed: 40, expiry_date: isoDateOffset(120), mfg_date: isoDateOffset(-5), landed_cost_per_unit: 480.0 },
      { site_id: factorySiteId, item_id: curd.id, location_id: locFactoryFg, batch_number: 'BAT-FG-CURD-001', status: 'AVAILABLE', qty_on_hand: 110, qty_committed: 0, expiry_date: isoDateOffset(3), mfg_date: isoDateOffset(-2), landed_cost_per_unit: 290.0 },
      { site_id: factorySiteId, item_id: carton.id, location_id: locFactoryRm, batch_number: 'BAT-PKG-BOX-001', status: 'AVAILABLE', qty_on_hand: 140, qty_committed: 0, expiry_date: isoDateOffset(365), mfg_date: isoDateOffset(-15), landed_cost_per_unit: 38.0 },
      { site_id: warehouseSiteId, item_id: butter.id, location_id: locWh, batch_number: 'BAT-TRD-BUT-001', status: 'AVAILABLE', qty_on_hand: 310, qty_committed: 90, expiry_date: isoDateOffset(45), mfg_date: isoDateOffset(-10), landed_cost_per_unit: 360.0 },
      { site_id: warehouseSiteId, item_id: paneer.id, location_id: locWh, batch_number: 'BAT-WH-PNR-002', status: 'AVAILABLE', qty_on_hand: 180, qty_committed: 20, expiry_date: isoDateOffset(6), mfg_date: isoDateOffset(0), landed_cost_per_unit: 75.0 },
    ];
    for (const b of batchSpecs) {
      let row = await knex('inventory_batches')
        .where({ site_id: b.site_id, item_id: b.item_id, batch_number: b.batch_number })
        .first();
      if (!row) {
        [row] = await knex('inventory_batches')
          .insert({ ...b, received_date: today, created_by: storeId, updated_by: storeId })
          .returning('*');
      }
      batchByNo[b.batch_number] = row;
    }

    // GRNs (M2 + M3)
    const po1 = poByNo['PO-2611-0001'];
    const po2 = poByNo['PO-2611-0002'];
    if (po1 && sup1) {
      const grnExists = await knex('goods_receipts').where({ grn_no: 'GRN-2611-0001' }).first();
      if (!grnExists) {
        const [grnRow] = await knex('goods_receipts')
          .insert({
            id: randomUUID(),
            grn_no: 'GRN-2611-0001',
            po_id: po1.id,
            supplier_id: sup1.id,
            site_id: factorySiteId,
            location_id: locFactoryRm,
            received_by: storeId,
            received_at: new Date(),
            created_by: storeId,
            updated_by: storeId,
          })
          .returning('*');
        await knex('goods_receipt_lines').insert({
          id: randomUUID(),
          grn_id: grnRow.id,
          item_id: rawMilk.id,
          received_qty: 750,
          batch_lot_no: 'BAT-RM-MILK-001',
          mfg_date: isoDateOffset(0),
          expiry_date: isoDateOffset(2),
          condition_note: 'Chilled tanker verified at 4C.',
          created_by: storeId,
          updated_by: storeId,
        });
      }
    }
    if (po2 && sup2) {
      const grn2Exists = await knex('goods_receipts').where({ grn_no: 'GRN-2611-0002' }).first();
      if (!grn2Exists) {
        const [grnRow] = await knex('goods_receipts')
          .insert({
            id: randomUUID(),
            grn_no: 'GRN-2611-0002',
            po_id: po2.id,
            supplier_id: sup2.id,
            site_id: warehouseSiteId,
            location_id: locWh,
            received_by: storeId,
            received_at: new Date(Date.now() - 86400 * 1000),
            created_by: storeId,
            updated_by: storeId,
          })
          .returning('*');
        await knex('goods_receipt_lines').insert({
          id: randomUUID(),
          grn_id: grnRow.id,
          item_id: butter.id,
          received_qty: 140,
          batch_lot_no: 'BAT-TRD-BUT-001',
          mfg_date: isoDateOffset(-10),
          expiry_date: isoDateOffset(45),
          condition_note: 'Sealed cartons in cold storage.',
          created_by: storeId,
          updated_by: storeId,
        });
      }
    }

    // Supplier Bills (3-way match demo)
    const milkBatch = batchByNo['BAT-RM-MILK-001'];
    const butterBatch = batchByNo['BAT-TRD-BUT-001'];
    if (po1 && sup1 && milkBatch) {
      const sb1 = await knex('supplier_bills').where({ bill_no: 'SB-2611-0001' }).first();
      if (!sb1) {
        const [b1] = await knex('supplier_bills')
          .insert({
            id: randomUUID(),
            supplier_id: sup1.id,
            bill_no: 'SB-2611-0001',
            bill_number: 'SDP/26-27/0841',
            po_id: po1.id,
            site_id: factorySiteId,
            amount: '39000.00',
            subtotal: '39000.00',
            tax_total: '0.00',
            total_amount: '39000.00',
            bill_date: new Date(),
            due_date: isoDateOffset(15),
            status: 'APPROVED',
            three_way_status: 'MATCHED',
            approved_by: ownerId,
            approved_at: new Date(),
            created_by: opsId,
            updated_by: ownerId,
          })
          .returning('*');
        await knex('supplier_bill_items').insert({
          id: randomUUID(),
          bill_id: b1.id,
          batch_id: milkBatch.id,
          item_id: rawMilk.id,
          quantity: 750,
          rate_per_unit: '52.00',
          tax_amount: '0.00',
          line_total: '39000.00',
          tax_treatment: 'EXEMPT',
          tax_rate: '0',
          created_by: opsId,
          updated_by: opsId,
        });
      }
    }
    if (po2 && sup2 && butterBatch) {
      const sb2 = await knex('supplier_bills').where({ bill_no: 'SB-2611-0002' }).first();
      if (!sb2) {
        const [b2] = await knex('supplier_bills')
          .insert({
            id: randomUUID(),
            supplier_id: sup2.id,
            bill_no: 'SB-2611-0002',
            bill_number: 'KAC/26-27/0419',
            po_id: po2.id,
            site_id: warehouseSiteId,
            amount: '58240.00',
            subtotal: '52000.00',
            tax_total: '6240.00',
            cgst: '3120.00',
            sgst: '3120.00',
            total_amount: '58240.00',
            bill_date: new Date(),
            due_date: isoDateOffset(20),
            status: 'PENDING_APPROVAL',
            three_way_status: 'AMOUNT_MISMATCH',
            created_by: opsId,
            updated_by: opsId,
          })
          .returning('*');
        await knex('supplier_bill_items').insert({
          id: randomUUID(),
          bill_id: b2.id,
          batch_id: butterBatch.id,
          item_id: butter.id,
          quantity: 140,
          rate_per_unit: '371.43',
          tax_amount: '6240.00',
          line_total: '58240.00',
          tax_treatment: 'TAXABLE',
          tax_rate: '12',
          created_by: opsId,
          updated_by: opsId,
        });
      }
    }

    // Stock Ledger Txns (append-only, idempotent by reference_no)
    const ledgerSeeds = [
      { site_id: factorySiteId, item_id: rawMilk.id, batch_id: batchByNo['BAT-RM-MILK-001'].id, txn_type: 'RECEIPT', qty: 750, uom: 'LITER', reference_table: 'goods_receipts', reference_no: 'GRN-2611-0001', posted_by: storeId, note: 'GRN tanker receipt' },
      { site_id: factorySiteId, item_id: paneer.id, batch_id: batchByNo['BAT-FG-PNR-001'].id, txn_type: 'RECEIPT', qty: 680, uom: 'KG', reference_table: 'production_work_orders', reference_no: 'WO-2611-0001', posted_by: prodId, note: 'Completed paneer batch output' },
      { site_id: warehouseSiteId, item_id: butter.id, batch_id: batchByNo['BAT-TRD-BUT-001'].id, txn_type: 'RECEIPT', qty: 310, uom: 'KG', reference_table: 'goods_receipts', reference_no: 'GRN-2611-0002', posted_by: storeId, note: 'Cold hub restock' },
    ];
    for (const tx of ledgerSeeds) {
      const exists = await knex('stock_ledger_txns').where({ reference_no: tx.reference_no, batch_id: tx.batch_id }).first();
      if (!exists) {
        await knex('stock_ledger_txns').insert(tx);
      }
    }

    // Stock Reservations
    const so1 = orderByNo['SO-2611-0001'];
    const pnrBatch = batchByNo['BAT-FG-PNR-001'];
    if (so1 && pnrBatch) {
      await knex('stock_reservations')
        .insert({
          site_id: factorySiteId,
          item_id: paneer.id,
          batch_id: pnrBatch.id,
          order_id: so1.id,
          order_type: 'SALES_ORDER',
          qty: 180,
          uom: 'KG',
          status: 'ACTIVE',
          expires_at: new Date(Date.now() + 24 * 3600 * 1000),
          idempotency_key: 'seed-res-so-0001',
          created_by: storeId,
          updated_by: storeId,
        })
        .onConflict('idempotency_key')
        .ignore();
    }

    // Inter-site Stock Transfer
    const trfExists = await knex('stock_transfers').where({ transfer_no: 'TRF-2611-0001' }).first();
    if (!trfExists && pnrBatch && batchByNo['BAT-WH-PNR-002']) {
      const [trfRow] = await knex('stock_transfers')
        .insert({
          from_site_id: factorySiteId,
          to_site_id: warehouseSiteId,
          transfer_no: 'TRF-2611-0001',
          status: 'IN_TRANSIT',
          requested_by: opsId,
          reserved_at: new Date(Date.now() - 3 * 3600 * 1000),
          dispatched_at: new Date(Date.now() - 3600 * 1000),
          variance_qty: 0,
          idempotency_key: 'seed-trf-2611-0001',
          created_by: opsId,
          updated_by: opsId,
        })
        .returning('*');
      await knex('stock_transfer_lines').insert({
        transfer_id: trfRow.id,
        item_id: paneer.id,
        from_batch_id: pnrBatch.id,
        to_batch_id: batchByNo['BAT-WH-PNR-002'].id,
        requested_qty: 120,
        reserved_qty: 120,
        dispatched_qty: 120,
        received_qty: 0,
        uom: 'KG',
        status: 'DISPATCHED',
        note: 'Cold chain crate transfer Factory -> Navi Mumbai',
      });
    }

    // Stock Adjustments
    await knex('stock_adjustments')
      .insert([
        {
          site_id: factorySiteId,
          item_id: curd.id,
          batch_id: batchByNo['BAT-FG-CURD-001'].id,
          adjustment_no: 'ADJ-2611-0001',
          adjustment_type: 'SHRINKAGE',
          qty: 4.5,
          uom: 'KG',
          variance_pct: 4.09,
          reason: 'Two punctured 5kg buckets during morning crate stacking.',
          status: 'PENDING',
          requested_by: storeId,
          idempotency_key: 'seed-adj-2611-0001',
        },
        {
          site_id: factorySiteId,
          item_id: rawMilk.id,
          batch_id: milkBatch.id,
          adjustment_no: 'ADJ-2611-0002',
          adjustment_type: 'VARIANCE_CORRECTION',
          qty: 8.0,
          uom: 'LITER',
          variance_pct: 2.5,
          reason: 'Flowmeter calibration variance verified after morning pasteurizer CIP.',
          status: 'APPROVED',
          requested_by: storeId,
          approved_by: ownerId,
          approved_at: new Date(),
          idempotency_key: 'seed-adj-2611-0002',
        },
      ])
      .onConflict('adjustment_no')
      .ignore();

    // Physical Stock Count Sheet + Items
    const scExists = await knex('stock_count_sheets').where({ count_no: 'SC-2611-0001' }).first();
    if (!scExists) {
      const [sc] = await knex('stock_count_sheets')
        .insert({
          site_id: factorySiteId,
          location_id: locFactoryFg,
          count_no: 'SC-2611-0001',
          status: 'SUBMITTED',
          notes: 'Evening cold-room physical cycle count',
          created_by: storeId,
        })
        .returning('*');
      await knex('stock_count_items').insert([
        { count_sheet_id: sc.id, item_id: paneer.id, batch_no: 'BAT-FG-PNR-001', system_qty: 680, counted_qty: 676, variance_qty: -4 },
        { count_sheet_id: sc.id, item_id: ghee.id, batch_no: 'BAT-FG-GHEE-001', system_qty: 240, counted_qty: 240, variance_qty: 0 },
      ]);
    }
  }

  // ── F. M4 BOMs, Work Orders, Production Requisitions, Wastage, Labour Attendance ──
  if (paneer && ghee && rawMilk && carton) {
    let bomPaneer = await knex('bom_headers')
      .where({ item_id: paneer.id, site_id: factorySiteId, status: 'ACTIVE' })
      .first();
    if (!bomPaneer) {
      [bomPaneer] = await knex('bom_headers')
        .insert({
          bom_no: 'BOM-PNR-001',
          item_id: paneer.id,
          site_id: factorySiteId,
          version: 1,
          status: 'ACTIVE',
          effective_from: isoDateOffset(-30),
          yield_pct: 94.5,
          created_by: ownerId,
          updated_by: ownerId,
        })
        .returning('*');
      await knex('bom_lines').insert([
        { bom_header_id: bomPaneer.id, item_id: rawMilk.id, qty_per_unit: 5.2, uom: 'LITER', sequence_no: 1, is_critical: true },
        { bom_header_id: bomPaneer.id, item_id: carton.id, qty_per_unit: 0.1, uom: 'CARTON', sequence_no: 2, is_critical: false },
      ]);
    }

    let bomGhee = await knex('bom_headers')
      .where({ item_id: ghee.id, site_id: factorySiteId, status: 'ACTIVE' })
      .first();
    if (!bomGhee) {
      [bomGhee] = await knex('bom_headers')
        .insert({
          bom_no: 'BOM-GHEE-001',
          item_id: ghee.id,
          site_id: factorySiteId,
          version: 1,
          status: 'ACTIVE',
          effective_from: isoDateOffset(-30),
          yield_pct: 92.0,
          created_by: ownerId,
          updated_by: ownerId,
        })
        .returning('*');
      await knex('bom_lines').insert([
        { bom_header_id: bomGhee.id, item_id: rawMilk.id, qty_per_unit: 18.0, uom: 'LITER', sequence_no: 1, is_critical: true },
      ]);
    }

    const woSpecs = [
      { wo_no: 'WO-2611-0001', bom: bomPaneer, item: paneer, planned: 500, actual: 488, waste: 6.5, status: 'COMPLETED' },
      { wo_no: 'WO-2611-0002', bom: bomPaneer, item: paneer, planned: 350, actual: 0, waste: 0, status: 'IN_PROGRESS' },
      { wo_no: 'WO-2611-0003', bom: bomGhee, item: ghee, planned: 150, actual: 0, waste: 0, status: 'PLANNED' },
    ];
    let inProgressWoId: string | null = null;
    for (const w of woSpecs) {
      if (!w.bom) continue;
      let woRow = await knex('production_work_orders').where({ wo_no: w.wo_no, site_id: factorySiteId }).first();
      if (!woRow) {
        [woRow] = await knex('production_work_orders')
          .insert({
            wo_no: w.wo_no,
            site_id: factorySiteId,
            bom_header_id: w.bom.id,
            planned_qty: w.planned,
            uom: w.item.primary_uom,
            status: w.status,
            started_at: w.status !== 'PLANNED' ? new Date(Date.now() - 4 * 3600 * 1000) : null,
            completed_at: w.status === 'COMPLETED' ? new Date(Date.now() - 3600 * 1000) : null,
            started_by: w.status !== 'PLANNED' ? prodId : null,
            completed_by: w.status === 'COMPLETED' ? prodId : null,
            created_by: prodId,
            updated_by: prodId,
          })
          .returning('*');

        await knex('work_order_materials').insert({
          work_order_id: woRow.id,
          item_id: rawMilk.id,
          batch_id: batchByNo['BAT-RM-MILK-001']?.id ?? null,
          planned_qty: w.planned * 5.2,
          actual_qty: w.status === 'COMPLETED' ? w.planned * 5.25 : w.status === 'IN_PROGRESS' ? 900 : 0,
          uom: 'LITER',
        });

        await knex('work_order_outputs').insert({
          work_order_id: woRow.id,
          item_id: w.item.id,
          batch_id: batchByNo['BAT-FG-PNR-001']?.id ?? null,
          planned_qty: w.planned,
          actual_qty: w.actual,
          uom: w.item.primary_uom,
        });

        if (w.waste > 0) {
          await knex('wastage_records').insert({
            work_order_id: woRow.id,
            item_id: w.item.id,
            batch_id: batchByNo['BAT-FG-PNR-001']?.id ?? null,
            qty: w.waste,
            uom: w.item.primary_uom,
            reason_type: 'NORMAL',
            status: 'APPROVED',
            approved_by: ownerId,
            approved_at: new Date(),
            created_by: prodId,
          });
        }
      }
      if (w.status === 'IN_PROGRESS') inProgressWoId = String(woRow.id);
    }

    const reqExists = await knex('production_requisitions').where({ req_no: 'PREQ-2611-0001', site_id: factorySiteId }).first();
    if (!reqExists) {
      const [preq] = await knex('production_requisitions')
        .insert({
          req_no: 'PREQ-2611-0001',
          site_id: factorySiteId,
          requested_by: prodId,
          required_by_date: today,
          status: 'PENDING',
          created_by: prodId,
          updated_by: prodId,
        })
        .returning('*');
      await knex('production_requisition_lines').insert({
        requisition_id: preq.id,
        item_id: rawMilk.id,
        required_qty: 1800,
        uom: 'LITER',
        bom_header_id: bomPaneer.id,
      });
    }

    const attExists = await knex('labour_attendance_logs').where({ site_id: factorySiteId, date: today }).first();
    if (!attExists) {
      await knex('labour_attendance_logs').insert([
        { site_id: factorySiteId, worker_id: prodId, work_order_id: inProgressWoId, date: today, shift: 'MORNING', hours_worked: 8, overtime_hours: 1.5, created_by: prodId },
        { site_id: factorySiteId, worker_id: storeId, work_order_id: inProgressWoId, date: today, shift: 'MORNING', hours_worked: 8, overtime_hours: 0, created_by: prodId },
      ]);
    }
  }

  // ── G. M5 Delivery Trips, Stops, Stop Lines, Challans, Expenses, Issues ──
  const veh1 = vehicleByReg['MH-04-DK-4821'];
  const veh2 = vehicleByReg['MH-43-BP-9014'];
  const so1 = orderByNo['SO-2611-0001'];
  const so3 = orderByNo['SO-2611-0003'];
  const so4 = orderByNo['SO-2611-0004'];
  if (veh1 && veh2 && cust1 && cust3 && cust4 && paneer && butter && curd) {
    const tripSpecs = [
      { trip_no: 'TRP-2611-0001', site_id: factorySiteId, vehicle_id: veh1.id, status: 'IN_TRANSIT', order: so1, cust: cust1, item: paneer, qty: 500, delivered: 0, stopStatus: 'PENDING', isCod: false, codAmt: 0 },
      { trip_no: 'TRP-2611-0002', site_id: warehouseSiteId, vehicle_id: veh2.id, status: 'LOADING', order: so3, cust: cust3, item: butter, qty: 160, delivered: 0, stopStatus: 'PENDING', isCod: true, codAmt: 25000 },
      { trip_no: 'TRP-2611-0003', site_id: factorySiteId, vehicle_id: veh1.id, status: 'COMPLETED', order: so4, cust: cust4, item: curd, qty: 120, delivered: 120, stopStatus: 'DELIVERED_FULL', isCod: true, codAmt: 43800 },
    ];
    for (const t of tripSpecs) {
      let tripRow = await knex('delivery_trips').where({ trip_no: t.trip_no }).first();
      if (!tripRow) {
        [tripRow] = await knex('delivery_trips')
          .insert({
            site_id: t.site_id,
            origin_site_id: t.site_id,
            trip_no: t.trip_no,
            trip_date: today,
            vehicle_id: t.vehicle_id,
            driver_id: driverId,
            status: t.status,
            planned_distance_km: 42.5,
            started_at: t.status !== 'LOADING' ? new Date(Date.now() - 2 * 3600 * 1000) : null,
            closed_at: t.status === 'COMPLETED' ? new Date() : null,
            closed_by: t.status === 'COMPLETED' ? opsId : null,
            created_by: opsId,
            updated_by: opsId,
          })
          .returning('*');

        const [stopRow] = await knex('delivery_stops')
          .insert({
            site_id: t.site_id,
            trip_id: tripRow.id,
            sales_order_id: t.order?.id ?? null,
            customer_id: t.cust.id,
            sequence_no: 1,
            status: t.stopStatus,
            epod_method: t.stopStatus === 'DELIVERED_FULL' ? 'OTP' : null,
            epod_otp_verified: t.stopStatus === 'DELIVERED_FULL',
            is_cod: t.isCod,
            cod_amount: t.codAmt,
            cod_collected_amount: t.stopStatus === 'DELIVERED_FULL' ? t.codAmt : 0,
            delivered_at: t.stopStatus === 'DELIVERED_FULL' ? new Date() : null,
            idempotency_key: `seed-stop-${t.trip_no}-1`,
            created_by: opsId,
            updated_by: opsId,
          })
          .returning('*');

        await knex('delivery_stop_lines').insert({
          stop_id: stopRow.id,
          item_id: t.item.id,
          loaded_qty: t.qty,
          delivered_qty: t.delivered,
          returned_qty: 0,
          damaged: false,
        });

        await knex('delivery_challans')
          .insert({
            challan_no: `DC-${t.trip_no.replace('TRP-', '')}`,
            trip_id: tripRow.id,
            stop_id: stopRow.id,
            eway_bill_no: t.qty * 100 > 50000 ? 'EWB-27100994821' : null,
          })
          .onConflict('challan_no')
          .ignore();

        if (t.status !== 'LOADING') {
          await knex('trip_expenses').insert({
            site_id: t.site_id,
            trip_id: tripRow.id,
            type: t.status === 'IN_TRANSIT' ? 'FUEL' : 'TOLL',
            amount: t.status === 'IN_TRANSIT' ? '1450.00' : '240.00',
            logged_by: driverId,
          });
        }

        if (t.status === 'IN_TRANSIT') {
          await knex('issue_reports').insert({
            site_id: t.site_id,
            trip_id: tripRow.id,
            stop_id: stopRow.id,
            reported_by: driverId,
            category: 'ROAD_CLOSURE',
            rejected_qty: 0,
            value_at_risk: 0,
            status: 'OPEN',
            resolution_note: 'Heavy waterlogging near Pune Expressway exit, rerouting via old highway.',
          });
        }
      }
    }
  }

  // ── H. M6 Invoices Across All 4 AR Aging Buckets, Customer Ledger, Receipts, Cheques, Credit Notes, Worklist, Tally ──
  const invSeeds = [
    { invoice_no: 'INV-2611-0001', cust: cust1, site_id: factorySiteId, dueOffset: -35, total: 55000, paid: 0, balance: 55000, status: 'OVERDUE', item: paneer, qty: 590, price: 93.22 },
    { invoice_no: 'INV-2611-0002', cust: cust1, site_id: factorySiteId, dueOffset: -20, total: 25000, paid: 0, balance: 25000, status: 'OVERDUE', item: ghee, qty: 45, price: 555.55 },
    { invoice_no: 'INV-2611-0003', cust: cust2, site_id: factorySiteId, dueOffset: -10, total: 45000, paid: 0, balance: 45000, status: 'OVERDUE', item: ghee, qty: 80, price: 562.5 },
    { invoice_no: 'INV-2611-0004', cust: cust3, site_id: warehouseSiteId, dueOffset: -2, total: 110000, paid: 0, balance: 110000, status: 'UNPAID', item: butter, qty: 250, price: 440.0 },
    { invoice_no: 'INV-2611-0005', cust: cust4, site_id: factorySiteId, dueOffset: 7, total: 43800, paid: 10000, balance: 33800, status: 'PARTIALLY_PAID', item: curd, qty: 120, price: 365.0 },
  ];
  const invByNo: Record<string, any> = {};
  for (const inv of invSeeds) {
    if (!inv.cust || !inv.item) continue;
    let invRow = await knex('invoices').where({ invoice_no: inv.invoice_no }).first();
    if (!invRow) {
      const taxable = Number((inv.total / 1.05).toFixed(2));
      const gst = Number((inv.total - taxable).toFixed(2));
      [invRow] = await knex('invoices')
        .insert({
          site_id: inv.site_id,
          customer_id: inv.cust.id,
          invoice_no: inv.invoice_no,
          invoice_date: isoDateOffset(Math.min(0, inv.dueOffset - 15)),
          due_date: isoDateOffset(inv.dueOffset),
          total_amount: inv.total.toFixed(2),
          paid_amount: inv.paid.toFixed(2),
          balance_due: inv.balance.toFixed(2),
          taxable_amount: taxable.toFixed(2),
          cgst: (gst / 2).toFixed(2),
          sgst: (gst / 2).toFixed(2),
          igst: '0.00',
          status: inv.status,
          is_cod: false,
          place_of_supply_state_code: inv.cust.state_code || '27',
          created_by: opsId,
          updated_by: opsId,
        })
        .returning('*');

      await knex('invoice_lines').insert({
        invoice_id: invRow.id,
        item_id: inv.item.id,
        qty: inv.qty,
        unit_price: inv.price.toFixed(2),
        line_total: inv.total.toFixed(2),
        hsn_code: '04061000',
        tax_rate_pct: 5,
        tax_amount: gst.toFixed(2),
        tax_treatment: 'TAXABLE',
      });

      const cleExists = await knex('customer_ledger_entries').where({ ref_id: invRow.id }).first();
      if (!cleExists) {
        await knex('customer_ledger_entries').insert({
          site_id: inv.site_id,
          customer_id: inv.cust.id,
          entry_type: 'INVOICE',
          debit: inv.total.toFixed(2),
          credit: '0.00',
          ref_id: invRow.id,
          ref_no: inv.invoice_no,
          posted_at: new Date(Date.now() + inv.dueOffset * 86400 * 1000),
          running_balance: inv.balance.toFixed(2),
          note: `Sales invoice ${inv.invoice_no}`,
        });
      }
    }
    invByNo[inv.invoice_no] = invRow;
  }

  // Collection Receipts + Allocations + Cheques + Custody Ledger
  const recSpecs = [
    { receipt_no: 'REC-2611-0001', cust: cust4, site_id: factorySiteId, amount: 10000, mode: 'CASH', ref: null, inv: invByNo['INV-2611-0005'], collector: collectorId },
    { receipt_no: 'REC-2611-0002', cust: cust3, site_id: warehouseSiteId, amount: 35000, mode: 'CHEQUE', ref: 'CHQ-774821', inv: invByNo['INV-2611-0004'], collector: collectorId, chq: { no: '774821', bank: 'HDFC Bank Vashi', status: 'DEPOSITED' } },
    { receipt_no: 'REC-2611-0003', cust: cust2, site_id: factorySiteId, amount: 18500, mode: 'UPI', ref: 'UPI-4319820192', inv: invByNo['INV-2611-0003'], collector: collectorId },
    { receipt_no: 'REC-2611-0004', cust: cust1, site_id: factorySiteId, amount: 22000, mode: 'CHEQUE', ref: 'CHQ-118204', inv: invByNo['INV-2611-0001'], collector: collectorId, chq: { no: '118204', bank: 'ICICI Bank FC Road', status: 'RECEIVED' } },
  ];
  const recByNo: Record<string, any> = {};
  for (const r of recSpecs) {
    if (!r.cust) continue;
    let recRow = await knex('collection_receipts').where({ receipt_no: r.receipt_no }).first();
    if (!recRow) {
      [recRow] = await knex('collection_receipts')
        .insert({
          site_id: r.site_id,
          customer_id: r.cust.id,
          receipt_no: r.receipt_no,
          amount: r.amount.toFixed(2),
          on_account_amount: '0.00',
          payment_mode: r.mode,
          reference_no: r.ref,
          collected_at: new Date(),
          collected_by_user_id: r.collector,
          idempotency_key: `seed-${r.receipt_no}`,
        })
        .returning('*');

      if (r.inv) {
        await knex('receipt_allocations').insert({
          receipt_id: recRow.id,
          invoice_id: r.inv.id,
          allocated_amount: r.amount.toFixed(2),
        });
      }

      if (r.chq) {
        await knex('cheque_register').insert({
          receipt_id: recRow.id,
          cheque_no: r.chq.no,
          bank: r.chq.bank,
          cheque_date: today,
          amount: r.amount.toFixed(2),
          status: r.chq.status,
          deposited_on: r.chq.status === 'DEPOSITED' ? today : null,
          deposited_at: r.chq.status === 'DEPOSITED' ? new Date() : null,
          deposited_by: r.chq.status === 'DEPOSITED' ? opsId : null,
          deposit_slip_no: r.chq.status === 'DEPOSITED' ? 'DEP-2611-01' : null,
        });
      }

      await knex('custody_ledger').insert({
        user_id: r.collector,
        site_id: r.site_id,
        entry_type: r.mode === 'CASH' ? 'CASH_COLLECTED' : `${r.mode}_COLLECTED`,
        amount_delta: r.amount.toFixed(2),
        receipt_id: recRow.id,
        running_balance: r.amount.toFixed(2),
      });
    }
    recByNo[r.receipt_no] = recRow;
  }

  // Credit Note
  if (cust4 && curd && so4) {
    const cnExists = await knex('credit_notes').where({ credit_note_no: 'CN-2611-0001', site_id: factorySiteId }).first();
    if (!cnExists) {
      const [cn] = await knex('credit_notes')
        .insert({
          credit_note_no: 'CN-2611-0001',
          site_id: factorySiteId,
          customer_id: cust4.id,
          order_id: so4.id,
          status: 'ISSUED',
          reason_type: 'RETURNED',
          total_debit: '3650.00',
          status_reason: 'Customer returned 10kg curd with seal damage.',
          created_by: opsId,
          updated_by: ownerId,
          approved_by: ownerId,
          approved_at: new Date(),
        })
        .returning('*');
      await knex('credit_note_lines').insert({
        credit_note_id: cn.id,
        order_id: so4.id,
        item_id: curd.id,
        debited_qty: 10,
        unit_price: '365.00',
        total_debit: '3650.00',
        reason: 'Damaged lid seal on morning trip.',
      });
    }
  }

  // Priority Collections Worklist
  const wlExists = await knex('worklist_worklists').where({ site_id: factorySiteId, date: today }).first();
  if (!wlExists && cust1 && cust2 && cust4) {
    const [wl] = await knex('worklist_worklists')
      .insert({
        site_id: factorySiteId,
        date: today,
        total_customers: 3,
        total_overdue_amount: '158800.00',
        status: 'ACTIVE',
      })
      .returning('*');
    await knex('worklist_items').insert([
      { worklist_id: wl.id, customer_id: cust1.id, priority_score: 94.5, overdue_amount: '80000.00', days_overdue: 35, reasons: ['OVERDUE_30_PLUS', 'HIGH_UTILIZATION'], assigned_to: collectorId, route_order: 1, status: 'PENDING' },
      { worklist_id: wl.id, customer_id: cust2.id, priority_score: 76.0, overdue_amount: '45000.00', days_overdue: 10, reasons: ['OVERDUE_8_15'], assigned_to: collectorId, route_order: 2, status: 'PENDING' },
      { worklist_id: wl.id, customer_id: cust4.id, priority_score: 62.0, overdue_amount: '33800.00', days_overdue: 2, reasons: ['FOLLOWUP_DUE'], assigned_to: collectorId, route_order: 3, status: 'COMPLETED' },
    ]);
  }

  // Tally Export Batch & Items
  const tallyExists = await knex('tally_export_batches').where({ batch_no: 'TALLY-2611-0001' }).first();
  if (!tallyExists && invByNo['INV-2611-0001'] && recByNo['REC-2611-0001']) {
    const [tb] = await knex('tally_export_batches')
      .insert({
        batch_no: 'TALLY-2611-0001',
        batch_date: today,
        status: 'COMPLETED',
        total_vouchers: 2,
        xml_content: '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER></ENVELOPE>',
        created_by: ownerId,
        updated_by: ownerId,
      })
      .returning('*');
    await knex('tally_export_items')
      .insert([
        { batch_id: tb.id, voucher_type: 'SALES', voucher_ref_id: invByNo['INV-2611-0001'].id, voucher_ref_no: 'INV-2611-0001', voucher_date: today, amount: '55000.00' },
        { batch_id: tb.id, voucher_type: 'RECEIPT', voucher_ref_id: recByNo['REC-2611-0001'].id, voucher_ref_no: 'REC-2611-0001', voucher_date: today, amount: '10000.00' },
      ])
      .onConflict(['voucher_type', 'voucher_ref_id'])
      .ignore();
  }

  // Previous day EOD closing record
  const yesterday = isoDateOffset(-1);
  await knex('eod_closings')
    .insert({
      site_id: factorySiteId,
      date: yesterday,
      all_trips_closed: true,
      all_cash_handed_over: true,
      uninvoiced_deliveries: 0,
      net_cash_position: '28450.00',
      signed_off_by_user_id: ownerId,
      signed_off_at: new Date(Date.now() - 14 * 3600 * 1000),
      status: 'SIGNED_OFF',
    })
    .onConflict(['site_id', 'date'])
    .ignore();
}

async function main(): Promise<void> {
  const knex = await createKnex();
  try {
    // Bypass PostgreSQL FORCE RLS while seeding initial database records
    await knex.raw("SELECT set_config('app.role', 'OWNER', false)");
    await knex.raw("SELECT set_config('app.current_user_role', 'OWNER', false)");

    // 1. Sites
    const siteIds: string[] = [];
    for (const site of SITES) {
      const id = await upsertSite(knex, site);
      siteIds.push(id);
      console.log(`[seed] site: ${site.name} (${id})`);
    }

    await knex.raw("SELECT set_config('app.site_ids', ?, false)", [siteIds.join(',')]);
    await knex.raw("SELECT set_config('app.current_site_id', ?, false)", [siteIds[0]]);

    // 2. Users
    const userIds: Record<string, string> = {};
    for (const user of USERS) {
      const id = await upsertUser(
        knex,
        user,
        siteIds[user.assigned_site_index],
      );
      userIds[user.phone] = id;
      console.log(`[seed] user: ${user.phone} (${user.role}) -> ${id}`);
    }

    // 3. Primary + multi-site access + RBAC permissions
    for (const userId of Object.values(userIds)) {
      const dbUser = await knex('users').where('id', userId).first('assigned_site_id');
      if (dbUser?.assigned_site_id) {
        await upsertSiteAccess(knex, userId, String(dbUser.assigned_site_id));
      }
    }
    for (const access of SITE_ACCESS) {
      const userId = userIds[access.phone];
      if (!userId) continue;
      await upsertSiteAccess(knex, userId, siteIds[access.site_index]);
      console.log(
        `[seed] site-access: ${access.phone} -> site ${access.site_index}`,
      );
    }
    await upsertRolePermissions(knex);

    // 4. Approval policies, Customers, Items, Daily Prices, Sales Orders, and Operational M1-M7 Data
    const ownerId = userIds['+919876543210'];
    const opsId = userIds['+919876543211'];
    await upsertApprovalPolicies(knex);
    await seedCustomersAndItems(knex, siteIds, ownerId, opsId);
    await seedOperationalData(knex, siteIds, userIds);

    // 5. Refresh ALL M7b materialized views
    const matViews = [
      'mv_pulse_today',
      'mv_ops_status',
      'mv_inventory_alerts',
      'mv_customer_profitability',
      'mv_supplier_scorecard',
      'mv_yield_trend',
      'mv_ar_aging',
    ];
    for (const view of matViews) {
      try {
        await knex.raw(`REFRESH MATERIALIZED VIEW ${view}`);
      } catch (err) {
        console.warn(`[seed] skipped refreshing ${view}:`, (err as Error).message);
      }
    }

    // 6. Verify counts
    const tablesToCheck = [
      'sites',
      'users',
      'user_site_access',
      'role_permissions',
      'business_rule_config',
      'customers',
      'items',
      'daily_price_lists',
      'quotes',
      'sales_orders',
      'suppliers',
      'purchase_orders',
      'goods_receipts',
      'supplier_bills',
      'locations',
      'inventory_batches',
      'bom_headers',
      'production_work_orders',
      'vehicles',
      'delivery_trips',
      'invoices',
      'collection_receipts',
      'cheque_register',
      'credit_notes',
      'tally_export_batches',
      'exception_approvals',
    ];
    const countsObj: Record<string, number> = {};
    for (const tbl of tablesToCheck) {
      const row = await knex(tbl).count('* as c').first();
      countsObj[tbl] = Number(row?.c ?? 0);
    }
    console.log('[seed] counts:', countsObj);

    console.log('[seed] done');
  } finally {
    await knex.destroy();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
