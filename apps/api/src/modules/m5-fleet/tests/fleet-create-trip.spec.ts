import { describe, expect, it, vi } from 'vitest';
import { FleetService } from '../fleet.service.js';

const SITE_1 = '11111111-1111-4111-8111-111111111111';
const DRIVER_1 = '22222222-2222-4222-8222-222222222222';
const OWNER_1 = '44444444-4444-4444-8444-444444444444';
const CUST_1 = '55555555-5555-4555-8555-555555555555';
const VEH_1 = '88888888-8888-4888-8888-888888888888';
const ITEM_1 = '99999999-9999-4999-8999-999999999999';

function makeKnexStub(tableHandler: (table: string) => any) {
  const fn: any = (table: string) => tableHandler(table);
  fn.raw = vi.fn((sql: string, params?: any[]) => ({ sql, params }));
  fn.fn = { now: () => new Date() };
  fn.transaction = async (cb: (trx: any) => any) => cb(fn);
  return fn;
}

describe('FleetService.createTrip freight_cost regression', () => {
  it('defaults freight_cost to 0.00 (never null) for OWN_FLEET and omitted THIRD_PARTY freightCost', async () => {
    const insertedTrips: any[] = [];
    let lastTrip: any = null;

    const knex = makeKnexStub((table) => {
      if (table === 'vehicles') {
        return {
          where: () => ({
            first: async () => ({ id: VEH_1, site_id: SITE_1, is_active: true, capacity_kg: 1000 }),
          }),
        };
      }
      if (table === 'users') {
        return {
          where: () => ({
            first: async () => ({ id: DRIVER_1, role: 'DRIVER' }),
          }),
        };
      }
      if (table === 'delivery_trips') {
        return {
          insert: (row: any) => {
            insertedTrips.push(row);
            lastTrip = { id: `trip-${insertedTrips.length}`, ...row };
            return { returning: async () => [lastTrip] };
          },
        };
      }
      if (table === 'delivery_stops') {
        return {
          insert: () => ({ returning: async () => [{ id: 'stop-1' }] }),
        };
      }
      if (table === 'delivery_stop_lines' || table === 'collection_receipts') {
        return {
          insert: async () => [],
          where: () => ({ whereIn: () => ({ select: async () => [] }) }),
        };
      }
      if (table === 'delivery_trips as dt') {
        return {
          leftJoin: function () { return this; },
          where: () => ({
            first: async () => ({
              ...lastTrip,
              registration_no: 'MH-12-AB1234',
              driver_name: 'Driver 1',
              driver_phone: '9999999999',
              site_name: 'Baramati',
            }),
          }),
        };
      }
      if (table === 'delivery_stops as ds') {
        return {
          leftJoin: function () { return this; },
          where: function () { return this; },
          select: function () { return this; },
          orderBy: async () => [],
        };
      }
      if (table === 'trip_expenses' || table === 'issue_reports') {
        return {
          where: () => ({ count: () => ({ first: async () => ({ cnt: '0' }) }) }),
        };
      }
      if (table === 'delivery_challans') {
        return {
          where: () => ({ select: async () => [] }),
        };
      }
      return {};
    });

    const fleetSvc = new FleetService(
      knex,
      { next: async () => `T-2611-000${insertedTrips.length + 1}` } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
    );

    await fleetSvc.createTrip(
      {
        siteId: SITE_1,
        tripDate: '2026-11-28',
        vehicleId: VEH_1,
        driverId: DRIVER_1,
        stops: [{ customerId: CUST_1, sequenceNo: 1, lines: [{ itemId: ITEM_1, loadedQty: 10 }] }],
      },
      OWNER_1,
    );

    await fleetSvc.createTrip(
      {
        siteId: SITE_1,
        tripDate: '2026-11-28',
        dispatchMode: 'THIRD_PARTY',
        transporterName: 'VRL Logistics',
        externalVehicleNo: 'MH-42-T-9821',
        stops: [{ customerId: CUST_1, sequenceNo: 1, lines: [{ itemId: ITEM_1, loadedQty: 10 }] }],
      },
      OWNER_1,
    );

    await fleetSvc.createTrip(
      {
        siteId: SITE_1,
        tripDate: '2026-11-28',
        dispatchMode: 'THIRD_PARTY',
        transporterName: 'Porter',
        externalVehicleNo: 'MH-14-T-1001',
        freightCost: 2500,
        stops: [{ customerId: CUST_1, sequenceNo: 1, lines: [{ itemId: ITEM_1, loadedQty: 10 }] }],
      },
      OWNER_1,
    );

    expect(insertedTrips[0].freight_cost).toBe('0.00');
    expect(insertedTrips[1].freight_cost).toBe('0.00');
    expect(insertedTrips[2].freight_cost).toBe('2500.00');
  });
});
