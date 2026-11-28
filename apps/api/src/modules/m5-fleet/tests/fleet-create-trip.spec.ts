import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FleetService } from '../fleet.service.js';
import { PdfGeneratorService } from '../../../shared/services/pdf-generator.service.js';

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

  it('includes migration 037 declaring collection_receipts(reference_type, reference_id) and delivery_stop_lines(updated_by)', () => {
    const migPath = path.resolve(
      __dirname,
      '../../../../../../db/migrations/20261128_037_collection_receipts_ref_and_m5_m6_schema.sql',
    );
    expect(fs.existsSync(migPath)).toBe(true);
    const sql = fs.readFileSync(migPath, 'utf8');
    expect(sql).toMatch(/ALTER\s+TABLE\s+collection_receipts\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+reference_type/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+collection_receipts\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+reference_id/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+delivery_stop_lines\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+updated_by/i);
  });

  it('generates valid challan PDF buffers even when pg returns Date objects and pdfGenerator is not injected', async () => {
    const pdfGen = new PdfGeneratorService();
    const directPdf = await pdfGen.generateChallan({
      challanNo: 'DC-2611-0001',
      challanDate: new Date('2026-11-28') as unknown as string,
      tripNo: 'T-2611-0001',
      tripDate: new Date('2026-11-28') as unknown as string,
      vehicleNo: 'MH-12-AB1234',
      driverName: 'Driver 1',
      customerName: 'Sahyadri Dairy',
      customerAddress: 'Baramati MIDC',
      customerGstin: '27AAAAA0000A1Z5',
      customerStateCode: '27',
      ewayBillNo: 'EWB-12345',
      siteName: 'Baramati Plant',
      siteAddress: 'Baramati',
      siteGstin: '27BBBBB0000B1Z5',
      siteStateCode: '27',
      lines: [
        {
          itemName: 'Cow Ghee 1L',
          hsnCode: '0405',
          uom: 'KG',
          loadedQty: '20',
          batchNo: 'B-001',
          expiryDate: new Date('2026-12-31') as unknown as string,
        },
      ],
    });
    expect(directPdf.subarray(0, 5).toString()).toBe('%PDF-');

    const TRIP_1 = 'b54811e7-a4d7-45d6-a1d0-11bdf2059982';
    const STOP_1 = '72060492-9f0a-4567-9fee-ec0355b63be7';
    const BATCH_1 = '33333333-3333-4333-8333-333333333333';

    const knex = makeKnexStub((table) => {
      if (table === 'delivery_trips') {
        return {
          where: () => ({
            first: async () => ({
              id: TRIP_1,
              site_id: SITE_1,
              trip_no: 'T-2611-0004',
              trip_date: new Date('2026-11-28'),
              vehicle_id: VEH_1,
              driver_id: DRIVER_1,
            }),
          }),
        };
      }
      if (table === 'delivery_stops') {
        return {
          where: () => ({
            first: async () => ({ id: STOP_1, trip_id: TRIP_1, customer_id: CUST_1 }),
          }),
        };
      }
      if (table === 'vehicles') {
        return { where: () => ({ first: async () => ({ registration_no: 'MH-12-AB1234' }) }) };
      }
      if (table === 'users') {
        return { where: () => ({ first: async () => ({ full_name: 'Dolly' }) }) };
      }
      if (table === 'customers') {
        return {
          where: () => ({
            first: async () => ({ business_name: 'Sahyadri Dairy', billing_address: 'Baramati', gstin: 'N/A', state_code: '27' }),
          }),
        };
      }
      if (table === 'sites') {
        return {
          where: () => ({
            first: async () => ({ name: 'Baramati Plant', address: 'Baramati', gstin: 'N/A', state_code: '27' }),
          }),
        };
      }
      if (table === 'delivery_stop_lines') {
        return {
          where: () => ({
            join: () => ({
              select: async () => [
                { itemName: 'Buffalo Paneer', hsn_code: '0406', uom: 'KG', loaded_qty: '15.000', batch_id: BATCH_1 },
              ],
            }),
          }),
        };
      }
      if (table === 'inventory_batches') {
        return {
          whereIn: () => ({
            select: async () => [
              { id: BATCH_1, batch_number: 'BAT-2611-01', expiry_date: new Date('2026-12-15') },
            ],
          }),
        };
      }
      if (table === 'delivery_challans') {
        return { where: () => ({ first: async () => ({ eway_bill_no: null }) }) };
      }
      return {};
    });

    const fleetWithoutPdfDi = new FleetService(
      knex,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
    );
    const servicePdf = await fleetWithoutPdfDi.generateChallanPdf(TRIP_1, STOP_1, 'DC-2611-0001');
    expect(servicePdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
