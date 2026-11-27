import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as bcrypt from 'bcrypt';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { resolveUserSiteId } from '../shared/utils/user-site.util.js';
import { AuthController } from '../modules/m0-platform/auth.controller.js';
import { AdminController } from '../modules/m0-platform/admin.controller.js';
import { AuditController } from '../modules/m0-platform/audit.controller.js';
import { AdminService } from '../modules/m0-platform/admin.service.js';
import { RbacGuard } from '../modules/m0-platform/rbac.service.js';
import { FleetController } from '../modules/m5-fleet/fleet.controller.js';
import { ExceptionController } from '../modules/m7a-exceptions/exception.controller.js';
import { DeviceController } from '../modules/m7a-exceptions/device.controller.js';
import { ExceptionService } from '../modules/m7a-exceptions/exception.service.js';
import { DashboardController } from '../modules/m7b-dashboards/dashboard.controller.js';
import { AnalyticsController } from '../modules/m7b-dashboards/analytics.controller.js';
import { StockAlertsController } from '../modules/m7b-dashboards/stock-alerts.controller.js';
import { OrderService } from '../modules/m1-commercial/order.service.js';
import { CreditPortService } from '../modules/m6-finance/credit-port.service.js';
import { LedgerService } from '../modules/m6-finance/ledger.service.js';
import { InvoiceService } from '../modules/m6-finance/invoice.service.js';

const WEB_APP_DIR = path.resolve(__dirname, '../../../web/app');
const API_SRC_DIR = path.resolve(__dirname, '..');

function makeKnexStub(tableHandler: (table: string) => any) {
  const fn: any = (table: string) => tableHandler(table);
  fn.raw = vi.fn((sql: string) => sql);
  fn.fn = { now: () => new Date() };
  fn.transaction = async (cb: (trx: any) => any) => cb(fn);
  return fn;
}

