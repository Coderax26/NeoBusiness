import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { setupTestDB } from '../../m3-inventory/tests/test-setup.js';
import { ConfigService } from '../config.service.js';
import type { Knex } from 'knex';

describe('Phase P2 — Business Decisions and Requirements Closure (OD-001 to OD-025)', () => {
  let context: Awaited<ReturnType<typeof setupTestDB>>;
  let knex: Knex;
  let configService: ConfigService;

  beforeAll(async () => {
    context = await setupTestDB();
    knex = context.knex;
    configService = new ConfigService(knex);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  describe('Configuration Defaults in business_rule_config', () => {
    it('OD-001: Minimum margin percentage is 10% gross default', async () => {
      const minMargin = await configService.getNumber('min_margin_pct_default');
      expect(minMargin).toBe(0.10);
    });

    it('OD-002: Owner escalation value threshold is 5,000 INR', async () => {
      const threshold = await configService.getNumber('owner_escalation_value_inr');
      expect(threshold).toBe(5000);
    });

    it('OD-004: e-Invoicing is disabled for MVP (einvoicing_enabled = false)', async () => {
      const enabled = await configService.get<boolean>('einvoicing_enabled');
      expect(enabled).toBe(false);
    });

    it('OD-005: e-Way bill consignment threshold is 50,000 INR', async () => {
      const threshold = await configService.getNumber('eway_bill_threshold_inr');
      expect(threshold).toBe(50000);
    });

    it('OD-006: OTP delivery channel defaults to SMS', async () => {
      const channel = await configService.getString('otp_channel_default');
      expect(channel).toBe('SMS');
    });

    it('OD-007: Multi-site coordinator is enabled', async () => {
      const enabled = await configService.get<boolean>('multisite_coordinator_enabled');
      expect(enabled).toBe(true);
    });

    it('OD-008: Default language is English ("en")', async () => {
      const lang = await configService.getString('default_language');
      expect(lang).toBe('en');
    });

    it('OD-009: Supplier price spike baseline is SAME_SUPPLIER_FIRST', async () => {
      const baseline = await configService.getString('supplier_price_spike_baseline');
      expect(baseline).toBe('SAME_SUPPLIER_FIRST');
    });

    it('OD-010: Backup supplier tolerance is 2%', async () => {
      const tolerance = await configService.getNumber('backup_supplier_tolerance_pct');
      expect(tolerance).toBe(2);
    });

    it('OD-011: Landed cost freight allocation is NONE_MVP', async () => {
      const mode = await configService.getString('landed_cost_freight_allocation');
      expect(mode).toBe('NONE_MVP');
    });

    it('OD-012: Yield variance basis is ISSUED_RAW_MATERIAL and tolerance is 3%', async () => {
      const basis = await configService.getString('yield_variance_basis');
      const tolerance = await configService.getNumber('yield_variance_tolerance_pct');
      expect(basis).toBe('ISSUED_RAW_MATERIAL');
      expect(tolerance).toBe(3);
    });

    it('OD-013: Production mode is MAKE_TO_ORDER_PRIMARY', async () => {
      const mode = await configService.getString('production_mode');
      expect(mode).toBe('MAKE_TO_ORDER_PRIMARY');
    });

    it('OD-014: ePOD OTP is not mandatory in MVP (epod_otp_required = false)', async () => {
      const required = await configService.get<boolean>('epod_otp_required');
      expect(required).toBe(false);
    });

    it('OD-015: Custody wallet scope is CASH_AND_CHEQUE only', async () => {
      const scope = await configService.getString('custody_wallet_scope');
      expect(scope).toBe('CASH_AND_CHEQUE');
    });

    it('OD-016: Handover cashier role is OPS_COORD', async () => {
      const role = await configService.getString('handover_cashier_role');
      expect(role).toBe('OPS_COORD');
    });

    it('OD-017: Invoice receipt allocation policy is FIFO', async () => {
      const policy = await configService.getString('invoice_allocation_policy');
      expect(policy).toBe('FIFO');
    });

    it('OD-018: Accounting bridge target is TALLY_PRIME', async () => {
      const target = await configService.getString('accounting_bridge_target');
      expect(target).toBe('TALLY_PRIME');
    });

    it('OD-019: Escalation wait minutes is 60', async () => {
      const wait = await configService.getNumber('escalation_wait_minutes');
      expect(wait).toBe(60);
    });

    it('OD-020: Today sales definition is TAX_INVOICES_ISSUED', async () => {
      const def = await configService.getString('todays_sales_definition');
      expect(def).toBe('TAX_INVOICES_ISSUED');
    });

    it('OD-021: Dashboard refresh interval is 30 seconds', async () => {
      const interval = await configService.getNumber('dashboard_refresh_interval_seconds');
      expect(interval).toBe(30);
    });

    it('OD-022: WhatsApp BSP adapter is PLUGGABLE_SMS_FALLBACK', async () => {
      const adapter = await configService.getString('whatsapp_bsp_adapter');
      expect(adapter).toBe('PLUGGABLE_SMS_FALLBACK');
    });

    it('OD-024: Standing customer prices undercutting floor are disabled in MVP', async () => {
      const enabled = await configService.get<boolean>('standing_customer_prices_enabled');
      expect(enabled).toBe(false);
    });

    it('OD-025: Inter-site order fulfillment is SINGLE_SITE_MVP', async () => {
      const mode = await configService.getString('intersite_order_fulfillment');
      expect(mode).toBe('SINGLE_SITE_MVP');
    });

    it('Supplier Bill auto-approve cap is 25,000 INR for MATCHED bills', async () => {
      const cap = await configService.getNumber('supplier_bill_auto_approve_cap_inr');
      expect(cap).toBe(25000);
    });
  });

  describe('Permission & Role Governance (OD-007, OD-016)', () => {
    it('OD-016: verifies OPS_COORD and OWNER possess receipt.verify_handover permission', async () => {
      const permissions = await knex('role_permissions')
        .where('permission_code', 'receipt.verify_handover')
        .select('role', 'scope');

      const roles = permissions.map((p) => p.role);
      expect(roles).toContain('OPS_COORD');
      expect(roles).toContain('OWNER');
    });

    it('OD-007: allows coordinator multi-site mapping in user_site_access table', async () => {
      const testCoordinatorId = uuidv4();
      const siteBId = uuidv4();

      await knex('sites').insert({
        id: siteBId,
        name: 'Phase P2 Second Site',
        site_type: 'WAREHOUSE',
        address: 'Site B Industrial Area',
      });

      await knex('users').insert({
        id: testCoordinatorId,
        full_name: 'Multi-Site Coordinator',
        phone: `+9199${uuidv4().replace(/\D/g, '').slice(0, 10)}`,
        role: 'OPS_COORD',
        assigned_site_id: context.siteId,
      });

      // Grant access to secondary site
      await knex('user_site_access').insert({
        user_id: testCoordinatorId,
        site_id: siteBId,
      });

      const accessRows = await knex('user_site_access')
        .where('user_id', testCoordinatorId)
        .select('site_id');

      expect(accessRows.length).toBe(1);
      expect(accessRows[0].site_id).toBe(siteBId);

      // Clean up
      await knex('user_site_access').where('user_id', testCoordinatorId).del();
      await knex('users').where('id', testCoordinatorId).del();
      await knex('sites').where('id', siteBId).del();
    });
  });

  describe('Opening Balance Import State Machine (OD-023)', () => {
    it('OD-023: enforces DRAFT -> SIGNED_OFF -> IMPORTED -> REVERSED lifecycle', async () => {
      const importId = uuidv4();
      const cutoffDate = '2026-10-31';

      // 1. Insert DRAFT import batch
      const [draft] = await knex('opening_balance_imports')
        .insert({
          id: importId,
          import_type: 'CUSTOMER_AR',
          cut_off_date: cutoffDate,
          status: 'DRAFT',
          row_count: 10,
          total_value: 150000.00,
        })
        .returning('*');

      expect(draft.status).toBe('DRAFT');

      // 2. Accountant / Owner signs off
      await knex('opening_balance_imports')
        .where('id', importId)
        .update({
          status: 'SIGNED_OFF',
          signed_off_at: new Date(),
          signed_off_by: context.ownerId,
        });

      const signedOff = await knex('opening_balance_imports')
        .where('id', importId)
        .first();
      expect(signedOff.status).toBe('SIGNED_OFF');
      expect(signedOff.signed_off_by).toBe(context.ownerId);

      // 3. Execution moves to IMPORTED
      await knex('opening_balance_imports')
        .where('id', importId)
        .update({
          status: 'IMPORTED',
          imported_at: new Date(),
          imported_by: context.ownerId,
        });

      const imported = await knex('opening_balance_imports')
        .where('id', importId)
        .first();
      expect(imported.status).toBe('IMPORTED');

      // 4. Equal and opposite reversal moves to REVERSED
      await knex('opening_balance_imports')
        .where('id', importId)
        .update({
          status: 'REVERSED',
          reversed_at: new Date(),
          reversed_by: context.ownerId,
        });

      const reversed = await knex('opening_balance_imports')
        .where('id', importId)
        .first();
      expect(reversed.status).toBe('REVERSED');

      // Clean up
      await knex('opening_balance_imports').where('id', importId).del();
    });
  });
});
