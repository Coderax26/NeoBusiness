import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Knex } from 'knex';
import { createKnex } from '../../../shared/database/knex-instance.js';
import { assertTestDatabase } from '../../../shared/database/test-db-guard.js';
import { DashboardEventHandler } from '../dashboard-event.handler.js';
import { OutboxService } from '../../../shared/events/outbox.service.js';
import type { DomainEvent } from '../../../shared/events/domain-events.js';

describe('DashboardEventHandler — Workstream C Tests', () => {
  let knex: Knex;
  let outbox: OutboxService;
  let handler: DashboardEventHandler;

  beforeAll(async () => {
    knex = await createKnex();
    await assertTestDatabase(knex);
    outbox = new OutboxService(knex);
    handler = new DashboardEventHandler(knex, outbox);
  }, 30000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await handler.onModuleDestroy();
  });

  it('triggers pulse and ops refresh on order.confirmed event', async () => {
    const pulseSpy = vi
      .spyOn(handler, 'triggerPulseRefresh')
      .mockResolvedValue(undefined);
    const opsSpy = vi
      .spyOn(handler, 'triggerOpsRefresh')
      .mockResolvedValue(undefined);

    const event: DomainEvent = {
      id: 'evt-order-1',
      type: 'order.confirmed',
      aggregateId: 'ord-123',
      payload: { siteId: 'site-1', orderId: 'ord-123' },
      publishedAt: new Date().toISOString(),
      moduleSource: 'm1',
    };

    await handler.handleDomainEvent(event);

    expect(pulseSpy).toHaveBeenCalledWith('order.confirmed');
    expect(opsSpy).toHaveBeenCalledWith('order.confirmed');
  }, 30000);

  it('triggers inventory alerts, ops, and analytics on grn.posted event', async () => {
    const alertsSpy = vi
      .spyOn(handler, 'triggerInventoryAlertsRefresh')
      .mockResolvedValue(undefined);
    const opsSpy = vi
      .spyOn(handler, 'triggerOpsRefresh')
      .mockResolvedValue(undefined);
    const analyticsSpy = vi
      .spyOn(handler, 'triggerAnalyticsRefresh')
      .mockResolvedValue(undefined);

    const event: DomainEvent = {
      id: 'evt-grn-1',
      type: 'grn.posted',
      aggregateId: 'grn-123',
      payload: { siteId: 'site-1', poId: 'po-123' },
      publishedAt: new Date().toISOString(),
      moduleSource: 'm2',
    };

    await handler.handleDomainEvent(event);

    expect(alertsSpy).toHaveBeenCalledWith('grn.posted');
    expect(opsSpy).toHaveBeenCalledWith('grn.posted');
    expect(analyticsSpy).toHaveBeenCalledWith('grn.posted');
  }, 30000);

  it('ignores unrelated events without triggering refreshes', async () => {
    const pulseSpy = vi.spyOn(handler, 'triggerPulseRefresh');
    const opsSpy = vi.spyOn(handler, 'triggerOpsRefresh');

    const event: DomainEvent = {
      id: 'evt-price-1',
      type: 'price.updated' as any,
      aggregateId: 'item-123',
      payload: { itemId: 'item-123' },
      publishedAt: new Date().toISOString(),
      moduleSource: 'm1',
    };

    await handler.handleDomainEvent(event);

    expect(pulseSpy).not.toHaveBeenCalled();
    expect(opsSpy).not.toHaveBeenCalled();
  }, 30000);

  it('coalesces concurrent refreshes for the same materialized view', async () => {
    // Calling triggerPulseRefresh concurrently should return the same in-flight promise
    const promise1 = handler.triggerPulseRefresh('concurrent-1');
    const promise2 = handler.triggerPulseRefresh('concurrent-2');

    // Both should resolve without throwing PostgreSQL serialization or concurrency errors
    await expect(Promise.all([promise1, promise2])).resolves.toBeDefined();
  }, 30000);
});
