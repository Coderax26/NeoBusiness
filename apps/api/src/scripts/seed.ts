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

async function upsertSite(knex: Knex, site: (typeof SITES)[number]): Promise<string> {
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
  await knex('user_site_access').insert({ user_id: userId, site_id: siteId }).onConflict(['user_id', 'site_id']).ignore();
}

async function main(): Promise<void> {
  const knex = await createKnex();
  try {
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
      const id = await upsertUser(knex, user, siteIds[user.assigned_site_index]);
      userIds[user.phone] = id;
      console.log(`[seed] user: ${user.phone} (${user.role}) -> ${id}`);
    }

    // 3. Multi-site access
    for (const access of SITE_ACCESS) {
      const userId = userIds[access.phone];
      if (!userId) continue;
      await upsertSiteAccess(knex, userId, siteIds[access.site_index]);
      console.log(`[seed] site-access: ${access.phone} -> site ${access.site_index}`);
    }

    // 4. Verify counts
    const counts = await Promise.all([
      knex('sites').count('* as c').first(),
      knex('users').count('* as c').first(),
      knex('user_site_access').count('* as c').first(),
      knex('role_permissions').count('* as c').first(),
      knex('business_rule_config').count('* as c').first(),
    ]);
    console.log('[seed] counts:', {
      sites: Number(counts[0]?.c ?? 0),
      users: Number(counts[1]?.c ?? 0),
      site_access: Number(counts[2]?.c ?? 0),
      role_permissions: Number(counts[3]?.c ?? 0),
      business_rule_config: Number(counts[4]?.c ?? 0),
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