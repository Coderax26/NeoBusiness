import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EodService } from '../modules/m6-finance/eod.service.js';
import { EodController } from '../modules/m6-finance/eod.controller.js';
import { ChequeService } from '../modules/m6-finance/cheque.service.js';
import { CodSettlementService } from '../modules/m6-finance/cod-settlement.service.js';
import { HandoverService } from '../modules/m6-finance/handover.service.js';
import { Money } from '../shared/utils/money.util.js';

const WEB_APP_DIR = path.resolve(__dirname, '../../../web/app');

function makeKnexStub(tableHandler: (table: string) => any) {
  const fn: any = (table: string) => tableHandler(table);
  fn.raw = vi.fn((sql: string, params?: any[]) => ({ sql, params }));
  fn.fn = { now: () => new Date() };
  fn.transaction = async (cb: (trx: any) => any) => cb(fn);
  return fn;
}

const SITE_1 = '11111111-1111-4111-8111-111111111111';
const DRIVER_1 = '22222222-2222-4222-8222-222222222222';
const COLLECTOR_1 = '33333333-3333-4333-8333-333333333333';
const OWNER_1 = '44444444-4444-4444-8444-444444444444';
const CUST_1 = '55555555-5555-4555-8555-555555555555';
const RCP_1 = '66666666-6666-4666-8666-666666666666';
const CHQ_1 = '77777777-7777-4777-8777-777777777777';

function buildEodChecksKnex(nonZeroWallets: any[]) {
  return makeKnexStub((table) => {
    if (table === 'delivery_trips') {
      const ch: any = {
        where: () => ch,
        whereNotIn: () => ch,
        count: () => ({ first: async () => ({ cnt: '0' }) }),
      };
      return ch;
    }
    if (table === 'custody_ledger as cl') {
      const ch: any = {
        join: () => ch,
        where: () => ch,
        groupBy: () => ch,
        havingRaw: () => ch,
        select: async () => nonZeroWallets,
      };
      return ch;
    }
    if (table === 'sales_orders') {
      const ch: any = {
        where: () => ch,
        whereNotExists: () => ch,
        count: () => ({ first: async () => ({ cnt: '0' }) }),
      };
      return ch;
    }
    if (table === 'invoices') {
      return { whereRaw: () => ({}) };
    }
    if (table === 'cashbook_entries') {
      const ch: any = {
        where: () => ch,
        whereIn: () => ch,
        sum: () => ({ first: async () => ({ total: '0.00' }) }),
      };
      return ch;
    }
    if (table === 'eod_closings') {
      return {
        where: () => ({ andWhere: () => ({ first: async () => null }) }),
        insert: (row: any) => ({ returning: async () => [{ id: 'eod-1', ...row }] }),
      };
    }
    return {};
  });
}