describe('Phase 1 — Security, Auth, RBAC, Site Resolution & Event Bus', () => {
  it('TC-P1-01: AuthController.forgotPin & resetPin enforce real OTP generation, verification, and refresh token revocation', async () => {
    const pinHashOld = await bcrypt.hash('123456', 4);
    const updatedUsers: any[] = [];
    let revokedTokens = false;

    const knex = makeKnexStub((table) => {
      if (table === 'users') {
        return {
          whereIn: () => ({
            where: () => ({
              first: async () => ({
                id: 'usr-1',
                phone: '+919999999999',
                full_name: 'Owner',
                pin_hash: pinHashOld,
              }),
            }),
          }),
          where: () => ({
            update: async (patch: any) => {
              updatedUsers.push(patch);
              return 1;
            },
          }),
        };
      }
      if (table === 'refresh_tokens') {
        return {
          where: () => ({
            del: async () => {
              revokedTokens = true;
              return 1;
            },
          }),
        };
      }
      if (table === 'notification_outbox') {
        return {
          insert: async () => [],
        };
      }
      return {};
    });

    const controller = new AuthController({ knex } as any);

    // Reject arbitrary OTP before forgotPin
    await expect(
      controller.resetPin({ phone: '+919999999999', otp: '123456', newPin: '654321' }),
    ).rejects.toThrow(/Invalid or expired OTP/);

    const forgotRes = await controller.forgotPin({ phone: '+919999999999' });
    expect(forgotRes.otpDispatched).toBe(true);

    // Extract hashed OTP and replace with known test OTP or fail wrong OTP
    await expect(
      controller.resetPin({ phone: '+919999999999', otp: '000000', newPin: '654321' }),
    ).rejects.toThrow(/Invalid or expired OTP/);

    const realOtpHash = await bcrypt.hash('482910', 4);
    (controller as any).otpStore.set('+919999999999', {
      otpHash: realOtpHash,
      expiresAt: Date.now() + 60_000,
      attempts: 0,
    });

    const okRes = await controller.resetPin({
      phone: '+919999999999',
      otp: '482910',
      newPin: '654321',
    });
    expect(okRes.reset).toBe(true);
    expect(updatedUsers).toHaveLength(1);
    expect(await bcrypt.compare('654321', updatedUsers[0].pin_hash)).toBe(true);
    expect(revokedTokens).toBe(true);
  });

  it('TC-P1-02: AuthController.changePassword requires currentCredential and rejects wrong credential', async () => {
    const hash = await bcrypt.hash('123456', 4);
    const knex = makeKnexStub(() => ({
      where: () => ({
        first: async () => ({ id: 'usr-1', pin_hash: hash, password_hash: null }),
        update: async () => 1,
      }),
    }));
    const controller = new AuthController({ knex } as any);

    await expect(
      controller.changePassword({ newCredential: '654321' } as any, { user: { sub: 'usr-1' } }),
    ).rejects.toThrow(/required/);

    await expect(
      controller.changePassword(
        { currentCredential: '000000', newCredential: '654321' },
        { user: { sub: 'usr-1' } },
      ),
    ).rejects.toThrow(/incorrect/);

    const ok = await controller.changePassword(
      { currentCredential: '123456', newCredential: '654321' },
      { user: { sub: 'usr-1' } },
    );
    expect(ok.changed).toBe(true);
  });

  it('TC-P1-03: AuthController.updateMe strips password_hash and pin_hash from response', async () => {
    const knex = makeKnexStub((table) => {
      if (table === 'users') {
        return { where: () => ({ update: async () => 1 }) };
      }
      if (table === 'business_rule_config') {
        return {
          where: () => ({ first: async () => null }),
          insert: async () => [],
        };
      }
      return {};
    });
    const authSvc: any = {
      knex,
      getUserWithSites: vi.fn().mockResolvedValue({
        id: 'usr-1',
        full_name: 'Owner',
        password_hash: 'SECRET_PW',
        pin_hash: 'SECRET_PIN',
        sites: [],
      }),
    };
    const controller = new AuthController(authSvc);
    const res = await controller.updateMe({ preferredLanguage: 'mr' }, { user: { sub: 'usr-1' } });
    expect(res.full_name).toBe('Owner');
    expect(res).not.toHaveProperty('password_hash');
    expect(res).not.toHaveProperty('pin_hash');
  });

  it('TC-P1-04: RbacGuard is attached to all previously unguarded M0, M5, M7a, M7b controllers', () => {
    const controllers = [
      AdminController,
      AuditController,
      FleetController,
      ExceptionController,
      DeviceController,
      DashboardController,
      AnalyticsController,
      StockAlertsController,
    ];
    for (const Ctrl of controllers) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, Ctrl) || [];
      expect(guards, `${Ctrl.name} missing RbacGuard`).toContain(RbacGuard);
    }
  });

  it('TC-P1-05: resolveUserSiteId falls back from explicit siteId -> user.siteId -> user.siteIds[0]', () => {
    expect(resolveUserSiteId({ siteIds: ['site-a', 'site-b'] })).toBe('site-a');
    expect(resolveUserSiteId({ siteId: 'site-direct', siteIds: ['site-a'] })).toBe('site-direct');
    expect(resolveUserSiteId({ siteId: 'site-direct', siteIds: ['site-a'] }, 'site-explicit')).toBe('site-explicit');
    expect(resolveUserSiteId({ siteIds: ['site-a'] }, 'all')).toBe('site-a');
    expect(resolveUserSiteId({})).toBeUndefined();
  });

  it('TC-P1-06: AdminService.updateUser reconciles user_site_access and revokeUserSessions deletes tokens; getSystemHealth checks processed_at IS NULL', async () => {
    let deletedNotIn: string[] = [];
    let revokedTokens = 0;
    const queries: string[] = [];

    const knex = makeKnexStub((table) => {
      if (table === 'users') {
        return {
          where: () => ({
            first: async () => ({ id: 'usr-1' }),
            update: () => ({
              returning: async () => [{ id: 'usr-1', assigned_site_id: 'site-2' }],
            }),
          }),
        };
      }
      if (table === 'user_site_access') {
        return {
          where: () => ({
            whereNotIn: (_col: string, ids: string[]) => ({
              del: async () => {
                deletedNotIn = ids;
                return 1;
              },
            }),
            del: async () => 1,
          }),
          insert: () => ({
            onConflict: () => ({ ignore: async () => [] }),
          }),
        };
      }
      if (table === 'refresh_tokens') {
        return {
          where: () => ({
            del: async () => {
              revokedTokens += 1;
              return 1;
            },
          }),
        };
      }
      if (table === 'outbox_events') {
        return {
          whereNull: (col: string) => {
            queries.push(`outbox:${col}`);
            return { count: () => ({ first: async () => ({ c: 3 }) }) };
          },
        };
      }
      if (table === 'notification_outbox') {
        return {
          where: () => ({
            count: () => ({ first: async () => ({ c: 1 }) }),
          }),
        };
      }
      return {};
    });

    const svc = new AdminService(knex, {} as any);
    await svc.updateUser('usr-1', { siteIds: ['site-2', 'site-3'] }, 'owner-1');
    expect(deletedNotIn).toEqual(['site-2', 'site-3']);
    expect(revokedTokens).toBe(1);

    await svc.revokeUserSessions('usr-1', 'owner-1');
    expect(revokedTokens).toBe(2);

    const health = await svc.getSystemHealth();
    expect(queries).toContain('outbox:processed_at');
    expect(health.outboxQueueDepth).toBe(4);
  });

  it('TC-P1-07: OutboxRelay fans out to dedicated per-module queues (zero shared competing domain-events queue)', () => {
    const relaySrc = fs.readFileSync(
      path.join(API_SRC_DIR, 'shared/events/outbox-relay.service.ts'),
      'utf8',
    );
    expect(relaySrc).not.toContain("new Queue('domain-events'");
    expect(relaySrc).toContain('m3-inventory-events');
    expect(relaySrc).toContain('m5-fleet-events');
    expect(relaySrc).toContain('m6-cod-events');
    expect(relaySrc).toContain('m6-credit-note-events');
    expect(relaySrc).toContain('dashboard-events');

    for (const rel of [
      'modules/m3-inventory/inventory-event.handler.ts',
      'modules/m5-fleet/trip-listener.service.ts',
      'modules/m6-finance/cod-settlement.service.ts',
      'modules/m6-finance/credit-note.service.ts',
    ]) {
      const workerSrc = fs.readFileSync(path.join(API_SRC_DIR, rel), 'utf8');
      expect(workerSrc).not.toContain("'domain-events'");
    }
  });

  it('TC-P1-08: ExceptionService invokes multiple onResolved listeners without overwriting and records explicit resolvedByUserId', async () => {
    let savedResolvedBy = '';
    const knex = makeKnexStub((table) => {
      if (table === 'exception_approvals') {
        return {
          where: () => ({
            forUpdate: () => ({
              first: async () => ({
                id: 'ex-1',
                status: 'PENDING',
                exception_type: 'PRICE_OVERRIDE',
                reference_id: 'sol-1',
                reference_table: 'sales_order_lines',
                requested_by: 'coord-1',
              }),
            }),
            update: async (patch: any) => {
              savedResolvedBy = patch.resolved_by;
              return 1;
            },
          }),
        };
      }
      if (table === 'exception_events') {
        return { insert: async () => [] };
      }
      return {};
    });

    const outbox: any = { raiseStandalone: vi.fn().mockResolvedValue('ev-1') };
    const notify: any = { send: vi.fn() };
    const exSvc = new ExceptionService(knex, {} as any, outbox, notify);

    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    exSvc.onResolved('PRICE_OVERRIDE', first);
    exSvc.onResolved('PRICE_OVERRIDE', second);

    await exSvc.resolve('ex-1', 'APPROVED', 'OK', { orderId: 'ord-1' }, 'owner-99');
    await new Promise((r) => setTimeout(r, 10));

    expect(savedResolvedBy).toBe('owner-99');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('TC-P1-09: Forgot PIN (/login/forgot) and Profile (/me) pages call live /api/proxy/auth/* endpoints', () => {
    const forgotSrc = fs.readFileSync(path.join(WEB_APP_DIR, '(auth)/login/forgot/page.tsx'), 'utf8');
    expect(forgotSrc).toContain('/api/proxy/auth/forgot-pin');
    expect(forgotSrc).toContain('/api/proxy/auth/reset-pin');
    expect(forgotSrc).not.toContain('Demo OTP');

    const meSrc = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/me/page.tsx'), 'utf8');
    expect(meSrc).toContain('/api/proxy/auth/me');
    expect(meSrc).toContain('/api/proxy/auth/change-password');
  });
});

