/**
 * Clean Client Workspace Bootstrap Script
 *
 * Idempotently creates ONLY the initial client site, default site locations,
 * and initial OWNER user so a fresh production/pre-production database can be
 * accessed without loading demo/test transactions.
 *
 * Usage:
 *   node dist/scripts/bootstrap-client.js
 */

import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { createKnex } from '../shared/database/knex-instance.js';

const VALID_SITE_TYPES = new Set(['FACTORY', 'WAREHOUSE', 'OFFICE']);

async function main(): Promise<void> {
  const siteName =
    process.env.BOOTSTRAP_SITE_NAME?.trim() || 'Primary Office & Warehouse';
  const rawSiteType = (
    process.env.BOOTSTRAP_SITE_TYPE?.trim() || 'OFFICE'
  ).toUpperCase();
  const siteType = VALID_SITE_TYPES.has(rawSiteType) ? rawSiteType : 'OFFICE';
  const siteAddress =
    process.env.BOOTSTRAP_SITE_ADDRESS?.trim() || 'Head Office';

  const ownerName =
    process.env.BOOTSTRAP_OWNER_NAME?.trim() || 'System Owner';
  const ownerPhone =
    process.env.BOOTSTRAP_OWNER_PHONE?.trim() || '+919999999999';
  const ownerPin =
    process.env.BOOTSTRAP_OWNER_PIN?.trim() || '123456';

  const knex = await createKnex();
  try {
    await knex.transaction(async (trx) => {
      // 1. Ensure at least one site exists
      let site = await trx('sites').orderBy('created_at', 'asc').first('id', 'name');
      if (!site) {
        const [insertedSite] = await trx('sites')
          .insert({
            name: siteName,
            site_code: 'MAIN-01',
            site_type: siteType,
            address: siteAddress,
            is_fulfillment_site: true,
            is_active: true,
          })
          .returning(['id', 'name']);
        site = insertedSite;

        const defaultLocations = [
          { name: `${siteName} — RM Store`, location_type: 'RAW_MATERIAL_STORE' },
          { name: `${siteName} — FG Store`, location_type: 'FINISHED_GOODS_STORE' },
          { name: `${siteName} — Main Warehouse`, location_type: 'TRADING_WAREHOUSE' },
          { name: `${siteName} — Office`, location_type: 'OFFICE' },
        ];
        await trx('locations').insert(
          defaultLocations.map((loc) => ({
            site_id: site.id,
            name: loc.name,
            location_type: loc.location_type,
            is_active: true,
          })),
        );
        console.log(`[bootstrap-client] Created initial site: ${site.name} (${site.id})`);
      }

      // 2. Ensure at least one OWNER user exists
      let owner = await trx('users')
        .where({ role: 'OWNER' })
        .orderBy('created_at', 'asc')
        .first('id', 'phone');

      if (!owner) {
        const pinHash = await bcrypt.hash(ownerPin, 10);
        const existingByPhone = await trx('users')
          .where({ phone: ownerPhone })
          .first('id', 'phone');

        if (existingByPhone) {
          const [updated] = await trx('users')
            .where({ id: existingByPhone.id })
            .update({
              full_name: ownerName,
              role: 'OWNER',
              assigned_site_id: site.id,
              pin_hash: pinHash,
              password_hash: pinHash,
              is_active: true,
            })
            .returning(['id', 'phone']);
          owner = updated;
        } else {
          const [insertedOwner] = await trx('users')
            .insert({
              full_name: ownerName,
              phone: ownerPhone,
              role: 'OWNER',
              assigned_site_id: site.id,
              pin_hash: pinHash,
              password_hash: pinHash,
              is_active: true,
            })
            .returning(['id', 'phone']);
          owner = insertedOwner;
        }
        console.log(`[bootstrap-client] Created initial OWNER user: ${owner.phone}`);
      }

      // 3. Ensure OWNER has site access to the primary site
      await trx('user_site_access')
        .insert({
          user_id: owner.id,
          site_id: site.id,
          granted_by: owner.id,
        })
        .onConflict(['user_id', 'site_id'])
        .ignore();
    });

    console.log('[bootstrap-client] Client workspace ready (0 demo transactions inserted)');
  } finally {
    await knex.destroy();
  }
}

main().catch((err) => {
  console.error('[bootstrap-client] failed:', err);
  process.exit(1);
});