describe('Phase 5 — Finance EOD, Driver Custody, Cheques & UI Verification', () => {
  it('TC-P5-01: EodService.runChecks detects DRIVER non-zero COD custody wallet and blocks sign-off', async () => {
    const knex = buildEodChecksKnex([
      { userId: DRIVER_1, name: 'Suresh Driver', role: 'DRIVER', balance: '4500.00' },
    ]);

    const eodSvc = new EodService(
      knex,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const initiated = await eodSvc.initiateClosing(SITE_1, OWNER_1, '2026-11-27');
    expect(initiated.canSignOff).toBe(false);
    expect(initiated.checks.handover.passed).toBe(false);
    expect(initiated.checks.handover.nonZeroWallets).toBe(1);
    expect(initiated.checks.handover.wallets).toEqual([
      { userId: DRIVER_1, name: 'Suresh Driver', role: 'DRIVER', balance: '4500.00' },
    ]);
  });

  it('TC-P5-02: EodService.runChecks blocks on non-zero COLLECTOR wallet and passes when all custody wallets are zero', async () => {
    const blockedKnex = buildEodChecksKnex([
      { userId: COLLECTOR_1, name: 'Raju Collector', role: 'COLLECTOR', balance: '1200.00' },
    ]);
    const blockedSvc = new EodService(blockedKnex, {} as any, {} as any, {} as any, {} as any, {} as any);
    const blocked = await blockedSvc.initiateClosing(SITE_1, OWNER_1, '2026-11-27');
    expect(blocked.checks.handover.passed).toBe(false);

    const clearKnex = buildEodChecksKnex([]);
    const clearSvc = new EodService(clearKnex, {} as any, {} as any, {} as any, {} as any, {} as any);
    const ready = await clearSvc.initiateClosing(SITE_1, OWNER_1, '2026-11-27');
    expect(ready.checks.handover.passed).toBe(true);
    expect(ready.canSignOff).toBe(true);
  });

  it('TC-P5-03: EodService.generateDepositSlip sums totalCheques from cheque_register.amount (never upi_amount)', async () => {
    const knex = makeKnexStub((table) => {
      if (table === 'cash_handovers') {
        const ch: any = {
          where: () => ch,
          select: async () => [
            {
              id: 'ho-1',
              handed_by_user_id: DRIVER_1,
              counted_amount: '15000.00',
              upi_amount: '9999.00',
              cheque_count: 0,
            },
          ],
        };
        return ch;
      }
      if (table === 'cheque_register as cr') {
        const ch: any = {
          join: () => ch,
          where: () => ch,
          select: async () => [
            {
              cheque_no: 'CHQ-101',
              bank: 'SBI',
              cheque_date: '2026-11-27',
              amount: '7500.00',
              status: 'DEPOSITED',
              collected_by_user_id: COLLECTOR_1,
            },
            {
              cheque_no: 'CHQ-102',
              bank: 'HDFC',
              cheque_date: '2026-11-27',
              amount: '2500.00',
              status: 'DEPOSITED',
              collected_by_user_id: COLLECTOR_1,
            },
          ],
        };
        return ch;
      }
      return {};
    });

    const eodSvc = new EodService(knex, {} as any, {} as any, {} as any, {} as any, {} as any);
    const slip = await eodSvc.generateDepositSlip(SITE_1, '2026-11-27');

    expect(slip.totalCash).toBe('15000.00');
    expect(slip.totalCheques).toBe('10000.00');
    expect(slip.totalUpi).toBe('9999.00');
    expect(slip.totalDeposit).toBe('25000.00');
    expect(slip.chequeCount).toBe(2);
    expect(slip.handoverCount).toBe(1);
  });

  it('TC-P5-04: EodService.generateDepositSlip deducts cheque amount from combined cash+cheque handover to avoid double-counting', async () => {
    const knex = makeKnexStub((table) => {
      if (table === 'cash_handovers') {
        const ch: any = {
          where: () => ch,
          select: async () => [
            {
              id: 'ho-2',
              handed_by_user_id: COLLECTOR_1,
              counted_amount: '12000.00', // 8000 cash + 4000 cheque
              upi_amount: '0.00',
              cheque_count: 1,
            },
          ],
        };
        return ch;
      }
      if (table === 'cheque_register as cr') {
        const ch: any = {
          join: () => ch,
          where: () => ch,
          select: async () => [
            {
              cheque_no: 'CHQ-201',
              bank: 'ICICI',
              cheque_date: '2026-11-27',
              amount: '4000.00',
              status: 'DEPOSITED',
              collected_by_user_id: COLLECTOR_1,
            },
          ],
        };
        return ch;
      }
      return {};
    });

    const eodSvc = new EodService(knex, {} as any, {} as any, {} as any, {} as any, {} as any);
    const slip = await eodSvc.generateDepositSlip(SITE_1, '2026-11-27');

    expect(slip.totalCash).toBe('8000.00');
    expect(slip.totalCheques).toBe('4000.00');
    expect(slip.totalDeposit).toBe('12000.00');
  });

  it('TC-P5-05: EodController resolves siteId via resolveUserSiteId on downloadDepositSlipPdf and checklist/signoff routes', async () => {
    const generateDepositSlipPdf = vi.fn().mockResolvedValue(Buffer.from('%PDF'));
    const ctl = new EodController({ generateDepositSlipPdf } as any);
    const resMock: any = { setHeader: vi.fn(), send: vi.fn() };

    await ctl.downloadDepositSlipPdf(
      '2026-11-27',
      { user: { id: OWNER_1, activeSiteId: SITE_1, siteIds: [SITE_1] } },
      resMock,
      undefined,
    );

    expect(generateDepositSlipPdf).toHaveBeenCalledWith(SITE_1, '2026-11-27');
    expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
  });

  it('TC-P5-06: ChequeService.depositCheque persists both deposited_at and deposited_on', async () => {
    let updatePayload: any = null;
    const knex = makeKnexStub((table) => {
      if (table === 'cheque_register') {
        return {
          where: () => ({
            forUpdate: () => ({
              first: async () => ({ id: CHQ_1, cheque_no: 'CHQ-1', status: 'RECEIVED', receipt_id: RCP_1, amount: '5000.00' }),
            }),
            update: async (payload: any) => {
              updatePayload = payload;
              return 1;
            },
            first: async () => ({ id: CHQ_1, status: 'DEPOSITED' }),
          }),
        };
      }
      return {};
    });

    const chqSvc = new ChequeService(knex, {} as any, {} as any, {} as any);
    await chqSvc.depositCheque({ chequeId: CHQ_1, depositedBy: OWNER_1, depositSlipNo: 'SLIP-1' });

    expect(updatePayload.status).toBe('DEPOSITED');
    expect(updatePayload.deposited_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(updatePayload.deposited_at).toBeTruthy();
  });

  it('TC-P5-07: ChequeService.clearCheque posts amount_delta = -amount (not running_balance) and syncs users.cash_custody_balance', async () => {
    const custodyInserts: any[] = [];
    const userUpdates: any[] = [];

    const knex = makeKnexStub((table) => {
      if (table === 'cheque_register') {
        return {
          where: () => ({
            forUpdate: () => ({
              first: async () => ({ id: CHQ_1, cheque_no: 'CHQ-7', status: 'DEPOSITED', receipt_id: RCP_1, amount: '3000.00' }),
            }),
            update: async () => 1,
            first: async () => ({ id: CHQ_1, status: 'CLEARED' }),
          }),
        };
      }
      if (table === 'collection_receipts') {
        return {
          where: () => ({
            first: async () => ({ collected_by_user_id: COLLECTOR_1, site_id: SITE_1 }),
          }),
        };
      }
      if (table === 'custody_ledger') {
        return {
          insert: async (row: any) => {
            custodyInserts.push(row);
            return [row];
          },
        };
      }
      if (table === 'users') {
        return {
          where: () => ({
            update: async (u: any) => {
              userUpdates.push(u);
              return 1;
            },
          }),
        };
      }
      return {};
    });

    // Previous custody balance was 7000 (4000 cash + 3000 cheque). Clearing 3000 cheque leaves 4000.
    const ledger: any = {
      getCustodyBalance: vi.fn().mockResolvedValue(Money.of('7000.00')),
    };

    const chqSvc = new ChequeService(knex, ledger, {} as any, {} as any);
    await chqSvc.clearCheque({ chequeId: CHQ_1, clearedBy: OWNER_1 });

    expect(custodyInserts).toHaveLength(1);
    expect(custodyInserts[0].entry_type).toBe('HANDOVER');
    expect(custodyInserts[0].amount_delta).toBe('-3000.00');
    expect(custodyInserts[0].running_balance).toBe('4000.00');
    expect(userUpdates[0]).toEqual({ cash_custody_balance: '4000.00' });
  });

  it('TC-P5-08: ChequeService.bounceCheque & returnCheque use negative amount_delta and prevent double reversal on BOUNCED -> RETURNED', async () => {
    const custodyInserts: any[] = [];
    const ledgerInserts: any[] = [];
    let currentStatus = 'DEPOSITED';

    const knex = makeKnexStub((table) => {
      if (table === 'cheque_register') {
        return {
          where: () => ({
            forUpdate: () => ({
              first: async () => ({
                id: CHQ_1,
                cheque_no: 'CHQ-8',
                status: currentStatus,
                receipt_id: RCP_1,
                amount: '2000.00',
              }),
            }),
            update: async (u: any) => {
              if (u.status) currentStatus = u.status;
              return 1;
            },
            first: async () => ({ id: CHQ_1, status: currentStatus }),
          }),
        };
      }
      if (table === 'collection_receipts') {
        return {
          where: () => ({
            first: async () => ({
              customer_id: CUST_1,
              collected_by_user_id: COLLECTOR_1,
              site_id: SITE_1,
              amount: '2000.00',
            }),
          }),
        };
      }
      if (table === 'customer_ledger_entries') {
        return { insert: async (r: any) => { ledgerInserts.push(r); return [r]; } };
      }
      if (table === 'customers' || table === 'users') {
        return { where: () => ({ update: async () => 1 }) };
      }
      if (table === 'custody_ledger') {
        return { insert: async (r: any) => { custodyInserts.push(r); return [r]; } };
      }
      if (table === 'receipt_allocations') {
        return { where: () => ({ join: () => ({ select: async () => [] }) }) };
      }
      return {};
    });

    const ledger: any = {
      getCustomerBalance: vi.fn().mockResolvedValue(Money.of('5000.00')),
      getCustodyBalance: vi.fn().mockResolvedValue(Money.of('6000.00')),
    };

    const chqSvc = new ChequeService(knex, ledger, {} as any, {} as any);
    await chqSvc.bounceCheque({ chequeId: CHQ_1, bouncedBy: OWNER_1, bounceReason: 'NSF' });
    expect(custodyInserts).toHaveLength(1);
    expect(custodyInserts[0].amount_delta).toBe('-2000.00');
    expect(custodyInserts[0].running_balance).toBe('4000.00');
    expect(ledgerInserts).toHaveLength(1);

    // Now return the already-bounced cheque -> must NOT reverse customer AR or custody a second time
    const retRes = await chqSvc.returnCheque({
      chequeId: CHQ_1,
      returnedBy: OWNER_1,
      returnReason: 'Handed back to customer',
    });
    expect(retRes.cheque.status).toBe('RETURNED');
    expect(custodyInserts).toHaveLength(1);
    expect(ledgerInserts).toHaveLength(1);
  });

  it('TC-P5-09: CodSettlementService lists driverName/orderNo and updates DRIVER custody + cached balance', async () => {
    const selectedFields: string[] = [];
    const custodyInserts: any[] = [];
    const userUpdates: any[] = [];

    const knex = makeKnexStub((table) => {
      if (table === 'delivery_stops as ds') {
        const ch: any = {
          join: () => ch,
          leftJoin: () => ch,
          where: () => ch,
          whereNotExists: () => ch,
          select: async (...cols: string[]) => {
            selectedFields.push(...cols);
            return [{ stopId: 'stop-1', tripNumber: 'TRP-1', driverName: 'Amit Driver', orderNo: 'SO-1' }];
          },
        };
        return ch;
      }
      if (table === 'delivery_stops') {
        return {
          where: () => ({ first: async () => ({ trip_id: 'trip-1' }) }),
        };
      }
      if (table === 'delivery_trips') {
        return {
          where: () => ({ first: async () => ({ driver_id: DRIVER_1 }) }),
        };
      }
      if (table === 'collection_receipts') {
        return {
          where: () => ({ andWhere: () => ({ first: async () => null }) }),
          insert: (r: any) => ({ returning: async () => [{ id: RCP_1, ...r }] }),
        };
      }
      if (table === 'customer_ledger_entries') {
        return { insert: async () => [] };
      }
      if (table === 'custody_ledger') {
        return { insert: async (r: any) => { custodyInserts.push(r); return [r]; } };
      }
      if (table === 'users') {
        return { where: () => ({ update: async (u: any) => { userUpdates.push(u); return 1; } }) };
      }
      return { where: () => ({ whereRaw: () => ({}) }) };
    });

    const codSvc = new CodSettlementService(
      knex,
      {
        getCustomerBalance: vi.fn().mockResolvedValue(Money.of('5000.00')),
        getCustodyBalance: vi.fn().mockResolvedValue(Money.zero()),
      } as any,
      { next: vi.fn().mockResolvedValue('RCP-COD-01') } as any,
      {} as any,
      {} as any,
    );

    const pending = await codSvc.listPendingCodStops(SITE_1);
    expect(pending[0].driverName).toBe('Amit Driver');
    expect(selectedFields).toContain('d.full_name as driverName');
    expect(selectedFields).toContain('so.order_no as orderNo');

    await (codSvc as any).settleCodStop(
      'stop-1',
      CUST_1,
      '',
      '3500.00',
      '3500.00',
      'DELIVERED',
      SITE_1,
      'trip-1',
    );

    expect(custodyInserts[0].user_id).toBe(DRIVER_1);
    expect(custodyInserts[0].amount_delta).toBe('3500.00');
    expect(userUpdates[0]).toEqual({ cash_custody_balance: '3500.00' });
  });

  it('TC-P5-10: End-to-end Driver COD -> EOD Blocked -> Handover Verified -> EOD Sign-Off Succeeds', async () => {
    let driverWalletBalance = 0;
    const handoverState = { status: 'PENDING', expected_amount: '4200.00', handed_by_user_id: DRIVER_1, site_id: SITE_1 };
    let eodStatus = 'OPEN';

    const makeUnifiedKnex = () =>
      makeKnexStub((table) => {
        if (table === 'delivery_trips') {
          const ch: any = {
            where: () => ch,
            whereNotIn: () => ch,
            count: () => ({ first: async () => ({ cnt: '0' }) }),
          };
          return ch;
        }
        if (table === 'custody_ledger as cl') {
          const ch: any = {
            join: () => ch,
            where: () => ch,
            groupBy: () => ch,
            havingRaw: () => ch,
            select: async () =>
              driverWalletBalance !== 0
                ? [{ userId: DRIVER_1, name: 'Driver COD', role: 'DRIVER', balance: driverWalletBalance.toFixed(2) }]
                : [],
          };
          return ch;
        }
        if (table === 'sales_orders') {
          const ch: any = {
            where: () => ch,
            whereNotExists: () => ch,
            count: () => ({ first: async () => ({ cnt: '0' }) }),
          };
          return ch;
        }
        if (table === 'invoices') return { whereRaw: () => ({}) };
        if (table === 'cashbook_entries') {
          return {
            where: () => ({
              where: () => ({
                whereIn: () => ({ sum: () => ({ first: async () => ({ total: '0.00' }) }) }),
              }),
            }),
            insert: async () => [],
          };
        }
        if (table === 'cash_handovers') {
          return {
            where: () => ({
              first: async () => ({ ...handoverState }),
              update: async (u: any) => {
                handoverState.status = u.status;
                return 1;
              },
            }),
          };
        }
        if (table === 'custody_ledger') {
          return {
            insert: async (r: any) => {
              driverWalletBalance += Number(r.amount_delta);
              return [r];
            },
          };
        }
        if (table === 'users') return { where: () => ({ update: async () => 1 }) };
        if (table === 'eod_closings') {
          return {
            where: () => ({
              andWhere: () => ({ first: async () => null }),
              first: async () => ({
                id: 'eod-99',
                site_id: SITE_1,
                date: '2026-11-27',
                status: eodStatus,
                initiated_at: new Date(),
              }),
              update: async (u: any) => {
                eodStatus = u.status;
                return 1;
              },
            }),
            insert: (r: any) => ({ returning: async () => [{ id: 'eod-99', ...r }] }),
          };
        }
        return {};
      });

    // Step 1: Driver has 4200 COD collected
    driverWalletBalance = 4200;
    const knex = makeUnifiedKnex();
    const outboxEvents: string[] = [];
    const eodSvc = new EodService(
      knex,
      {} as any,
      {} as any,
      { raise: vi.fn(async (_trx, evt) => { outboxEvents.push(evt); return 'e1'; }) } as any,
      {} as any,
      {} as any,
    );

    const blockedEod = await eodSvc.initiateClosing(SITE_1, OWNER_1, '2026-11-27');
    expect(blockedEod.canSignOff).toBe(false);
    await expect(eodSvc.signOff('eod-99', OWNER_1)).rejects.toThrow('Cannot sign off: cash not handed over');

    // Step 2: Cashier verifies driver handover -> clears custody wallet to 0
    const handoverSvc = new HandoverService(
      knex,
      {} as any,
      { getCustodyBalance: vi.fn(async () => Money.of(driverWalletBalance.toFixed(2))) } as any,
      {} as any,
    );
    const verified = await handoverSvc.verifyHandover({
      handoverId: 'ho-99',
      receivedByUserId: OWNER_1,
      countedAmount: '4200.00',
    });
    expect(verified.status).toBe('VERIFIED');
    expect(driverWalletBalance).toBe(0);

    // Step 3: EOD Sign-off now succeeds and emits eod.closed
    const signed = await eodSvc.signOff('eod-99', OWNER_1);
    expect(signed.success).toBe(true);
    expect(eodStatus).toBe('SIGNED_OFF');
    expect(outboxEvents).toEqual(['eod.closed']);
  });

  it('TC-P5-11: HandoverService.listHandovers exposes handedByRole and ChequeService.listCheques joins customer_name', async () => {
    const hoSelects: any[] = [];
    const hoChain: any = {
      leftJoin: () => hoChain,
      where: () => hoChain,
      clone: () => ({ count: () => ({ first: async () => ({ count: '1' }) }) }),
      select: (...cols: string[]) => {
        hoSelects.push(...cols);
        return {
          orderBy: () => ({
            limit: () => ({
              offset: async () => [{ id: 'ho-1', handedByName: 'Driver A', handedByRole: 'DRIVER' }],
            }),
          }),
        };
      },
    };
    const hoSvc = new HandoverService(makeKnexStub(() => hoChain), {} as any, {} as any, {} as any);
    const hoRes = await hoSvc.listHandovers({ siteId: SITE_1 });
    expect(hoSelects).toContain('h.role as handedByRole');
    expect(hoRes.items[0].handedByRole).toBe('DRIVER');

    const chqSelects: string[] = [];
    const chqAwaitable: any = {
      where: () => chqAwaitable,
      andWhere: () => chqAwaitable,
      then: (resolve: (val: any) => any) =>
        resolve([{ id: CHQ_1, customer_name: 'Sahyadri Dairy' }]),
    };
    const chqChain: any = {
      join: () => chqChain,
      leftJoin: () => chqChain,
      orderBy: () => chqChain,
      limit: () => chqChain,
      where: () => chqChain,
      select: (...cols: string[]) => {
        chqSelects.push(...cols);
        return chqAwaitable;
      },
    };
    const chqSvc = new ChequeService(makeKnexStub(() => chqChain), {} as any, {} as any, {} as any);
    const chqRows = await chqSvc.listCheques(SITE_1);
    expect(chqSelects).toContain('customers.business_name as customer_name');
    expect(chqRows[0].customer_name).toBe('Sahyadri Dairy');
  });

  it('TC-P5-12: Verifies Finance Office UI wiring for EOD, COD, Handovers, Collections, Credit Notes, and PTP', () => {
    const eodUi = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/eod/page.tsx'), 'utf8');
    const codUi = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/cod/page.tsx'), 'utf8');
    const homeUi = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/page.tsx'), 'utf8');
    const handoverUi = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/handovers/page.tsx'), 'utf8');
    const colUi = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/collections/page.tsx'), 'utf8');
    const cnUi = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/credit-notes/page.tsx'), 'utf8');
    const ptpUi = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/finance/ptp/page.tsx'), 'utf8');

    expect(eodUi).toContain('/deposit-slip');
    expect(eodUi).toContain('/deposit-slip/pdf');
    expect(eodUi).toContain('if (!hasBackendChecklist)');
    expect(codUi).toContain('s.tripNumber');
    expect(codUi).toContain('s.codCollectedAmount');
    expect(homeUi).toContain('!s.status');
    expect(handoverUi).toContain('/resolve');
    expect(handoverUi).toContain('handedByRole');
    expect(colUi).toContain('chequeDetails');
    expect(cnUi).toContain('${action}');
    expect(cnUi).toContain("'approve'");
    expect(cnUi).not.toContain('/apply');
    expect(ptpUi).toContain("method: 'PATCH'");
  });
});
