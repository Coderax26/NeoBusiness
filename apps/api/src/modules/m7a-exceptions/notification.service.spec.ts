import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Knex } from 'knex';
import { NotificationService } from './notification.service.js';
import { createKnex } from '../../shared/database/knex-instance.js';

describe('NotificationService', () => {
  let knex: Knex;
  let notificationSvc: NotificationService;

  // Test users (from seed)
  let ownerId: string;
  let siteId: string;

  beforeAll(async () => {
    knex = await createKnex();

    // Run migrations to ensure schema and seed data (notification_templates) are present
    const { MigrationService } =
      await import('../m0-platform/migration.service.js');
    const migrationService = new MigrationService(knex);
    await migrationService.runMigrations();

    // Seed notification templates (in case they're missing)
    await knex('notification_templates')
      .insert([
        {
          code: 'in_app_exception',
          channel: 'IN_APP',
          language: 'en',
          title: null,
          body: 'Exception card: {title} — value at risk: ₹{value_at_risk}',
        },
        {
          code: 'exception_card_push',
          channel: 'FCM',
          language: 'en',
          title: 'Action Required',
          body: '{count} exception card(s) need your review. Tap to resolve.',
        },
        {
          code: 'otp_delivery',
          channel: 'SMS',
          language: 'en',
          title: null,
          body: 'Your NeoBus OTP code is {otp_code}. Valid for 5 minutes.',
        },
      ])
      .onConflict('code')
      .ignore();

    const owner = await knex('users').where('role', 'OWNER').first('id');
    const site = await knex('sites').first('id');

    ownerId = String(owner.id);
    siteId = String(site.id);

    notificationSvc = new NotificationService(knex);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    // Clean up test notification_outbox rows
    await knex('notification_outbox').where('recipient_ref', ownerId).del();
  });

  describe('send()', () => {
    it('sends IN_APP notification by enqueueing to notification_outbox', async () => {
      await notificationSvc.send('IN_APP', 'in_app_exception', ownerId, {
        title: 'Test Exception',
        valueAtRisk: '1000.00',
        templateCode: 'in_app_exception',
      });

      const rows = await knex('notification_outbox')
        .where({ recipient_ref: ownerId, channel: 'IN_APP' })
        .orderBy('created_at', 'desc')
        .limit(1);

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.status).toBe('QUEUED');
      expect(row.template_code).toBe('in_app_exception');
      const payload =
        typeof row.payload_json === 'string'
          ? JSON.parse(row.payload_json)
          : row.payload_json;
      expect(payload.title).toBe('Test Exception');
      expect(payload.valueAtRisk).toBe('1000.00');
    });

    it('sends FCM notification by looking up device token and logging', async () => {
      // Register a test device token
      await knex('device_registrations').where({ user_id: ownerId }).del(); // Clean first

      await knex('device_registrations').insert({
        user_id: ownerId,
        device_id: 'test-device-1',
        fcm_token: 'test-fcm-token-123',
        platform: 'ANDROID',
        last_sync_at: new Date(),
      });

      await notificationSvc.send('FCM', 'exception_card_push', ownerId, {
        exceptionId: 'test-id',
        exceptionType: 'PRICE_OVERRIDE',
        title: 'Price override',
        count: 1,
      });

      // For MVP, FCM just logs — check the notification_outbox wasn't modified by send()
      // (the ExceptionService queues FCM separately via enqueueNotification)
      // Here we're testing NotificationService.send directly
    });

    it('sends SMS notification by logging (no actual provider)', async () => {
      // Should not throw, just log
      await notificationSvc.send('SMS', 'otp_delivery', '+919876543210', {
        otp_code: '123456',
      });

      // No rows in notification_outbox for SMS in this test
      // (send() for SMS is log-only in MVP)
    });

    it('sends WHATSAPP notification by logging (no actual provider)', async () => {
      // Should not throw, just log
      await notificationSvc.send(
        'WHATSAPP',
        'order_confirmation',
        '+919876543210',
        {
          orderId: 'ORD-001',
          amount: '5000.00',
        },
      );

      // No rows in notification_outbox for WHATSAPP in this test
    });

    it('renders template placeholders with payload values', async () => {
      await notificationSvc.send('IN_APP', 'in_app_exception', ownerId, {
        title: 'Price Override',
        value_at_risk: '2500.00',
        templateCode: 'in_app_exception',
      });

      const row = await knex('notification_outbox')
        .where({ recipient_ref: ownerId, channel: 'IN_APP' })
        .orderBy('created_at', 'desc')
        .first();

      const payload =
        typeof row.payload_json === 'string'
          ? JSON.parse(row.payload_json)
          : row.payload_json;
      expect(payload.body).toContain('Price Override');
      expect(payload.body).toContain('2500.00');
    });

    it('returns gracefully for unknown template code', async () => {
      // Should not throw
      await notificationSvc.send('IN_APP', 'nonexistent_template', ownerId, {
        foo: 'bar',
      });

      const rows = await knex('notification_outbox').where({
        recipient_ref: ownerId,
        template_code: 'nonexistent_template',
      });
      expect(rows.length).toBe(0);
    });
  });

  describe('template rendering', () => {
    it('replaces multiple placeholders in template body', async () => {
      // Insert or update a custom template for this test
      await knex('notification_templates')
        .insert({
          code: 'test_template',
          channel: 'IN_APP',
          language: 'en',
          body: 'Hello {name}, your order {orderId} is {status}',
          is_active: true,
        })
        .onConflict('code')
        .merge();

      await notificationSvc.send('IN_APP', 'test_template', ownerId, {
        name: 'John',
        orderId: 'ORD-123',
        status: 'confirmed',
        templateCode: 'test_template',
      });

      const row = await knex('notification_outbox')
        .where({ recipient_ref: ownerId, template_code: 'test_template' })
        .first();

      const payload =
        typeof row.payload_json === 'string'
          ? JSON.parse(row.payload_json)
          : row.payload_json;
      expect(payload.body).toBe('Hello John, your order ORD-123 is confirmed');
    });

    it('leaves unknown placeholders untouched', async () => {
      await knex('notification_templates')
        .insert({
          code: 'test_template2',
          channel: 'IN_APP',
          language: 'en',
          body: 'Hello {name}, unknown {missing}',
          is_active: true,
        })
        .onConflict('code')
        .merge();

      await notificationSvc.send('IN_APP', 'test_template2', ownerId, {
        name: 'John',
        templateCode: 'test_template2',
      });

      const row = await knex('notification_outbox')
        .where({ recipient_ref: ownerId, template_code: 'test_template2' })
        .first();

      const payload =
        typeof row.payload_json === 'string'
          ? JSON.parse(row.payload_json)
          : row.payload_json;
      expect(payload.body).toBe('Hello John, unknown {missing}');
    });
  });
});