describe('Phase 2 — End-to-End O2C: Commercial, Fleet, Inventory, Invoicing & Collections', () => {
  it('TC-P2-01: M1CommercialModule no longer overrides global CREDIT_PORT (resolves M6 CreditPortService)', () => {
    const m1Mod = fs.readFileSync(
      path.join(API_SRC_DIR, 'modules/m1-commercial/m1-commercial.module.ts'),
      'utf8',
    );
    expect(m1Mod).not.toContain('CREDIT_PORT');
  });

  it('TC-P2-02: OrderService.acceptCounter applies owner counterPrice to line and updates order total', async () => {
    const lineUpdates: any[] = [];
    const orderUpdates: any[] = [];
    const knex = makeKnexStub((table) => {
      if (table === 'sales_orders') {
        return {
          where: () => ({
            forUpdate: () => ({
              first: async () => ({
                id: 'ord-1',
                order_status: 'PENDING_APPROVAL',
                customer_id: 'cust-1',
                total_amount: '850.00',
              }),
            }),
            first: async () => ({
              customer_id: 'cust-1',
              fulfillment_site_id: 'site-1',
              delivery_date: '2026-11-27',
            }),
            update: async (patch: any) => {
              orderUpdates.push(patch);
              return 1;
            },
          }),
        };
      }
      if (table === 'sales_order_lines') {
        return {
          where: () => ({
            select: async () => [
              {
                id: 'line-1',
                item_id: 'item-1',
                ordered_qty: '10',
                quoted_unit_price: '85.00',
                floor_price_snapshot: '90.00',
                landed_cost_snapshot: '75.00',
                line_total: '850.00',
              },
            ],
            update: async (patch: any) => {
              lineUpdates.push(patch);
              return 1;
            },
          }),
        };
      }
      if (table === 'order_status_log' || table === 'outbox_events') {
        return { insert: async () => [] };
      }
      if (table === 'items') {
        return { whereIn: () => ({ select: async () => [{ id: 'item-1', item_category: 'PROCESSED_FG' }] }) };
      }
      return {};
    });

    const svc = new OrderService(knex, {} as any, {} as any, {} as any, { onResolved: vi.fn() } as any, {} as any);
    const res = await svc.acceptCounter('ord-1', 'Accepted', 'usr-1', 89.5);
    expect(res.status).toBe('CONFIRMED');
    expect(lineUpdates[0].quoted_unit_price).toBe('89.50');
    expect(lineUpdates[0].line_total).toBe('895.00');
    expect(orderUpdates[0].total_amount).toBe('895.00');
  });

  it('TC-P2-03: OrderService.cancel releases active reservations and emits order.cancelled', async () => {
    const updatedResIds: any[] = [];
    const outboxInserted: any[] = [];
    const knex = makeKnexStub((table) => {
      if (table === 'sales_orders') {
        return {
          where: () => ({
            forUpdate: () => ({
              first: async () => ({
                id: 'ord-1',
                order_status: 'CONFIRMED',
                fulfillment_site_id: 'site-1',
              }),
            }),
            update: async () => 1,
          }),
        };
      }
      if (table === 'sales_order_lines') {
        return { where: () => ({ select: async () => [{ id: 'line-1' }] }) };
      }
      if (table === 'stock_reservations') {
        return {
          whereIn: (_col: string, ids: string[]) => ({
            andWhere: () => ({
              select: async () => [
                { id: 'res-1', site_id: 'site-1', item_id: 'item-1', batch_id: 'b-1', qty: '10.000' },
              ],
            }),
            update: async () => {
              updatedResIds.push(...ids);
              return 1;
            },
          }),
        };
      }
      if (table === 'items') {
        return { where: () => ({ first: async () => ({ primary_uom: 'KG' }) }) };
      }
      if (table === 'stock_ledger_txns' || table === 'order_status_log') {
        return { insert: async () => [] };
      }
      if (table === 'outbox_events') {
        return {
          insert: async (row: any) => {
            outboxInserted.push(row);
            return [];
          },
        };
      }
      return {};
    });

    const svc = new OrderService(knex, {} as any, {} as any, {} as any, { onResolved: vi.fn() } as any, {} as any);
    const res = await svc.cancel('ord-1', 'Customer cancelled', 'usr-1');
    expect(res.status).toBe('CANCELLED');
    expect(updatedResIds).toEqual(['res-1']);
    expect(outboxInserted[0].event_type).toBe('order.cancelled');
  });

  it('TC-P2-04: CreditPortService.canDispatch permits both CONFIRMED and READY orders (not HELD/DRAFT)', async () => {
    const makeCreditPort = (orderStatus: string) =>
      new CreditPortService(
        makeKnexStub((table) => {
          if (table === 'sales_orders') {
            return { where: () => ({ first: async () => ({ customer_id: 'c-1', order_status: orderStatus }) }) };
          }
          if (table === 'invoices') {
            return {
              where: () => ({
                andWhere: () => ({
                  andWhere: () => ({
                    orderBy: () => ({ first: async () => null }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
        {} as any,
      );

    expect((await makeCreditPort('CONFIRMED').canDispatch('o-1')).allowed).toBe(true);
    expect((await makeCreditPort('READY').canDispatch('o-1')).allowed).toBe(true);
    expect((await makeCreditPort('DRAFT').canDispatch('o-1')).allowed).toBe(false);
  });

  it('TC-P2-05: FleetService.dispatchTrip has no throwing ledger.postInvoice and InventoryEventHandler avoids duplicate postDispatch', () => {
    const fleetSrc = fs.readFileSync(path.join(API_SRC_DIR, 'modules/m5-fleet/fleet.service.ts'), 'utf8');
    expect(fleetSrc).not.toContain('this.ledger.postInvoice');
    expect(fleetSrc).not.toContain("'trip.loaded'");
    expect(fleetSrc).not.toContain('te.created_at');

    const m3HandlerSrc = fs.readFileSync(
      path.join(API_SRC_DIR, 'modules/m3-inventory/inventory-event.handler.ts'),
      'utf8',
    );
    expect(m3HandlerSrc).not.toContain('this.inventory.postDispatch');
    expect(m3HandlerSrc).not.toContain('this.inventory.postReturn');
  });

  it('TC-P2-06: InvoiceService.generateFromOrder computes CGST+SGST for intra-state, includes tax in totalAmount, and honors isCOD', async () => {
    const insertedInvoices: any[] = [];
    const knex = makeKnexStub((table) => {
      if (table === 'sales_orders') {
        return { where: () => ({ first: async () => ({ id: 'ord-1', customer_id: 'c-1', order_status: 'READY' }) }) };
      }
      if (table === 'invoices') {
        return {
          where: () => ({ first: async () => null }),
          insert: (row: any) => {
            insertedInvoices.push(row);
            return { returning: async () => [{ id: 'inv-1', ...row }] };
          },
        };
      }
      if (table === 'sales_order_lines') {
        return {
          where: () => ({
            join: () => ({
              select: async () => [
                {
                  lineId: 'sol-1',
                  item_id: 'itm-1',
                  ordered_qty: '10',
                  quoted_unit_price: '100.00',
                  hsn_code: '2106',
                  tax_rate_pct: '5.00',
                  tax_treatment: 'TAXABLE',
                  itemName: 'Paneer',
                },
              ],
            }),
          }),
        };
      }
      if (table === 'customers') {
        return {
          where: () => ({
            first: async () => ({ id: 'c-1', state_code: 'MH', credit_days: 15 }),
            update: async () => 1,
          }),
        };
      }
      if (table === 'business_rule_config') {
        return {
          where: () => ({ first: async () => ({ value_json: { gstin: '27AAACN1234F1Z5' } }) }),
        };
      }
      if (table === 'customer_ledger_entries') {
        return {
          where: () => ({ orderBy: () => ({ first: async () => ({ running_balance: '0.00' }) }) }),
          insert: async () => [],
        };
      }
      if (table === 'invoice_lines') {
        return { insert: async () => [] };
      }
      return {};
    });

    const docNumber: any = { next: async () => 'INV-2611-0001' };
    const svc = new InvoiceService(knex, docNumber, {} as any, {} as any, {} as any);
    const out = await svc.generateFromOrder('ord-1', 'site-1', 'usr-1', { isCOD: true });

    expect(out.totalAmount).toBe('1050.00'); // 1000 taxable + 50 GST (5%)
    expect(insertedInvoices[0].cgst).toBe('25.00');
    expect(insertedInvoices[0].sgst).toBe('25.00');
    expect(insertedInvoices[0].igst).toBe('0.00');
    expect(insertedInvoices[0].is_cod).toBe(true);
  });

  it('TC-P2-07: LedgerService.logCollection marks full invoice PAID (not PARTIAL), caps FIFO by amount, updates customers.current_ar_balance, and closes DELIVERED order', async () => {
    const invoiceUpdates: any[] = [];
    const customerUpdates: any[] = [];
    const orderUpdates: any[] = [];

    const knex = makeKnexStub((table) => {
      if (table === 'collection_receipts') {
        return {
          where: () => ({ first: async () => null }),
          insert: (row: any) => ({ returning: async () => [{ id: 'rcp-1', ...row }] }),
        };
      }
      if (table === 'invoices') {
        return {
          where: (_col: string, val: string) => ({
            first: async () =>
              val === 'inv-1'
                ? {
                    id: 'inv-1',
                    invoice_no: 'INV-1',
                    total_amount: '500.00',
                    paid_amount: '0.00',
                    balance_due: '500.00',
                    status: 'UNPAID',
                    sales_order_id: 'ord-1',
                  }
                : {
                    id: 'inv-2',
                    invoice_no: 'INV-2',
                    total_amount: '800.00',
                    paid_amount: '0.00',
                    balance_due: '800.00',
                    status: 'UNPAID',
                    sales_order_id: 'ord-2',
                  },
            update: async (patch: any) => {
              invoiceUpdates.push({ id: val, ...patch });
              return 1;
            },
            whereIn: () => ({
              where: () => ({
                orderBy: () => ({
                  orderBy: () => ({
                    select: async () => [
                      { id: 'inv-1', balance_due: '500.00' },
                      { id: 'inv-2', balance_due: '800.00' },
                    ],
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'sales_orders') {
        return {
          where: (_c: string, id: string) => ({
            first: async () => ({ order_status: id === 'ord-1' ? 'DELIVERED_FULL' : 'CONFIRMED' }),
            update: async (patch: any) => {
              orderUpdates.push({ id, ...patch });
              return 1;
            },
          }),
        };
      }
      if (table === 'customers') {
        return {
          where: () => ({
            update: async (patch: any) => {
              customerUpdates.push(patch);
              return 1;
            },
          }),
        };
      }
      if (table === 'customer_ledger_entries') {
        return {
          where: () => ({ orderBy: () => ({ first: async () => ({ running_balance: '1300.00' }) }) }),
          insert: async () => [],
        };
      }
      if (table === 'custody_ledger') {
        return {
          where: () => ({ orderBy: () => ({ first: async () => ({ running_balance: '0.00' }) }) }),
          insert: async () => [],
        };
      }
      if (table === 'receipt_allocations' || table === 'order_status_log') {
        return { insert: async () => [] };
      }
      return {};
    });

    const ledger = new LedgerService(
      knex,
      { next: async () => 'RCP-001' } as any,
      {} as any,
    );

    const res = await ledger.logCollection(
      {
        siteId: 'site-1',
        customerId: 'c-1',
        amount: '600.00',
        paymentMode: 'CASH',
        collectedByUserId: 'col-1',
        idempotencyKey: 'idem-fifo-cap',
      },
      knex,
    );

    expect(res.allocatedAmount).toBe('600.00');
    expect(invoiceUpdates[0]).toMatchObject({ id: 'inv-1', status: 'PAID', balance_due: '0.00' });
    expect(invoiceUpdates[1]).toMatchObject({ id: 'inv-2', status: 'PARTIAL', balance_due: '700.00' });
    expect(customerUpdates[0].current_ar_balance).toBe('700.00');
    expect(orderUpdates).toContainEqual(expect.objectContaining({ id: 'ord-1', order_status: 'CLOSED' }));
  });

  it('TC-P2-08: Phase 2 Sales, Logistics & Finance web pages wire real API calls and remove legacy 404 endpoints', () => {
    const orderDetail = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/sales/orders/[id]/page.tsx'), 'utf8');
    expect(orderDetail).toContain("'mark-ready'");
    expect(orderDetail).toContain('/api/proxy/invoices/generate');
    expect(orderDetail).toContain('/cancel');

    const collections = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/collections/page.tsx'), 'utf8');
    expect(collections).not.toContain('/collections/receipts');
    expect(collections).toContain('/api/proxy/collections');

    const invoices = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/invoices/page.tsx'), 'utf8');
    expect(invoices).toContain('/api/proxy/invoices/generate');

    const expenses = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/logistics/expenses/page.tsx'), 'utf8');
    expect(expenses).not.toContain("fetch('/api/proxy/trip-expenses', {\n      method: 'POST'");
    expect(expenses).toContain('/expenses');

    const vehicles = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/logistics/vehicles/page.tsx'), 'utf8');
    expect(vehicles).toContain('/api/proxy/vehicles');
  });
});
