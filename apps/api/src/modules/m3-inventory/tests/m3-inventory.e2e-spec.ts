import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { setupTestDB } from './test-setup.js';
import { createTestApp } from '../../../../tests/e2e/test-app.factory.js';
import { AUTH_TOKENS } from '../../../../tests/e2e/auth-tokens.js';

describe('M3 Inventory & Warehouse — HTTP E2E', () => {
  let knex: Knex;
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let siteId: string;
  let siteBId: string;
  let itemRiceId: string;
  let itemWheatId: string;
  let batchRice1Id: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    knex = setup.knex;
    siteId = setup.siteId;
    siteBId = setup.siteBId;
    itemRiceId = setup.itemRiceId;
    itemWheatId = setup.itemWheatId;
    batchRice1Id = setup.batchRice1Id;
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await knex?.destroy();
  });

  const request = (method: string, url: string, payload?: object, token = AUTH_TOKENS.OWNER) =>
    app.getHttpServer().inject({
      method,
      url,
      headers: { Authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  it('returns ATP for a valid site, item, and quantity', async () => {
    const response = await request(
      'GET',
      `/inventory/stock/atp?siteId=${siteId}&itemId=${itemRiceId}&qty=100`,
      undefined,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      siteId,
      itemId: itemRiceId,
      availableQty: '1500.000',
      canFulfil: true,
    });
  });

  it('rejects malformed UUID and missing quantity at the validation boundary', async () => {
    const response = await request(
      'GET',
      '/inventory/stock/atp?siteId=not-a-uuid&itemId=not-an-item',
    );

    expect(response.statusCode).toBe(400);
  });

  it('creates an idempotent reservation and rejects an idempotency mismatch', async () => {
    const orderId = uuidv4();
    const idempotencyKey = `e2e-${Date.now()}`;
    const payload = {
      siteId,
      itemId: itemRiceId,
      qty: '100',
      orderId,
      idempotencyKey,
    };

    const first = await request('POST', '/inventory/reservations', payload);
    expect(first.statusCode).toBe(201);
    expect(first.json().allocated).toBe('100.000');

    const replay = await request('POST', '/inventory/reservations', payload);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().allocated).toBe('100.000');

    const mismatch = await request('POST', '/inventory/reservations', {
      ...payload,
      qty: '101',
    });
    expect(mismatch.statusCode).toBe(409);

    const rows = await knex('stock_reservations')
      .where({ idempotency_key: idempotencyKey })
      .select('id');
    expect(rows).toHaveLength(1);
  });

  it('posts a GRN with the required site and item fields', async () => {
    const response = await request('POST', '/inventory/grn', {
      siteId,
      poId: `E2E-PO-${uuidv4()}`,
      itemId: itemWheatId,
      requestedQty: '500',
      receivedQty: '450',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      receivedQty: '450.000',
      shortfall: '50.000',
    });
  });

  it('creates a transfer only when source stock exists and sites differ', async () => {
    const response = await request('POST', '/inventory/transfers', {
      fromSiteId: siteId,
      toSiteId: siteBId,
      itemId: itemRiceId,
      qty: '50',
      idempotencyKey: `transfer-${Date.now()}`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().success).toBe(true);
  });

  it('returns current stock for the requested site and item', async () => {
    const response = await request(
      'GET',
      `/inventory/stock/current?siteId=${siteId}&itemId=${itemRiceId}`,
      undefined,
      AUTH_TOKENS.STOREKEEPER,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
      expect.objectContaining({ batchId: batchRice1Id, itemId: itemRiceId }),
      ]),
    );
  });
});
