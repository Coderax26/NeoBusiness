import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { FleetService } from '../fleet.service.js';
import { setupTestDB } from '../../m3-inventory/tests/test-setup.js';
import type {
  CreditPort,
  InventoryPort,
  LedgerPort,
  NotifyPort,
} from '../../../shared/ports/ports.interface.js';
import type { OutboxService } from '../../../shared/events/outbox.service.js';
import type { DocNumberService } from '../../m0-platform/doc-number.service.js';
import type { ConfigService } from '../../m0-platform/config.service.js';

describe('M5 FleetService', () => {
  let context: Awaited<ReturnType<typeof setupTestDB>>;
  let fleet: FleetService;
  let driverId: string;
  let customerId: string;
  let vehicleId: string;
  let tripId: string;
  let stopId: string;
  let allowDispatch = true;

  const credit: CreditPort = {
    evaluate: async () => ({
      status: 'OK',
      currentArBalance: '0',
      creditLimit: '100000',
      maxOverdueDays: 0,
      oldestOverdueDays: null,
    }),
    canDispatch: async () =>
      allowDispatch
        ? { allowed: true }
        : { allowed: false, reason: 'CREDIT_HOLD' },
  };
  const inventory: InventoryPort = {
    checkATP: async () => ({
      itemId: uuidv4(),
      siteId: context.siteId,
      availableQty: '100',
      uom: 'KG',
      canFulfil: true,
    }),
    reserve: async () => ({ allocated: '0', deficit: '0', reservationIds: [] }),
    release: async () => undefined,
    postDispatch: async () => undefined,
    postReturn: async () => undefined,
    postGRN: async () => undefined,
  };
  const ledger: LedgerPort = {
    postInvoice: async () => [],
    postReceipt: async () => undefined,
    postCreditNote: async () => undefined,
  };
  const outbox = {
    raise: async () => uuidv4(),
    raiseStandalone: async () => uuidv4(),
  } as unknown as OutboxService;
  const docNumber = {
    next: async () => `TRIP-${uuidv4().slice(0, 8)}`,
  } as unknown as DocNumberService;
  const config = {
    getNumber: async () => null,
  } as unknown as ConfigService;
  const notify = {
    send: async () => undefined,
  } as unknown as NotifyPort;

  beforeAll(async () => {
    context = await setupTestDB();
    driverId = uuidv4();
    customerId = uuidv4();
    await context.knex('users').insert({
      id: driverId,
      full_name: 'M5 Test Driver',
      phone: `+9198${uuidv4().replace(/\D/g, '').slice(0, 10)}`,
      role: 'DRIVER',
      assigned_site_id: context.siteId,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    await context.knex('customers').insert({
      id: customerId,
      customer_code: `M5-${uuidv4().slice(0, 8)}`,
      business_name: 'M5 Test Customer',
      phone: `+9198${uuidv4().replace(/\D/g, '').slice(0, 10)}`,
      billing_address: 'Test address',
      credit_limit: '100000',
      state_code: 'MH',
      default_site_id: context.siteId,
      created_at: new Date(),
      updated_at: new Date(),
    });
    fleet = new FleetService(
      context.knex,
      docNumber,
      outbox,
      config,
      credit,
      inventory,
      ledger,
      notify,
      undefined,
    );
  });

  beforeEach(async () => {
    await context.knex('delivery_trips').where('site_id', context.siteId).del();
    await context.knex('vehicles').where('site_id', context.siteId).del();
    allowDispatch = true;
    const [vehicle] = await context
      .knex('vehicles')
      .insert({
        id: uuidv4(),
        site_id: context.siteId,
        registration_no: `M5-${uuidv4().slice(0, 6)}`,
        vehicle_type: 'TRUCK',
        capacity_kg: '100',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    vehicleId = String(vehicle.id);
  });

  afterAll(async () => {
    await context.knex('delivery_trips').where('site_id', context.siteId).del();
    await context.knex('vehicles').where('site_id', context.siteId).del();
    await context.knex('customers').where('id', customerId).del();
    await context.knex('users').where('id', driverId).del();
    await context.knex.destroy();
  });

  it('rejects a trip whose load exceeds vehicle capacity', async () => {
    await expect(
      fleet.createTrip(
        {
          siteId: context.siteId,
          tripDate: context.today,
          vehicleId,
          driverId,
          stops: [
            {
              customerId,
              sequenceNo: 1,
              lines: [{ itemId: context.itemRiceId, loadedQty: 101 }],
            },
          ],
        },
        context.ownerId,
      ),
    ).rejects.toThrow('Trip load exceeds vehicle capacity');
  });

  it('blocks dispatch when CreditPort rejects an order', async () => {
    const trip = await fleet.createTrip(
      {
        siteId: context.siteId,
        tripDate: context.today,
        vehicleId,
        driverId,
        stops: [
          {
            customerId,
            salesOrderId: uuidv4(),
            sequenceNo: 1,
            lines: [
              {
                itemId: context.itemRiceId,
                loadedQty: 10,
                batchId: context.batchRice1Id,
              },
            ],
          },
        ],
      },
      context.ownerId,
    );
    tripId = String(trip.id);
    allowDispatch = false;
    await expect(
      fleet.dispatchTrip(
        tripId,
        [
          {
            stopId: String(trip.stops[0].id),
            itemId: context.itemRiceId,
            batchId: context.batchRice1Id,
            qty: 10,
          },
        ],
        context.storekeeperId,
      ),
    ).rejects.toThrow('CREDIT_HOLD');
  });

  it('requires returned quantity for partial delivery and blocks incomplete trip closure', async () => {
    const trip = await fleet.createTrip(
      {
        siteId: context.siteId,
        tripDate: context.today,
        vehicleId,
        driverId,
        stops: [
          {
            customerId,
            sequenceNo: 1,
            lines: [
              {
                itemId: context.itemRiceId,
                loadedQty: 10,
                batchId: context.batchRice1Id,
              },
            ],
          },
        ],
      },
      context.ownerId,
    );
    tripId = String(trip.id);
    stopId = String(trip.stops[0].id);
    await fleet.dispatchTrip(
      tripId,
      [
        {
          stopId,
          itemId: context.itemRiceId,
          batchId: context.batchRice1Id,
          qty: 10,
        },
      ],
      context.storekeeperId,
    );
    await expect(fleet.closeTrip(tripId, driverId)).rejects.toThrow(
      'still pending',
    );

    await fleet.deliverStop(
      stopId,
      {
        epodMethod: 'PHOTO',
        epodPhotoUrl: 's3://photo',
        capturedAt: new Date().toISOString(),
        gpsLat: 19.07,
        gpsLng: 72.87,
        lines: [
          {
            itemId: context.itemRiceId,
            deliveredQty: 8,
            returnedQty: 2,
            batchId: context.batchRice1Id,
          },
        ],
      },
      driverId,
      `m5-${uuidv4()}`,
    );
    const closed = await fleet.closeTrip(tripId, driverId);
    expect(closed.status).toBe('COMPLETED');
  });

  it('replays an idempotent delivery without creating a second outcome', async () => {
    const trip = await fleet.createTrip(
      {
        siteId: context.siteId,
        tripDate: context.today,
        vehicleId,
        driverId,
        stops: [
          {
            customerId,
            sequenceNo: 1,
            lines: [
              {
                itemId: context.itemRiceId,
                loadedQty: 5,
                batchId: context.batchRice1Id,
              },
            ],
          },
        ],
      },
      context.ownerId,
    );
    tripId = String(trip.id);
    stopId = String(trip.stops[0].id);
    await fleet.dispatchTrip(
      tripId,
      [
        {
          stopId,
          itemId: context.itemRiceId,
          batchId: context.batchRice1Id,
          qty: 5,
        },
      ],
      context.storekeeperId,
    );
    const request = {
      epodMethod: 'SIGNATURE' as const,
      epodSignatureUrl: 's3://signature',
      capturedAt: new Date().toISOString(),
      gpsLat: 19.07,
      gpsLng: 72.87,
      lines: [
        {
          itemId: context.itemRiceId,
          deliveredQty: 5,
          returnedQty: 0,
          batchId: context.batchRice1Id,
        },
      ],
    };
    const key = `m5-replay-${uuidv4()}`;
    const first = await fleet.deliverStop(stopId, request, driverId, key);
    const second = await fleet.deliverStop(stopId, request, driverId, key);
    expect(first.stops[0].status).toBe('DELIVERED_FULL');
    expect(second.stops[0].status).toBe('DELIVERED_FULL');
    expect(
      await context.knex('delivery_stops').where('id', stopId),
    ).toHaveLength(1);
  });
});
