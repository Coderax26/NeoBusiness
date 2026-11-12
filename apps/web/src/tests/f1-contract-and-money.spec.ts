/**
 * Frontend plan 01 — gaps I-3 (typed contract), I-4 (exact money), I-5 (workspace imports),
 * I-6 (prototype flagged), plus §7.4 follow-ups (permission seeds, per-role RBAC cache TTL).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// I-5: workspace-style imports (no ../../../../packages/...)
import {
  addMoney,
  allocateReceiptFifo,
  cmpMoney,
  evaluateCreditStatus,
  evaluatePriceBand,
  formatINR,
  fromScaled,
  mulMoney,
  pctOf,
  simulateCounterOfferMargin,
  subMoney,
  toScaled,
} from '@neo/shared';
import { API_ROUTES, EXCEPTION_TYPES, isKnownRoute } from '@neo/api-client';
import { INITIAL_EXCEPTIONS_FIXTURE } from '@neo/mocks';
import { PermissionService } from '../../../api/src/modules/m0-platform/rbac.service.js';
// @ts-expect-error — plain ESM script without type declarations
import { renderRoutesFile, OUTPUT_FILE } from '../../../../scripts/generate-api-routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

function listTs(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') listTs(p, out);
    } else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('F1 — exact money arithmetic (gap I-4)', () => {
  it('TC-F1-01 addMoney has no float drift (0.1 + 0.2 = 0.30)', () => {
    expect(addMoney('0.1', '0.2')).toBe('0.30');
    expect(subMoney('0.3', '0.1')).toBe('0.20');
  });

  it('TC-F1-02 mulMoney handles fractional quantities and rounds half-up', () => {
    expect(mulMoney('19.99', '3')).toBe('59.97');
    expect(mulMoney('12.345', '2.5')).toBe('30.86'); // 30.8625
    expect(mulMoney('1.005', '1')).toBe('1.01'); // float toFixed gives 1.00
  });

  it('TC-F1-03 pctOf: rounding, negatives, zero denominator', () => {
    expect(pctOf('1', '3')).toBe('33.33');
    expect(pctOf('-1', '3')).toBe('-33.33');
    expect(pctOf('2', '3', 1)).toBe('66.7');
    expect(pctOf('5', '0')).toBe('0.00');
  });

  it('TC-F1-04 toScaled/fromScaled round-trip strings, strip ₹ and commas, reject garbage', () => {
    expect(fromScaled(toScaled('₹4,82,450.50'))).toBe('482450.50');
    expect(fromScaled(toScaled('-0.004'))).toBe('0.00'); // never "-0.00"
    expect(fromScaled(toScaled(null))).toBe('0.00');
    expect(() => toScaled('abc')).toThrow();
  });

  it('TC-F1-05 cmpMoney is exact (0.1+0.2 number equals 0.3)', () => {
    expect(cmpMoney(0.1 + 0.2, 0.3)).toBe(0); // 0.30000000000000004 vs 0.3
    expect(cmpMoney('10.00', '9.99')).toBe(1);
  });

  it('TC-F1-06 formatINR is exact for large 2-dp strings', () => {
    expect(formatINR('99999999999999.99')).toBe('₹9,99,99,99,99,99,999.99');
    expect(formatINR('1234567.891')).toBe('₹12,34,567.89');
    expect(formatINR('-1000')).toBe('-₹1,000.00');
    expect(formatINR('not-a-number')).toBe('₹0.00');
  });

  it('TC-F1-07 price band uses exact comparison at the floor boundary', () => {
    const r = evaluatePriceBand(0.3, 0.1 + 0.2, 0.5, 0.2);
    expect(r.status).toBe('BELOW_TARGET'); // not BELOW_FLOOR due to float noise
    expect(r.requiresOverride).toBe(false);
    expect(r.marginPct).toBe(33.33);
  });

  it('TC-F1-08 counter-offer simulator: exact line total and gross profit', () => {
    const s = simulateCounterOfferMargin(19.99, 15, 12.1, 3);
    expect(s.lineTotal).toBe(59.97);
    expect(s.grossProfit).toBe(23.67);
    expect(s.isAboveFloor).toBe(true);
  });

  it('TC-F1-09 credit evaluation: no float false-positive over limit', () => {
    const r = evaluateCreditStatus(0.1, 0.2, 0.3, 0);
    expect(r.isOverLimit).toBe(false);
    expect(r.projectedExposure).toBe(0.3);
  });

  it('TC-F1-10 FIFO allocation of 0.3 across 0.1 + 0.2 leaves exactly 0', () => {
    const res = allocateReceiptFifo(0.3, [
      { invoiceId: 'a', invoiceNumber: 'A', invoiceDate: '2026-01-01', outstandingAmount: 0.1 },
      { invoiceId: 'b', invoiceNumber: 'B', invoiceDate: '2026-01-02', outstandingAmount: 0.2 },
    ]);
    expect(res.allocations.map((a) => a.allocatedAmount)).toEqual([0.1, 0.2]);
    expect(res.unallocatedAdvance).toBe(0);
  });
});

describe('F1 — API contract drift guard (gap I-3)', () => {
  it('TC-F1-11 EXCEPTION_TYPES equals backend ExceptionType union (12 types)', () => {
    const src = read('apps/api/src/shared/ports/ports.interface.ts');
    const block = /export type ExceptionType =([^;]+);/.exec(src)![1];
    const backend = [...block.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
    expect([...EXCEPTION_TYPES].sort()).toEqual(backend);
    expect(backend).toHaveLength(12);
  });

  it('TC-F1-12 every mock exception uses a real backend type', () => {
    for (const e of INITIAL_EXCEPTIONS_FIXTURE) expect(EXCEPTION_TYPES).toContain(e.exceptionType);
  });

  it('TC-F1-13 routes.generated.ts is in sync with NestJS controllers', () => {
    const current = fs.readFileSync(OUTPUT_FILE, 'utf8').replace(/\r\n/g, '\n');
    expect(current).toBe(renderRoutesFile());
  });

  it('TC-F1-14 route table covers the backend (>= 200 routes, all modules)', () => {
    expect(API_ROUTES.length).toBeGreaterThanOrEqual(200);
    const modules = new Set(API_ROUTES.map((r) => r.module.split('/')[1]?.slice(0, 2)));
    for (const m of ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']) expect(modules).toContain(m);
  });

  it('TC-F1-15 isKnownRoute matches parameterised paths and rejects unknown ones', () => {
    expect(isKnownRoute('POST', '/orders/123/confirm')).toBe(true);
    expect(isKnownRoute('POST', '/exceptions/abc/resolve')).toBe(true);
    expect(isKnownRoute('GET', '/orders?limit=5')).toBe(true);
    expect(isKnownRoute('GET', '/grn/blind')).toBe(false);
    expect(isKnownRoute('DELETE', '/orders/1/confirm')).toBe(false);
  });

  it('TC-F1-16 paths used by web desks / tablet outbox exist in the backend', () => {
    expect(isKnownRoute('POST', '/orders')).toBe(true); // commercial desk
    expect(isKnownRoute('POST', '/exceptions/x/resolve')).toBe(true); // control tower
    expect(isKnownRoute('POST', '/procurement/grns')).toBe(true); // tablet blind GRN
    expect(isKnownRoute('POST', '/production/work-orders/x/complete')).toBe(true); // tablet
    const tablet = read('apps/tablet/src/index.ts');
    expect(tablet).not.toContain("'/grn/blind'");
    expect(tablet).not.toMatch(/path: `\/work-orders\//);
  });

  it('TC-F1-17 backend gap G-FLT-2: /trips/:id/confirm-loading is now implemented and known', () => {
    expect(isKnownRoute('POST', '/trips/1/confirm-loading')).toBe(true);
  });

  it('TC-F1-23 backend enablement endpoints are mapped and known (admin, search, attachments, audit, notifications, supplier payment, inventory)', () => {
    expect(isKnownRoute('GET', '/search')).toBe(true);
    expect(isKnownRoute('GET', '/admin/users')).toBe(true);
    expect(isKnownRoute('POST', '/admin/users')).toBe(true);
    expect(isKnownRoute('GET', '/admin/sites')).toBe(true);
    expect(isKnownRoute('GET', '/admin/business-rules')).toBe(true);
    expect(isKnownRoute('GET', '/admin/approval-policies')).toBe(true);
    expect(isKnownRoute('GET', '/admin/doc-sequences')).toBe(true);
    expect(isKnownRoute('GET', '/audit-logs')).toBe(true);
    expect(isKnownRoute('GET', '/notifications')).toBe(true);
    expect(isKnownRoute('POST', '/attachments/presign')).toBe(true);
    expect(isKnownRoute('POST', '/procurement/supplier-bills/1/pay')).toBe(true);
    expect(isKnownRoute('GET', '/procurement/supplier-bills/ap/aging')).toBe(true);
    expect(isKnownRoute('GET', '/procurement/suppliers/1/ledger')).toBe(true);
    expect(isKnownRoute('GET', '/inventory/transfers')).toBe(true);
    expect(isKnownRoute('GET', '/inventory/adjustments')).toBe(true);
    expect(isKnownRoute('GET', '/inventory/reservations')).toBe(true);
    expect(isKnownRoute('GET', '/issues')).toBe(true);
    expect(isKnownRoute('GET', '/trip-expenses')).toBe(true);
  });
});

describe('F1 — workspace imports & prototype (gaps I-5, I-6)', () => {
  it('TC-F1-18 no deep relative imports of packages/* in apps/*/src', () => {
    const offenders: string[] = [];
    for (const app of ['web', 'tablet', 'mobile']) {
      for (const f of listTs(path.join(root, 'apps', app, 'src'))) {
        if (/from '(\.\.\/)+packages\//.test(fs.readFileSync(f, 'utf8'))) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('TC-F1-19 tsconfig.base.json maps every @neo/* package to an existing entry file', () => {
    const paths = JSON.parse(read('tsconfig.base.json')).compilerOptions.paths as Record<string, string[]>;
    expect(Object.keys(paths).sort()).toEqual(
      ['@neo/api-client', '@neo/i18n', '@neo/mocks', '@neo/shared', '@neo/ui'],
    );
    for (const targets of Object.values(paths)) {
      expect(fs.existsSync(path.join(root, targets[0]))).toBe(true);
    }
  });

  it('TC-F1-20 static HTML prototype is flagged as visual reference only', () => {
    expect(read('apps/web/public/control-tower.html')).toContain('VISUAL REFERENCE ONLY');
  });
});

describe('F1 — backend follow-ups from §7.4', () => {
  it('TC-F1-21 RBAC cache TTL is per role (loading role B does not extend role A)', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const knex: any = () => ({
        where: () => ({
          select: async () => {
            calls++;
            return [{ permission_code: 'x.read' }];
          },
        }),
      });
      const svc = new PermissionService(knex);
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      await svc.getPermissions('A'); // load A @0s
      vi.setSystemTime(new Date('2026-01-01T00:00:50Z'));
      await svc.getPermissions('B'); // load B @50s
      expect(calls).toBe(2);
      vi.setSystemTime(new Date('2026-01-01T00:01:10Z'));
      await svc.getPermissions('A'); // A is 70s old -> must reload
      expect(calls).toBe(3);
      await svc.getPermissions('B'); // B is 20s old -> cached
      expect(calls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('TC-F1-22 migration 030 seeds read permissions for OPS_COORD and inventory.read for floor roles', () => {
    const sql = read('db/migrations/20261112_030_frontend_enablement_permissions.sql');
    for (const code of ['supplier.read', 'po.read', 'requisition.read', 'inventory.read', 'grn.read']) {
      expect(sql).toContain(`('OPS_COORD',   '${code}'`);
    }
    expect(sql).toContain("('PROD_MGR',    'inventory.read'");
    expect(sql).toContain("('STOREKEEPER', 'inventory.read'");
    expect(sql).toContain('ON CONFLICT (role, permission_code) DO NOTHING');
  });
});
