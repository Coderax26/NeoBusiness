import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from '../admin.service.js';
import { AdminController } from '../admin.controller.js';
import { AuditController } from '../audit.controller.js';
import { NotificationsController } from '../notifications.controller.js';
import { SearchController } from '../search.controller.js';
import { AttachmentsController } from '../attachments.controller.js';

function createMockKnex(data: Record<string, any> = {}) {
  const handler = (tableName: string) => {
    const baseTable = tableName.split(' ')[0];
    let result = data[baseTable] ?? data[tableName] ?? [];
    const chain: any = {
      _data: result,
      leftJoin: vi.fn(() => chain),
      join: vi.fn(() => chain),
      where: vi.fn(() => chain),
      andWhere: vi.fn(() => chain),
      whereILike: vi.fn(() => chain),
      whereIn: vi.fn(() => chain),
      select: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      clone: vi.fn(() => chain),
      first: vi.fn(async () => (Array.isArray(result) ? result[0] : result)),
      count: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      returning: vi.fn(async () => (Array.isArray(result) ? result : [result])),
      onConflict: vi.fn(() => chain),
      ignore: vi.fn(async () => []),
      then: (resolve: any) => resolve(result),
    };
    return chain;
  };
  return handler as any;
}

describe('Frontend Enablement — Admin & Cross-Cutting APIs (Section 5 & 6)', () => {
  let mockKnex: any;
  let mockConfigService: any;
  let adminService: AdminService;

  beforeEach(() => {
    mockConfigService = {
      invalidate: vi.fn(),
    };
  });

  describe('AdminService — Users', () => {
    it('listUsers applies filters and returns user rows', async () => {
      const users = [
        {
          id: 'u1',
          full_name: 'Priya Deshmukh',
          phone: '+919822000002',
          role: 'OPS_COORD',
          assigned_site_id: 's1',
          assigned_site_name: 'Pune Hub',
          is_active: true,
        },
      ];
      mockKnex = createMockKnex({ users });
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.listUsers({ role: 'OPS_COORD', isActive: true });
      expect(res).toEqual(users);
    });

    it('getUserById returns user with mapped sites', async () => {
      mockKnex = (table: string) => {
        const chain: any = {
          leftJoin: () => chain,
          join: () => chain,
          where: () => chain,
          select: () => chain,
          first: async () => ({
            id: 'u1',
            full_name: 'Priya',
            phone: '+919822000002',
            role: 'OPS_COORD',
          }),
          then: (resolve: any) =>
            resolve([
              { id: 's1', name: 'Pune Hub', site_type: 'WAREHOUSE' },
            ]),
        };
        return chain;
      };
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.getUserById('u1');
      expect(res.full_name).toBe('Priya');
      expect(res.sites).toHaveLength(1);
    });

    it('createUser hashes pin/password and inserts user', async () => {
      const createdUser = {
        id: 'new-id',
        full_name: 'Amit Kumar',
        phone: '+919822000099',
        role: 'DRIVER',
      };
      mockKnex = (table: string) => {
        const chain: any = {
          where: () => chain,
          first: async () => null, // no existing user
          insert: () => chain,
          returning: async () => [createdUser],
          onConflict: () => chain,
          ignore: async () => [],
        };
        return chain;
      };
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.createUser({
        fullName: 'Amit Kumar',
        phone: '+919822000099',
        role: 'DRIVER',
        pin: '1234',
        assignedSiteId: 's1',
      });
      expect(res.phone).toBe('+919822000099');
    });

    it('resetPin hashes new PIN and updates user', async () => {
      mockKnex = (table: string) => {
        const chain: any = {
          where: () => chain,
          first: async () => ({ id: 'u1' }),
          update: async () => 1,
        };
        return chain;
      };
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.resetPin('u1', '9999');
      expect(res.message).toBe('PIN reset successfully');
    });
  });

  describe('AdminService — Sites & Locations', () => {
    it('listSites returns active sites', async () => {
      const sites = [
        { id: 's1', name: 'Pune Central', site_type: 'WAREHOUSE', is_active: true },
      ];
      mockKnex = createMockKnex({ sites });
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.listSites(false);
      expect(res).toEqual(sites);
    });

    it('createSite creates new site record', async () => {
      const site = { id: 's2', name: 'Vashi Depot', site_type: 'FACTORY' };
      mockKnex = (table: string) => {
        const chain: any = {
          insert: () => chain,
          returning: async () => [site],
        };
        return chain;
      };
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.createSite({ name: 'Vashi Depot', siteType: 'FACTORY' });
      expect(res.name).toBe('Vashi Depot');
    });
  });

  describe('AdminService — Roles & Permissions', () => {
    it('listRoles groups permissions by role', async () => {
      const rolePerms = [
        { role: 'OWNER', permission_code: '*' },
        { role: 'OPS_COORD', permission_code: 'order.view' },
        { role: 'OPS_COORD', permission_code: 'order.create' },
      ];
      mockKnex = (table: string) => {
        const chain: any = {
          select: () => chain,
          orderBy: () => chain,
          then: (resolve: any) => resolve(rolePerms),
        };
        return chain;
      };
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.listRoles();
      expect(res).toHaveLength(2);
      const coord = res.find((r) => r.role === 'OPS_COORD');
      expect(coord?.permissions).toEqual(['order.view', 'order.create']);
    });
  });

  describe('AdminService — Business Rules & Approval Policies', () => {
    it('updateBusinessRule updates config and invalidates cache', async () => {
      mockKnex = (table: string) => {
        const chain: any = {
          where: () => chain,
          first: async () => ({ key: 'min_margin_pct_default', description: 'Min margin' }),
          update: () => chain,
          returning: async () => [{ key: 'min_margin_pct_default', value_json: 0.12 }],
        };
        return chain;
      };
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.updateBusinessRule('min_margin_pct_default', {
        valueJson: 0.12,
      });
      expect(res.value_json).toBe(0.12);
      expect(mockConfigService.invalidate).toHaveBeenCalledWith('min_margin_pct_default');
    });

    it('updateApprovalPolicy updates exception policy', async () => {
      mockKnex = (table: string) => {
        const chain: any = {
          where: () => chain,
          first: async () => ({ exception_type: 'PRICE_OVERRIDE' }),
          update: () => chain,
          returning: async () => [
            { exception_type: 'PRICE_OVERRIDE', delegate_value_cap_inr: '10000.00' },
          ],
        };
        return chain;
      };
      adminService = new AdminService(mockKnex, mockConfigService);

      const res = await adminService.updateApprovalPolicy('PRICE_OVERRIDE', {
        delegateValueCapInr: 10000,
      });
      expect(res.delegate_value_cap_inr).toBe('10000.00');
    });
  });

  describe('Cross-Cutting Controllers', () => {
    it('AuditController returns paginated audit rows', async () => {
      const mockAuditKnex: any = () => {
        const chain: any = {
          leftJoin: () => chain,
          where: () => chain,
          count: () => chain,
          first: async () => ({ count: '1' }),
          select: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          offset: () => chain,
          clone: () => chain,
          then: (resolve: any) =>
            resolve([
              { id: 'a1', action: 'CREATE', entity_name: 'orders', timestamp: new Date() },
            ]),
        };
        return chain;
      };
      const controller = new AuditController(mockAuditKnex);
      const res = await controller.listAuditLogs();
      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });

    it('NotificationsController lists notifications and marks read', async () => {
      const notifs = [{ id: 'n1', status: 'QUEUED', channel: 'IN_APP' }];
      const mockNotifKnex: any = () => {
        const chain: any = {
          where: () => chain,
          count: () => chain,
          first: async () => ({ count: '1' }),
          select: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          offset: () => chain,
          clone: () => chain,
          update: async () => 1,
          then: (resolve: any) => resolve(notifs),
        };
        return chain;
      };
      const controller = new NotificationsController(mockNotifKnex);
      const list = await controller.listNotifications({ user: { id: 'u1' } });
      expect(list.data).toEqual(notifs);

      const readRes = await controller.markRead('n1');
      expect(readRes.status).toBe('DELIVERED');
    });

    it('SearchController searches across 5 entities', async () => {
      const mockSearchKnex: any = () => {
        const chain: any = {
          leftJoin: () => chain,
          where: () => chain,
          andWhere: () => chain,
          whereILike: () => chain,
          select: () => chain,
          limit: () => chain,
          then: (resolve: any) => resolve([{ id: '1', name: 'Match' }]),
        };
        return chain;
      };
      const controller = new SearchController(mockSearchKnex);
      const res = await controller.search('Dairy');
      expect(res).toHaveProperty('customers');
      expect(res).toHaveProperty('orders');
      expect(res).toHaveProperty('items');
      expect(res).toHaveProperty('suppliers');
      expect(res).toHaveProperty('trips');
    });

    it('AttachmentsController presigns attachment upload and lists', async () => {
      const att = {
        id: 'att-1',
        entity_name: 'delivery_stops',
        entity_id: 'stop-1',
        storage_key: 'attachments/delivery_stops/stop-1/att-1-pod.jpg',
      };
      const mockAttKnex: any = () => {
        const chain: any = {
          insert: () => chain,
          returning: async () => [att],
          where: () => chain,
          orderBy: () => chain,
          then: (resolve: any) => resolve([att]),
        };
        return chain;
      };
      const controller = new AttachmentsController(mockAttKnex);
      const presign = await controller.presign(
        {
          entityName: 'delivery_stops',
          entityId: 'stop-1',
          fileName: 'pod.jpg',
          mimeType: 'image/jpeg',
        },
        { user: { id: 'u1' } },
      );
      expect(presign.storageKey).toContain('pod.jpg');

      const list = await controller.listAttachments('delivery_stops', 'stop-1');
      expect(list).toEqual([att]);
    });
  });
});
