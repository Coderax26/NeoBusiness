import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { AdminService } from '../modules/m0-platform/admin.service.js';
import { AuthService } from '../modules/m0-platform/auth.service.js';
import { NotificationsController } from '../modules/m0-platform/notifications.controller.js';
import { NotificationService } from '../modules/m7a-exceptions/notification.service.js';
import { ExceptionService } from '../modules/m7a-exceptions/exception.service.js';
import { DashboardEventHandler } from '../modules/m7b-dashboards/dashboard-event.handler.js';

function createChainBuilder(terminalValue: unknown) {
  const b: any = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    whereNotIn: vi.fn().mockReturnThis(),
    whereNull: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    forUpdate: vi.fn().mockReturnThis(),
    del: vi.fn().mockResolvedValue(1),
    update: vi.fn().mockResolvedValue(1),
    insert: vi.fn(() => {
      const ins: any = {
        returning: vi.fn().mockResolvedValue([{ id: 'row-1' }]),
        onConflict: vi.fn(() => ({ ignore: vi.fn().mockResolvedValue(1) })),
        then: (resolve: any) => resolve(terminalValue),
      };
      return ins;
    }),
    pluck: vi.fn().mockResolvedValue(Array.isArray(terminalValue) ? terminalValue : []),
    first: vi.fn().mockResolvedValue(terminalValue),
    count: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve(terminalValue),
  };
  return b;
}

