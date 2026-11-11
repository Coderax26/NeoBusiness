import { Injectable, Logger } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * OutboxService — transactional outbox pattern.
 *
 * Every domain event is written to `outbox_events` inside the SAME
 * database transaction as the business write. This guarantees that
 * the event is never lost, even if the process crashes between the
 * DB commit and the message queue publish.
 *
 * Usage in a service:
 *   await this.knex.transaction(async (trx) => {
 *     await trx('orders').insert(orderRow);
 *     await this.outbox.raise(trx, 'order.confirmed', orderId, payload);
 *   });
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Enqueue a domain event inside an existing transaction.
   *
   * @param trx      Knex transaction to use (must be active)
   * @param eventType e.g. 'order.confirmed', 'price.updated'
   * @param aggregateId the entity UUID that the event refers to
   * @param payload   the event payload (must be JSON-serialisable)
   * @param moduleSource which module raised the event (e.g. 'M1')
   */
  async raise(
    trx: Knex.Transaction,
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    moduleSource: string,
  ): Promise<string> {
    const [row] = await trx('outbox_events')
      .insert({
        event_type: eventType,
        aggregate_id: aggregateId,
        payload: JSON.stringify(payload),
        module_source: moduleSource,
      })
      .returning('id');

    const id = String(row.id);
    this.logger.debug(`Outbox: enqueued ${eventType} (${id})`);
    return id;
  }

  /** Convenience wrapper that opens its own transaction. */
  async raiseStandalone(
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    moduleSource: string,
  ): Promise<string> {
    return this.knex.transaction((trx) =>
      this.raise(trx, eventType, aggregateId, payload, moduleSource),
    );
  }
}
