/**
 * Frontend plan 01 — Gap I-1 / I-2 verification
 *  - /auth/me returns permissions[], sites[], preferredLanguage (AuthService)
 *  - Frontend never uses a hard-coded role→permission map
 *  - Every nav permission code exists in the backend (drift guard)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthService } from '../../../api/src/modules/m0-platform/auth.service.js';
import {
  ALL_NAV_ITEMS,
  can,
  getAuthorizedNavItems,
  toSessionUser,
} from '../../../../packages/shared/src/index.js';
import * as shared from '../../../../packages/shared/src/index.js';

/** Minimal chainable knex mock keyed by table name. */
function mockKnex(tables: Record<string, any>) {
  const fn = (table: string) => {
    const data = tables[table];
    const chain: any = {
      where: () => chain,
      andWhere: () => chain,
      whereIn: () => chain,
      first: async () => data,
      pluck: async () => data,
      select: async () => data,
    };
    return chain;
  };
  return fn as any;
}

const baseUser = {
  id: 'u1',
  full_name: 'Priya Deshmukh',
  phone: '+919822000002',
  role: 'OPS_COORD',
  assigned_site_id: 's1',
  preferred_language: 'mr',
  password_hash: 'x',
  pin_hash: 'y',
};

function svc(role: string, tables: Record<string, any> = {}) {
  return new AuthService(
    mockKnex({
      users: { ...baseUser, role },
      user_site_access: ['s2', 's1'],
      sites: [
        { id: 's1', name: 'Pune Central', site_type: 'WAREHOUSE' },
        { id: 's2', name: 'Vashi', site_type: 'FACTORY' },
      ],
      role_permissions: [
        { permission_code: 'order.view' },
        { permission_code: 'customer.view' },
      ],
      ...tables,
    }),
    {} as any,
  );
}

describe('F0 — /auth/me enrichment (gap I-2)', () => {
  it('TC-F0-01 returns sorted permissions from role_permissions', async () => {
    const me = await svc('OPS_COORD').getUserWithSites('u1');
    expect(me.permissions).toEqual(['customer.view', 'order.view']);
  });

  it('TC-F0-02 OWNER receives wildcard permission', async () => {
    const me = await svc('OWNER').getUserWithSites('u1');
    expect(me.permissions).toEqual(['*']);
  });

  it('TC-F0-03 returns sites with id, name, type', async () => {
    const me = await svc('OPS_COORD').getUserWithSites('u1');
    expect(me.sites).toContainEqual({
      id: 's1',
      name: 'Pune Central',
      type: 'WAREHOUSE',
    });
  });

  it('TC-F0-04 de-duplicates siteIds', async () => {
    const me = await svc('OPS_COORD').getUserWithSites('u1');
    expect(me.siteIds.sort()).toEqual(['s1', 's2']);
  });

  it('TC-F0-05 returns name and preferredLanguage', async () => {
    const me = await svc('OPS_COORD').getUserWithSites('u1');
    expect(me.name).toBe('Priya Deshmukh');
    expect(me.preferredLanguage).toBe('mr');
  });

  it('TC-F0-06 returns null for unknown/inactive user', async () => {
    const me = await svc('OPS_COORD', { users: undefined }).getUserWithSites('x');
    expect(me).toBeNull();
  });
});

describe('F0 — frontend permission model (gap I-1)', () => {
  it('TC-F0-07 hard-coded ROLE_PERMISSIONS is no longer exported', () => {
    expect((shared as any).ROLE_PERMISSIONS).toBeUndefined();
  });

  it('TC-F0-08 user without server permissions can do nothing (deny by default)', () => {
    const u = { role: 'OPS_COORD' as const, siteIds: ['s1'] };
    expect(can(u, 'order.view')).toBe(false);
    expect(getAuthorizedNavItems(u)).toEqual([]);
  });

  it('TC-F0-09 toSessionUser maps /auth/me payload', () => {
    const u = toSessionUser({
      id: 'u1',
      full_name: 'Priya',
      phone: '1',
      role: 'OPS_COORD',
      siteIds: ['s1'],
      preferredLanguage: 'mr',
      permissions: ['order.view'],
    });
    expect(u).toMatchObject({
      name: 'Priya',
      activeSiteId: 's1',
      preferredLanguage: 'mr',
      permissions: ['order.view'],
    });
  });

  it('TC-F0-10 toSessionUser defaults: missing permissions => [], unknown language => en', () => {
    const u = toSessionUser({ id: 'u', phone: '1', role: 'DRIVER', preferredLanguage: 'fr' });
    expect(u.permissions).toEqual([]);
    expect(u.preferredLanguage).toBe('en');
    expect(u.activeSiteId).toBe('');
  });

  it('TC-F0-11 server-granted permission unlocks matching nav item', () => {
    const u = toSessionUser({
      id: 'u', phone: '1', role: 'OPS_COORD', siteIds: ['s1'],
      permissions: ['order.view', 'order.create'],
    });
    const ids = getAuthorizedNavItems(u, 'WEB').map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['coord-home', 'sales-orders', 'sales-quick-order']));
    expect(ids).not.toContain('fin-invoices');
  });

  it('TC-F0-12 OWNER wildcard sees every web nav item except nothing hidden', () => {
    const u = toSessionUser({ id: 'o', phone: '1', role: 'OWNER', permissions: ['*'] });
    expect(getAuthorizedNavItems(u, 'WEB')).toHaveLength(
      ALL_NAV_ITEMS.filter((n) => n.surface === 'WEB').length,
    );
  });

  it('TC-F0-13 nav permission codes all exist in backend (drift guard)', () => {
    const root = path.resolve(__dirname, '../../../..');
    const codes = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.ts') && !e.name.includes('spec')) {
          const txt = fs.readFileSync(full, 'utf8');
          for (const m of txt.matchAll(/RequirePermission\(([^)]*)\)/g))
            for (const c of m[1].matchAll(/'([a-z_]+\.[a-z_]+)'/g)) codes.add(c[1]);
        }
      }
    };
    walk(path.join(root, 'apps/api/src'));
    const migDir = path.join(root, 'db/migrations');
    for (const f of fs.readdirSync(migDir).filter((n) => n.endsWith('.sql')))
      for (const m of fs
        .readFileSync(path.join(migDir, f), 'utf8')
        .matchAll(/\('(?:OWNER|OPS_COORD|PROD_MGR|STOREKEEPER|DRIVER|COLLECTOR)',\s*'([a-z_]+\.[a-z_]+)'/g))
        codes.add(m[1]);

    const unknown = ALL_NAV_ITEMS.map((n) => n.requiredPermission).filter(
      (c) => !codes.has(c),
    );
    expect(unknown).toEqual([]);
  });
});