describe('Phase 6 Gap Verification — Auth/Admin, M7a Notifications, M7b Dashboards & UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.FCM_SERVER_KEY;
    delete process.env.FCM_WEBHOOK_URL;
    delete process.env.FCM_ENDPOINT;
    delete process.env.SMS_WEBHOOK_URL;
    delete process.env.SMS_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.WHATSAPP_WEBHOOK_URL;
    vi.unstubAllGlobals();
  });

  it('TC-P6-01: AdminService.updateUser reconciles user_site_access & revokes sessions; AuthService deduplicates siteIds', async () => {
    const delCalls: Array<{ table: string; kept?: string[] }> = [];
    const revokedUserIds: string[] = [];

    const trx: any = vi.fn((table: string) => {
      if (table === 'users') {
        return {
          where: vi.fn().mockReturnThis(),
          update: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([
              {
                id: 'user-1',
                full_name: 'Raju',
                assigned_site_id: 'site-2',
                role: 'DISPATCHER',
                is_active: true,
              },
            ]),
          })),
          first: vi.fn().mockResolvedValue({
            id: 'user-1',
            full_name: 'Raju',
            assigned_site_id: 'site-2',
            role: 'DISPATCHER',
            is_active: true,
          }),
        };
      }
      if (table === 'user_site_access') {
        return {
          where: vi.fn().mockReturnThis(),
          whereNotIn: vi.fn((_col: string, kept: string[]) => {
            delCalls.push({ table: 'user_site_access', kept });
            return { del: vi.fn().mockResolvedValue(1) };
          }),
          insert: vi.fn(() => ({
            onConflict: vi.fn(() => ({ ignore: vi.fn().mockResolvedValue(1) })),
          })),
        };
      }
      if (table === 'refresh_tokens') {
        return {
          where: vi.fn((_col: string, uid: string) => {
            revokedUserIds.push(uid);
            return { del: vi.fn().mockResolvedValue(1) };
          }),
        };
      }
      if (table === 'immutable_audit_logs') {
        return { insert: vi.fn().mockResolvedValue(1) };
      }
      return createChainBuilder(null);
    });

    const knex: any = vi.fn((table: string) => trx(table));
    knex.transaction = async (cb: any) => cb(trx);

    const admin = new AdminService(knex, { invalidateAll: vi.fn() } as any);
    vi.spyOn(admin, 'getUserById').mockResolvedValue({
      id: 'user-1',
      assigned_site_id: 'site-2',
      site_ids: ['site-2'],
    });

    await admin.updateUser(
      'user-1',
      { assignedSiteId: 'site-2', siteIds: ['site-2'] },
      'owner-1',
    );

    expect(delCalls).toEqual([{ table: 'user_site_access', kept: ['site-2'] }]);
    expect(revokedUserIds).toContain('user-1');

    const pinHash = await bcrypt.hash('1234', 4);
    // Verify AuthService.validateUser deduplicates assigned_site_id + siteAccess
    const authKnex: any = vi.fn((table: string) => {
      if (table === 'users') {
        return {
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({
            id: 'user-1',
            phone: '9999999999',
            role: 'DISPATCHER',
            assigned_site_id: 'site-2',
            pin_hash: pinHash,
            is_active: true,
          }),
          update: vi.fn().mockResolvedValue(1),
        };
      }
      if (table === 'user_site_access') {
        return {
          where: vi.fn().mockReturnThis(),
          pluck: vi.fn().mockResolvedValue(['site-2', 'site-3']),
        };
      }
      if (table === 'refresh_tokens') {
        return { insert: vi.fn().mockResolvedValue(1) };
      }
      return createChainBuilder(null);
    });

    const signMock = vi.fn().mockReturnValue('jwt-token');
    const auth = new AuthService(authKnex, { sign: signMock } as any);

    await auth.validateUser('9999999999', '1234');
    expect(signMock).toHaveBeenCalledWith(
      expect.objectContaining({
        siteIds: ['site-2', 'site-3'],
      }),
    );
  });

  it('TC-P6-02: AdminService.getSystemHealth counts pending outbox rows via processed_at IS NULL', async () => {
    const outboxWhereNullCols: string[] = [];
    const knex: any = vi.fn((table: string) => {
      if (table === 'outbox_events') {
        return {
          whereNull: vi.fn((col: string) => {
            outboxWhereNullCols.push(col);
            return {
              count: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({ c: '4' }),
            };
          }),
        };
      }
      if (table === 'notification_outbox') {
        return {
          where: vi.fn((_col: string, val: string) => ({
            count: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ c: val === 'FAILED' ? '2' : '5' }),
          })),
        };
      }
      return createChainBuilder(null);
    });
    knex.raw = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const admin = new AdminService(knex, { invalidateAll: vi.fn() } as any);
    const res = await admin.getSystemHealth();

    expect(outboxWhereNullCols).toEqual(['processed_at']);
    expect(res.dbConnected).toBe(true);
    expect(res.outboxQueueDepth).toBe(9);
    expect(res.failedNotificationsCount).toBe(2);
  });

  it('TC-P6-03: NotificationService.dispatch sends real FCM HTTP request when FCM_SERVER_KEY is set', async () => {
    process.env.FCM_SERVER_KEY = 'secret-fcm-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ multicast_id: 'fcm-msg-901' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const knex: any = vi.fn((table: string) => {
      if (table === 'notification_templates') {
        return createChainBuilder({
          body: 'Review {title}',
          title: 'Alert',
          channel: 'FCM',
          wa_template_id: null,
        });
      }
      if (table === 'device_registrations') {
        return createChainBuilder([{ fcm_token: 'device-token-abc' }]);
      }
      return createChainBuilder(null);
    });

    const svc = new NotificationService(knex);
    const res = await svc.dispatch('FCM', 'exception_card_push', 'owner-1', {
      title: 'Price Override',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/fcm/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'key=secret-fcm-key' }),
      }),
    );
    expect(res.delivered).toBe(true);
    expect(res.provider).toBe('fcm-http');
    expect(res.providerMessageId).toBe('fcm-msg-901');
  });

  it('TC-P6-04: NotificationService.dispatch falls back to SMS when user has no FCM device or FCM fails', async () => {
    process.env.SMS_WEBHOOK_URL = 'https://sms.example.test/send';
    process.env.FCM_SERVER_KEY = 'secret-fcm-key';

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('fcm.googleapis.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ messageId: 'sms-fallback-77' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const knex: any = vi.fn((table: string) => {
      if (table === 'notification_templates') {
        return createChainBuilder({
          body: '{count} card(s) pending',
          title: 'Exception',
          channel: 'FCM',
          wa_template_id: null,
        });
      }
      if (table === 'device_registrations') {
        return createChainBuilder([{ fcm_token: 'bad-token' }]);
      }
      if (table === 'users') {
        return createChainBuilder({ phone: '+919822001122' });
      }
      return createChainBuilder(null);
    });

    const svc = new NotificationService(knex);
    const res = await svc.dispatch('FCM', 'exception_card_push', 'owner-1', {
      count: 2,
    });

    expect(res.delivered).toBe(true);
    expect(res.fallbackChannel).toBe('SMS');
    expect(res.provider).toBe('sms-webhook');
    expect(res.providerMessageId).toBe('sms-fallback-77');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sms.example.test/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('TC-P6-05: NotificationService.dispatch sends SMS via webhook and throws on HTTP failure', async () => {
    process.env.SMS_WEBHOOK_URL = 'https://sms.example.test/send';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    const knex: any = vi.fn(() =>
      createChainBuilder({
        body: 'OTP is {{otp}}',
        title: null,
        channel: 'SMS',
        wa_template_id: null,
      }),
    );

    const svc = new NotificationService(knex);
    await expect(
      svc.dispatch('SMS', 'OTP_LOGIN_SMS', '+919822001122', { otp: '482910' }),
    ).rejects.toThrow('SMS webhook HTTP 503');
  });

  it('TC-P6-06: NotificationService.renderTemplate supports both {{key}} and {key} placeholders', () => {
    const svc = new NotificationService({} as any);
    const rendered = svc.renderTemplate(
      'Order {{orderNo}} total {amount} (missing: {unknown})',
      { orderNo: 'SO-001', amount: '5000' },
    );
    expect(rendered).toBe('Order SO-001 total 5000 (missing: {unknown})');
  });

  it('TC-P6-07: ExceptionService.relayNotifications handles JSONB objects without JSON.parse crash, filters out IN_APP, and marks 3rd failure FAILED', async () => {
    const updates: any[] = [];
    let whereInChannels: string[] = [];

    const knex: any = vi.fn((table: string) => {
      if (table === 'notification_outbox') {
        return {
          where: vi.fn().mockReturnThis(),
          whereIn: vi.fn((_col: string, channels: string[]) => {
            whereInChannels = channels;
            return {
              where: vi.fn().mockReturnThis(),
              orderBy: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'notif-1',
                  channel: 'FCM',
                  recipient_ref: 'owner-1',
                  template_code: 'exception_card_push',
                  payload_json: { count: 1 }, // PostgreSQL JSONB comes back as object!
                  attempts: 2,
                },
              ]),
            };
          }),
          update: vi.fn((u: any) => {
            updates.push(u);
            return Promise.resolve(1);
          }),
        };
      }
      if (table === 'notification_templates') {
        return createChainBuilder({
          channel: 'FCM',
          body: '{count}',
          title: 'Alert',
          wa_template_id: null,
        });
      }
      return createChainBuilder(null);
    });

    const notifyMock = {
      send: vi.fn(),
      dispatch: vi.fn().mockRejectedValue(new Error('Gateway 502')),
    };

    const excSvc = new ExceptionService(knex, {} as any, {} as any, notifyMock as any);
    const count = await excSvc.relayNotifications();

    expect(count).toBe(0);
    expect(whereInChannels).toEqual(['FCM', 'SMS', 'WHATSAPP']);
    expect(notifyMock.dispatch).toHaveBeenCalledWith(
      'FCM',
      'exception_card_push',
      'owner-1',
      { count: 1 },
    );
    expect(updates).toEqual([
      {
        attempts: 3,
        status: 'FAILED',
        error: 'Gateway 502',
      },
    ]);
  });

  it('TC-P6-08: DashboardEventHandler reacts to production.work_order_* events emitted by M4', async () => {
    const handler = new DashboardEventHandler({} as any, {} as any);
    const opsSpy = vi.spyOn(handler, 'triggerOpsRefresh').mockResolvedValue(undefined);
    const alertsSpy = vi
      .spyOn(handler, 'triggerInventoryAlertsRefresh')
      .mockResolvedValue(undefined);
    const analyticsSpy = vi
      .spyOn(handler, 'triggerAnalyticsRefresh')
      .mockResolvedValue(undefined);

    await handler.handleDomainEvent({
      id: 'e1',
      type: 'production.work_order_started',
      aggregateId: 'wo-1',
      payload: { workOrderId: 'wo-1', siteId: 's1' },
      publishedAt: new Date().toISOString(),
      moduleSource: 'm4',
    });
    expect(opsSpy).toHaveBeenCalledWith('production.work_order_started');

    await handler.handleDomainEvent({
      id: 'e2',
      type: 'production.work_order_completed',
      aggregateId: 'wo-1',
      payload: { workOrderId: 'wo-1', siteId: 's1' },
      publishedAt: new Date().toISOString(),
      moduleSource: 'm4',
    });
    expect(opsSpy).toHaveBeenCalledWith('production.work_order_completed');
    expect(alertsSpy).toHaveBeenCalledWith('production.work_order_completed');
    expect(analyticsSpy).toHaveBeenCalledWith('production.work_order_completed');
  });

  it('TC-P6-09: NotificationsController filters OWNER inbox by valid FCM channel (not PUSH)', async () => {
    const orWhereCalls: Array<[string, string]> = [];
    const qb: any = {
      where: vi.fn(function (this: any, fnOrCol: any) {
        if (typeof fnOrCol === 'function') fnOrCol.call(qb);
        return qb;
      }),
      orWhere: vi.fn((col: string, val: string) => {
        orWhereCalls.push([col, val]);
        return qb;
      }),
      clone: vi.fn(() => ({
        count: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: '0' }),
      })),
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    const knex: any = vi.fn(() => qb);

    const ctrl = new NotificationsController(knex);
    await ctrl.listNotifications({ user: { sub: 'owner-1', role: 'OWNER' } });

    expect(orWhereCalls).toContainEqual(['channel', 'FCM']);
    expect(orWhereCalls).not.toContainEqual(['channel', 'PUSH']);
  });

  it('TC-P6-10: Admin /admin/system UI fetches /api/proxy/admin/system-health & renders outbox/failed metrics', () => {
    const file = fs.readFileSync(
      path.resolve(__dirname, '../../../web/app/(office)/admin/system/page.tsx'),
      'utf8',
    );
    expect(file).toContain('/api/proxy/admin/system-health');
    expect(file).toContain('outboxQueueDepth');
    expect(file).toContain('failedNotificationsCount');
  });

  it('TC-P6-11: Control /control/notifications UI maps recipient_ref/template_code, filters QUEUED, and checks res.ok', () => {
    const file = fs.readFileSync(
      path.resolve(__dirname, '../../../web/app/(office)/control/notifications/page.tsx'),
      'utf8',
    );
    expect(file).toContain('n.recipient_ref');
    expect(file).toContain('n.template_code');
    expect(file).toContain("'QUEUED'");
    expect(file).toContain('if (!res.ok)');
  });

  it('TC-P6-12: Control /control/approvals UI extracts structured ExceptionPayload.facts array without [object Object]', () => {
    const file = fs.readFileSync(
      path.resolve(__dirname, '../../../web/app/(office)/control/approvals/page.tsx'),
      'utf8',
    );
    expect(file).toContain('function extractFacts(');
    expect(file).toContain('Array.isArray(obj.facts)');
    expect(file).toContain('typeof v === \'object\' ? JSON.stringify(v) : String(v)');
  });
});
