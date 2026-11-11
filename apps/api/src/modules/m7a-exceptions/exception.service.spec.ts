import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Knex } from 'knex';
import { ExceptionService } from './exception.service.js';
import { NotificationService } from './notification.service.js';
import { createKnex } from '../../shared/database/knex-instance.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { NOTIFY_PORT } from '../../shared/ports/ports.interface.js';
import type {
  ExceptionPayload,
  ExceptionType,
} from '../../shared/ports/ports.interface.js';

describe('ExceptionService', () => {
  let knex: Knex;
  let exceptionSvc: ExceptionService;
  let notificationSvc: NotificationService;
  let configSvc: ConfigService;
  let outbox: OutboxService;

  // Test users (from seed)
  let ownerId: string;
  let opsCoordId: string;
  let storekeeperId: string;
  let siteId: string;

  const samplePayload: ExceptionPayload = {
    title: 'Price override requested',
    summary: 'Item PRD-001 price override from ₹92.00 to ₹89.00',
    facts: [
      { label: 'Item', value: 'PRD-001' },
      { label: 'Current Price', value: '92.00' },
      { label: 'Requested Price', value: '89.00' },
    ],
    impact: 'Margin drops from 10.9% to 7.9%',
    actions: [
      { code: 'APPROVE', label: 'Approve ₹89.00' },
      { code: 'REJECT', label: 'Reject — keep ₹92.00' },
      { code: 'COUNTER', label: 'Counter at ₹90.50' },
    ],
    valueAtRisk: '5000.00',
  };

  // Helper to parse payload_json (Knex returns JSONB as already-parsed objects)
  const parsePayload = (row: any) => {
    return typeof row.payload_json === 'string'
      ? JSON.parse(row.payload_json)
      : row.payload_json;
  };

  beforeAll(async () => {
    knex = await createKnex();

    // Run migrations to ensure schema is up to date
    const { MigrationService } =
      await import('../m0-platform/migration.service.js');
    const migrationService = new MigrationService(knex);
    await migrationService.runMigrations();

    // Seed approval policies (required for ExceptionService)
    await knex('approval_policies')
      .insert([
        {
          exception_type: 'PRICE_OVERRIDE',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'CREDIT_BREACH',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'SUPPLIER_PRICE_SPIKE',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'SUPPLIER_SHORTFALL',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'ALLOCATION',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'YIELD_VARIANCE',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'WASTAGE_WRITEOFF',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'STOCK_VARIANCE',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'CREDIT_REBATE_WRITEOFF',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'DELIVERY_DISPUTE',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 30,
        },
        {
          exception_type: 'MANUAL_LEDGER_ADJUSTMENT',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'CASH_HANDOVER_VARIANCE',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 30,
        },
      ])
      .onConflict('exception_type')
      .ignore();

    // Load test users
    // Use the factory site where the seeded OWNER has assigned_site_id access
    const factorySite = await knex('sites')
      .where('site_type', 'FACTORY')
      .first('id');

    if (!factorySite) throw new Error('Factory site not found in database');

    const owner = await knex('users')
      .where('role', 'OWNER')
      .andWhere('assigned_site_id', factorySite.id)
      .first('id');
    const opsCoord = await knex('users').where('role', 'OPS_COORD').first('id');
    const storekeeper = await knex('users')
      .where('role', 'STOREKEEPER')
      .first('id');

    if (!owner)
      throw new Error('OWNER user not found in database at factory site');
    if (!opsCoord) throw new Error('OPS_COORD user not found in database');
    // STOREKEEPER may not exist in seed; use coordinator as fallback
    if (!storekeeper) {
      console.warn('STOREKEEPER user not found, using OPS_COORD as fallback');
    }

    ownerId = String(owner.id);
    opsCoordId = String(opsCoord.id);
    storekeeperId = storekeeper ? String(storekeeper.id) : opsCoordId;
    // Use the factory site where OWNER has access
    siteId = String(factorySite.id);

    // Initialize services
    configSvc = new ConfigService(knex);
    await configSvc.onModuleInit();
    outbox = new OutboxService(knex);
    notificationSvc = new NotificationService(knex);
    exceptionSvc = new ExceptionService(
      knex,
      configSvc,
      outbox,
      notificationSvc,
    );
    await exceptionSvc.onModuleInit();
  });

  afterAll(async () => {
    await knex?.destroy();
  });

  beforeEach(async () => {
    // Clean up any test exception cards (delete child rows first due to FK)
    const testCardIds = await knex('exception_approvals')
      .where('reference_table', 'test_orders')
      .select('id');
    if (testCardIds.length > 0) {
      await knex('exception_events')
        .whereIn(
          'exception_id',
          testCardIds.map((r) => r.id),
        )
        .del();
    }
    await knex('exception_approvals')
      .where('reference_table', 'test_orders')
      .del();

    // Also clean up test cards with other reference tables used by tests
    const otherCardIds = await knex('exception_approvals')
      .whereIn('reference_table', [
        'test_pos',
        'test_allocations',
        'test_workorders',
        'test_wastage',
      ])
      .select('id');
    if (otherCardIds.length > 0) {
      await knex('exception_events')
        .whereIn(
          'exception_id',
          otherCardIds.map((r) => r.id),
        )
        .del();
    }
    await knex('exception_approvals')
      .whereIn('reference_table', [
        'test_pos',
        'test_allocations',
        'test_workorders',
        'test_wastage',
      ])
      .del();

    // Clean up test notification outbox
    await knex('notification_outbox').where('recipient_ref', ownerId).del();
  });

  describe('raise()', () => {
    it('creates a new PENDING exception card and returns its UUID', async () => {
      const id = await exceptionSvc.raise(
        'PRICE_OVERRIDE' as ExceptionType,
        'test_orders',
        'ORD-001',
        ownerId,
        samplePayload,
        siteId,
        { priority: 'HIGH' },
      );

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(36); // UUIDv4 length

      // Verify the card was created
      const card = await knex('exception_approvals').where({ id }).first();
      expect(card).toBeDefined();
      expect(card.exception_type).toBe('PRICE_OVERRIDE');
      expect(card.reference_table).toBe('test_orders');
      expect(card.reference_id).toBe('ORD-001');
      expect(card.requested_by).toBe(ownerId);
      expect(card.site_id).toBe(siteId);
      expect(card.status).toBe('PENDING');
      expect(card.priority).toBe('HIGH');
      expect(Number(card.value_at_risk)).toBe(5000);
      expect(card.expires_at).toBeDefined();
    });

    it('is idempotent — raising same (type, ref_table, ref_id) returns existing card', async () => {
      const id1 = await exceptionSvc.raise(
        'CREDIT_BREACH' as ExceptionType,
        'test_orders',
        'ORD-002',
        ownerId,
        samplePayload,
        siteId,
      );

      const id2 = await exceptionSvc.raise(
        'CREDIT_BREACH' as ExceptionType,
        'test_orders',
        'ORD-002',
        ownerId,
        samplePayload,
        siteId,
      );

      expect(id2).toBe(id1);

      // Only one PENDING card should exist
      const count = await knex('exception_approvals')
        .where({
          exception_type: 'CREDIT_BREACH',
          reference_table: 'test_orders',
          reference_id: 'ORD-002',
          status: 'PENDING',
        })
        .count('* as cnt')
        .first();
      expect(Number(count?.cnt ?? 0)).toBe(1);
    });

    it('looks up approval policy and sets expires_at based on auto_expire_minutes', async () => {
      const id = await exceptionSvc.raise(
        'PRICE_OVERRIDE' as ExceptionType,
        'test_orders',
        'ORD-003',
        ownerId,
        samplePayload,
        siteId,
      );

      const card = await knex('exception_approvals').where({ id }).first();
      const policy = await knex('approval_policies')
        .where({ exception_type: 'PRICE_OVERRIDE' })
        .first();

      const expectedExpiry = new Date(
        card.created_at.getTime() +
          Number(policy.escalation_wait_minutes) * 60_000,
      );
      // Allow up to 60 seconds tolerance for test execution time
      expect(
        Math.abs(card.expires_at.getTime() - expectedExpiry.getTime()),
      ).toBeLessThan(60_000);
    });

    it('emits exception.requested domain event via OutboxService', async () => {
      const id = await exceptionSvc.raise(
        'SUPPLIER_PRICE_SPIKE' as ExceptionType,
        'test_pos',
        'PO-001',
        opsCoordId,
        { ...samplePayload, title: 'Supplier price spike' },
        siteId,
      );

      const events = await knex('outbox_events')
        .where({ event_type: 'exception.requested', aggregate_id: id })
        .select('*');

      expect(events.length).toBe(1);
      const payload =
        typeof events[0].payload === 'string'
          ? JSON.parse(events[0].payload)
          : events[0].payload;
      expect(payload.exceptionType).toBe('SUPPLIER_PRICE_SPIKE');
      expect(payload.referenceTable).toBe('test_pos');
      expect(payload.referenceId).toBe('PO-001');
      expect(events[0].module_source).toBe('m7');
    });

    it('queues FCM + in-app notifications for the approver', async () => {
      const id = await exceptionSvc.raise(
        'PRICE_OVERRIDE' as ExceptionType,
        'test_orders',
        'ORD-004',
        ownerId,
        samplePayload,
        siteId,
      );

      const notifications = await knex('notification_outbox')
        .where({ recipient_ref: ownerId })
        .whereIn('template_code', ['exception_card_push', 'in_app_exception']);

      expect(notifications.length).toBeGreaterThanOrEqual(1);
      const channels = notifications.map((n) => n.channel);
      expect(channels).toContain('IN_APP');
    });
  });

  describe('resolve()', () => {
    it('resolves a PENDING card to APPROVED', async () => {
      const id = await exceptionSvc.raise(
        'PRICE_OVERRIDE' as ExceptionType,
        'test_orders',
        'ORD-005',
        ownerId,
        samplePayload,
        siteId,
      );

      const status = await exceptionSvc.resolve(
        id,
        'APPROVED',
        'Approved by owner',
        { proposedPrice: '89.00' },
      );

      expect(status).toBe('APPROVED');

      const card = await knex('exception_approvals').where({ id }).first();
      expect(card.status).toBe('APPROVED');
      expect(card.resolved_by).toBe(ownerId);
      expect(card.resolved_at).toBeDefined();
      expect(card.owner_remarks).toBe('Approved by owner');
    });

    it('resolves a PENDING card to REJECTED', async () => {
      const id = await exceptionSvc.raise(
        'CREDIT_BREACH' as ExceptionType,
        'test_orders',
        'ORD-006',
        ownerId,
        samplePayload,
        siteId,
      );

      const status = await exceptionSvc.resolve(
        id,
        'REJECTED',
        'Customer credit limit exceeded',
      );

      expect(status).toBe('REJECTED');

      const card = await knex('exception_approvals').where({ id }).first();
      expect(card.status).toBe('REJECTED');
    });

    it('resolves a PENDING card to COUNTERED with counterJson', async () => {
      const id = await exceptionSvc.raise(
        'PRICE_OVERRIDE' as ExceptionType,
        'test_orders',
        'ORD-007',
        ownerId,
        samplePayload,
        siteId,
      );

      const counterJson = { proposedPrice: '90.50', reason: 'Meeting halfway' };
      const status = await exceptionSvc.resolve(
        id,
        'COUNTERED',
        'Countered at 90.50',
        counterJson,
      );

      expect(status).toBe('COUNTERED');

      const card = await knex('exception_approvals').where({ id }).first();
      expect(card.status).toBe('COUNTERED');
    });

    it('is idempotent — resolving an already resolved card returns current status', async () => {
      const id = await exceptionSvc.raise(
        'PRICE_OVERRIDE' as ExceptionType,
        'test_orders',
        'ORD-008',
        ownerId,
        samplePayload,
        siteId,
      );

      await exceptionSvc.resolve(id, 'APPROVED', 'First resolution');
      const status2 = await exceptionSvc.resolve(
        id,
        'REJECTED',
        'Attempt to reject',
      );

      expect(status2).toBe('APPROVED'); // original status unchanged
    });

    it('writes exception_events RESOLVED row', async () => {
      const id = await exceptionSvc.raise(
        'ALLOCATION' as ExceptionType,
        'test_allocations',
        'ALLOC-001',
        ownerId,
        samplePayload,
        siteId,
      );

      await exceptionSvc.resolve(id, 'APPROVED', 'Approved');

      const events = await knex('exception_events')
        .where({ exception_id: id, event: 'RESOLVED' })
        .select('*');

      expect(events.length).toBe(1);
      const meta =
        typeof events[0].metadata_json === 'string'
          ? JSON.parse(events[0].metadata_json)
          : events[0].metadata_json;
      expect(meta.action).toBe('APPROVED');
      expect(meta.counter).toBeNull();
    });

    it('emits exception.resolved domain event via OutboxService', async () => {
      const id = await exceptionSvc.raise(
        'YIELD_VARIANCE' as ExceptionType,
        'test_workorders',
        'WO-001',
        ownerId,
        samplePayload,
        siteId,
      );

      await exceptionSvc.resolve(id, 'APPROVED', 'Approved');

      const events = await knex('outbox_events')
        .where({
          event_type: 'exception.resolved',
          aggregate_id: 'YIELD_VARIANCE',
        })
        .select('*');

      // Find the event whose payload references our exception id
      const matching = events.filter((e: any) => {
        const p =
          typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
        return p.exceptionId === id;
      });

      expect(matching.length).toBe(1);
      const payload =
        typeof matching[0].payload === 'string'
          ? JSON.parse(matching[0].payload)
          : matching[0].payload;
      expect(payload.exceptionId).toBe(id);
      expect(payload.exceptionType).toBe('YIELD_VARIANCE');
      expect(payload.action).toBe('APPROVED');
      expect(payload.resolvedBy).toBe(ownerId);
    });
  });

  describe('onResolved handler', () => {
    it('calls registered handler after resolution', async () => {
      const handlerCalls: Array<{ id: string; action: string }> = [];

      exceptionSvc.onResolved(
        'PRICE_OVERRIDE',
        async (exceptionId, action, _remarks, _counter) => {
          handlerCalls.push({ id: exceptionId, action });
        },
      );

      const id = await exceptionSvc.raise(
        'PRICE_OVERRIDE' as ExceptionType,
        'test_orders',
        'ORD-009',
        ownerId,
        samplePayload,
        siteId,
      );

      await exceptionSvc.resolve(id, 'APPROVED', 'Test handler');

      // Handler runs async — wait a tick
      await new Promise((r) => setTimeout(r, 50));

      expect(handlerCalls.length).toBe(1);
      expect(handlerCalls[0].id).toBe(id);
      expect(handlerCalls[0].action).toBe('APPROVED');
    });
  });

  describe('expireOrEscalate / sweepExpired', () => {
    it('expires a card with no delegate and marks EXPIRED', async () => {
      // Create a card with a past expires_at
      const [card] = await knex('exception_approvals')
        .insert({
          exception_type: 'WASTAGE_WRITEOFF',
          reference_table: 'test_wastage',
          reference_id: 'WASTE-001',
          requested_by: ownerId,
          site_id: siteId,
          context_payload_json: JSON.stringify(samplePayload),
          status: 'PENDING',
          priority: 'NORMAL',
          value_at_risk: 1000,
          expires_at: new Date(Date.now() - 60_000), // 1 min ago
        })
        .returning('id');

      await exceptionSvc.expireOrEscalate(String(card.id), 1000);

      const updated = await knex('exception_approvals')
        .where({ id: card.id })
        .first();
      expect(updated.status).toBe('EXPIRED');
    });

    it('escalates to delegate when policy allows and value under cap', async () => {
      // Ensure PRICE_OVERRIDE policy has delegate
      const policy = await knex('approval_policies')
        .where({ exception_type: 'PRICE_OVERRIDE' })
        .first();
      expect(policy.can_delegate).toBe(true);
      expect(policy.delegate_user_id).toBeDefined();

      // Set the delegate to the OWNER user (seed sets delegate_user_id to NULL)
      await knex('approval_policies')
        .where({ exception_type: 'PRICE_OVERRIDE' })
        .update({ delegate_user_id: ownerId });
      const policy2 = await knex('approval_policies')
        .where({ exception_type: 'PRICE_OVERRIDE' })
        .first();
      expect(policy2.delegate_user_id).toBe(ownerId);

      const [card] = await knex('exception_approvals')
        .insert({
          exception_type: 'PRICE_OVERRIDE',
          reference_table: 'test_orders',
          reference_id: 'ORD-010',
          requested_by: ownerId,
          site_id: siteId,
          context_payload_json: JSON.stringify(samplePayload),
          status: 'PENDING',
          priority: 'NORMAL',
          value_at_risk: 1000, // Under delegate cap
          expires_at: new Date(Date.now() - 60_000),
        })
        .returning('id');

      await exceptionSvc.expireOrEscalate(String(card.id), 1000);

      const updated = await knex('exception_approvals')
        .where({ id: card.id })
        .first();
      // Should be COUNTERED (escalation) with escalated_to set to delegate
      expect(updated.status).toBe('COUNTERED');
      expect(updated.escalated_to).toBe(policy2.delegate_user_id);
    });
  });
});
