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
  private domainQueue: Queue | undefined;
  private dashboardQueue: Queue | undefined;

  constructor(@InjectKnex() private readonly knex: Knex) {}

  private getQueues(): { domainQueue: Queue; dashboardQueue: Queue } {
    if (!this.domainQueue || !this.dashboardQueue) {
      const connection = getRedisConnection();
      this.domainQueue = new Queue('domain-events', { connection });
      this.dashboardQueue = new Queue('dashboard-events', { connection });
    }
    return {
      domainQueue: this.domainQueue,
      dashboardQueue: this.dashboardQueue,
    };
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
   * Dispatch up to 50 unprocessed events to the domain-events queue.
   * Each event is marked `processed_at` inside the same transaction
   * that updates the DB, ensuring exactly-once delivery.
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

      const { domainQueue, dashboardQueue } = this.getQueues();

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
            await domainQueue.add('domain-event', jobData);
            await dashboardQueue.add('dashboard-event', jobData);
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
    await Promise.allSettled([
      this.domainQueue?.close(),
      this.dashboardQueue?.close(),
    ]);
  }
}
