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

// OPS_COORD also has access to the warehouse (multi-site example)
const SITE_ACCESS: { phone: string; site_index: number }[] = [
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
  const existing = await knex('users').where('phone', user.phone).first();
  if (existing) return String(existing.id);

  const pinHash = await bcrypt.hash(user.pin, 10);
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

async function main(): Promise<void> {
  const knex = await createKnex();
  try {
    // Bypass PostgreSQL FORCE RLS while seeding initial database records
    await knex.raw("SELECT set_config('app.role', 'OWNER', false)");

    // 1. Sites
    const siteIds: string[] = [];
    for (const site of SITES) {
      const id = await upsertSite(knex, site);
      siteIds.push(id);
      console.log(`[seed] site: ${site.name} (${id})`);
    }

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

    // 3. Multi-site access
    for (const access of SITE_ACCESS) {
      const userId = userIds[access.phone];
      if (!userId) continue;
      await upsertSiteAccess(knex, userId, siteIds[access.site_index]);
      console.log(
        `[seed] site-access: ${access.phone} -> site ${access.site_index}`,
      );
    }

    // 4. Approval policies, Customers, Items, Daily Prices, and Sales Orders
    const ownerId = userIds['+919876543210'];
    const opsId = userIds['+919876543211'];
    await upsertApprovalPolicies(knex);
    await seedCustomersAndItems(knex, siteIds, ownerId, opsId);

    // 5. Refresh M7b materialized views
    for (const view of ['mv_pulse_today', 'mv_ops_status']) {
      try {
        await knex.raw(`REFRESH MATERIALIZED VIEW ${view}`);
      } catch (err) {
        console.warn(`[seed] skipped refreshing ${view}:`, (err as Error).message);
      }
    }

    // 6. Verify counts
    const counts = await Promise.all([
      knex('sites').count('* as c').first(),
      knex('users').count('* as c').first(),
      knex('user_site_access').count('* as c').first(),
      knex('role_permissions').count('* as c').first(),
      knex('business_rule_config').count('* as c').first(),
      knex('customers').count('* as c').first(),
      knex('items').count('* as c').first(),
      knex('daily_price_lists').count('* as c').first(),
      knex('sales_orders').count('* as c').first(),
    ]);
    console.log('[seed] counts:', {
      sites: Number(counts[0]?.c ?? 0),
      users: Number(counts[1]?.c ?? 0),
      site_access: Number(counts[2]?.c ?? 0),
      role_permissions: Number(counts[3]?.c ?? 0),
      business_rule_config: Number(counts[4]?.c ?? 0),
      customers: Number(counts[5]?.c ?? 0),
      items: Number(counts[6]?.c ?? 0),
      daily_price_lists: Number(counts[7]?.c ?? 0),
      sales_orders: Number(counts[8]?.c ?? 0),
    });

    console.log('[seed] done');
  } finally {
    await knex.destroy();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
