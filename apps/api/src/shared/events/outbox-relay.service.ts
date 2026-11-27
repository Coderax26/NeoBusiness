import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Queue } from 'bullmq';
import { getRedisConnection } from '../config/redis-connection.js';

/**
 * OutboxRelay — polls the `outbox_events` table and dispatches each
 * unprocessed event to BullMQ.
 *
 * Runs on a timer (`setInterval`) in development. Production would use
 * BullMQ's repeatable jobs or a cron-based approach, but this is
 * sufficient for the M0 MVP and matches the blueprint's "polls → queue →
 * handlers" description.
 *
 * The `processed_at` column acts as a idempotency marker — once set,
 * the row is never re-dispatched even if the relay restarts.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private interval: NodeJS.Timeout | undefined;
  private isDispatching = false;
  private queues:
    | {
        m3InventoryQueue: Queue;
        m5FleetQueue: Queue;
        m6CodQueue: Queue;
        m6CreditNoteQueue: Queue;
        dashboardQueue: Queue;
      }
    | undefined;

  constructor(@InjectKnex() private readonly knex: Knex) {}

  private getQueues() {
    if (!this.queues) {
      const connection = getRedisConnection();
      this.queues = {
        m3InventoryQueue: new Queue('m3-inventory-events', { connection }),
        m5FleetQueue: new Queue('m5-fleet-events', { connection }),
        m6CodQueue: new Queue('m6-cod-events', { connection }),
        m6CreditNoteQueue: new Queue('m6-credit-note-events', { connection }),
        dashboardQueue: new Queue('dashboard-events', { connection }),
      };
    }
    return this.queues;
  }

  onModuleInit(): void {
    // Poll every 5 seconds in dev.
    this.interval = setInterval(() => {
      if (this.isDispatching) return;
      this.dispatch().catch((err) =>
        this.logger.error(`Outbox relay error: ${(err as Error).message}`),
      );
    }, 5_000);
    this.logger.log('Outbox relay started (polling every 5s)');
  }

  /**
   * Fan out unprocessed outbox events to dedicated per-module BullMQ queues
   * (true pub/sub semantics so workers never compete for unrelated events).
   */
  async dispatch(): Promise<number> {
    if (this.isDispatching) return 0;
    this.isDispatching = true;
    try {
      const events = await this.knex('outbox_events')
        .whereNull('processed_at')
        .orderBy('published_at')
        .limit(50);

      if (events.length === 0) return 0;

      const {
        m3InventoryQueue,
        m5FleetQueue,
        m6CodQueue,
        m6CreditNoteQueue,
        dashboardQueue,
      } = this.getQueues();
      const jobOpts = {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      };

      let dispatched = 0;
      for (const event of events) {
        await this.knex.transaction(async (trx) => {
          // Check again under row lock to avoid double-dispatch on restart
          const row = await trx('outbox_events')
            .where('id', event.id)
            .whereNull('processed_at')
            .forUpdate()
            .skipLocked()
            .first();

          if (!row) return; // already dispatched by another worker

          try {
            const jobData = {
              id: row.id,
              event_type: row.event_type,
              aggregate_id: row.aggregate_id,
              payload:
                typeof row.payload === 'string'
                  ? JSON.parse(row.payload)
                  : row.payload,
              module_source: row.module_source,
            };
            await Promise.all([
              m3InventoryQueue.add('domain-event', jobData, jobOpts),
              m5FleetQueue.add('domain-event', jobData, jobOpts),
              m6CodQueue.add('domain-event', jobData, jobOpts),
              m6CreditNoteQueue.add('domain-event', jobData, jobOpts),
              dashboardQueue.add('dashboard-event', jobData, jobOpts),
            ]);
            await trx('outbox_events')
              .where('id', row.id)
              .update({ processed_at: this.knex.fn.now() });
            dispatched++;
          } catch (err) {
            this.logger.warn(
              `Outbox: failed to dispatch ${row.event_type} (${row.id}: ${(err as Error).message})`,
            );
            // Increment attempts and store error, but don't block the batch
            await trx('outbox_events')
              .where('id', row.id)
              .update({
                attempts: this.knex.raw('?? + 1', ['attempts']),
                error: (err as Error).message,
              });
          }
        });
      }

      return dispatched;
    } finally {
      this.isDispatching = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.queues) {
      await Promise.allSettled([
        this.queues.m3InventoryQueue.close(),
        this.queues.m5FleetQueue.close(),
        this.queues.m6CodQueue.close(),
        this.queues.m6CreditNoteQueue.close(),
        this.queues.dashboardQueue.close(),
      ]);
    }
  }
}
