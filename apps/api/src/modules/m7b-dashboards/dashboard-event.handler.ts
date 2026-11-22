import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Worker } from 'bullmq';
import {
  EXCEPTION_PORT,
  type ExceptionPort,
} from '../../shared/ports/ports.interface.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { getRedisConnection } from '../../shared/config/redis-connection.js';
import type {
  DomainEvent,
  EventType,
} from '../../shared/events/domain-events.js';

interface DomainJob {
  id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  module_source?: string;
}

/**
 * DashboardEventHandler — Listens to domain events and triggers targeted MV refreshes
 *
 * Subscribes to events from M1-M6 that affect dashboard data and refreshes
 * the corresponding PostgreSQL materialized views safely.
 */
@Injectable()
export class DashboardEventHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DashboardEventHandler.name);
  private worker: Worker | undefined;
  private readonly isRefreshing = new Map<string, Promise<void>>();

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly outbox: OutboxService,
    @Optional()
    @Inject(EXCEPTION_PORT)
    private readonly exceptionPort?: ExceptionPort,
  ) {}

  onModuleInit(): void {
    // 1. Register handlers for exception resolution to refresh pulse
    if (this.exceptionPort) {
      this.exceptionPort.onResolved(
        'PRICE_OVERRIDE',
        async (exceptionId: string, action: string) => {
          await this.triggerPulseRefresh('exception_resolved');
          this.logger.log(
            `PRICE_OVERRIDE ${exceptionId} resolved with ${action} — pulse refresh triggered`,
          );
        },
      );

      this.exceptionPort.onResolved(
        'CREDIT_BREACH',
        async (exceptionId: string, action: string) => {
          await this.triggerPulseRefresh('exception_resolved');
          this.logger.log(
            `CREDIT_BREACH ${exceptionId} resolved with ${action} — pulse refresh triggered`,
          );
        },
      );

      this.exceptionPort.onResolved(
        'SUPPLIER_PRICE_SPIKE',
        async (exceptionId: string, action: string) => {
          await this.triggerPulseRefresh('exception_resolved');
          await this.triggerAnalyticsRefresh('exception_resolved');
          this.logger.log(
            `SUPPLIER_PRICE_SPIKE ${exceptionId} resolved with ${action} — pulse & analytics refresh triggered`,
          );
        },
      );

      this.exceptionPort.onResolved(
        'ALLOCATION',
        async (exceptionId: string, action: string) => {
          await this.triggerPulseRefresh('exception_resolved');
          await this.triggerOpsRefresh('exception_resolved');
          await this.triggerInventoryAlertsRefresh('exception_resolved');
          this.logger.log(
            `ALLOCATION ${exceptionId} resolved with ${action} — pulse, ops, inventory refresh triggered`,
          );
        },
      );

      this.logger.log(
        'DashboardEventHandler: Exception resolution handlers registered',
      );
    }

    // 2. Start BullMQ worker on dashboard-events queue
    try {
      this.worker = new Worker(
        'dashboard-events',
        async (job) => this.handleJob(job.data as DomainJob),
        { connection: getRedisConnection() },
      );

      this.worker.on('failed', (job, error) => {
        this.logger.error(
          `Dashboard event ${job?.name ?? 'unknown'} failed: ${error.message}`,
        );
      });

      this.logger.log(
        'DashboardEventHandler started (listening on dashboard-events queue)',
      );
    } catch (err) {
      this.logger.warn(
        `Failed to start dashboard worker: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  /**
   * Handle incoming BullMQ job
   */
  async handleJob(job: DomainJob): Promise<void> {
    const domainEvent: DomainEvent = {
      id: job.id,
      type: job.event_type as EventType,
      aggregateId: job.aggregate_id,
      payload: job.payload,
      publishedAt: new Date().toISOString(),
      moduleSource: (job.module_source ?? 'm0') as any,
    };

    await this.handleDomainEvent(domainEvent);
  }

  /**
   * Handle domain events and refresh appropriate materialized views
   */
  async handleDomainEvent(event: DomainEvent): Promise<void> {
    const startTime = Date.now();
    try {
      switch (event.type) {
        // M1 events
        case 'order.confirmed':
        case 'order.cancelled':
          await this.triggerPulseRefresh(event.type);
          await this.triggerOpsRefresh(event.type);
          break;

        // M2 events
        case 'grn.posted':
        case 'po.price_spike_detected':
        case 'po.shortfall_detected':
        case 'bill.created':
        case 'bill.approved':
          await this.triggerInventoryAlertsRefresh(event.type);
          await this.triggerOpsRefresh(event.type);
          await this.triggerAnalyticsRefresh(event.type);
          break;

        // M3 events
        case 'stock.reserved':
        case 'stock.insufficient':
        case 'stock.low':
        case 'stock.expiring':
          await this.triggerInventoryAlertsRefresh(event.type);
          await this.triggerOpsRefresh(event.type);
          break;

        // M4 events
        case 'workorder.started':
        case 'workorder.completed':
          await this.triggerOpsRefresh(event.type);
          await this.triggerAnalyticsRefresh(event.type);
          break;

        // M5 events
        case 'trip.loaded':
        case 'trip.dispatched':
          await this.triggerPulseRefresh(event.type);
          await this.triggerOpsRefresh(event.type);
          break;
        case 'delivery.completed':
        case 'delivery.partial':
        case 'delivery.failed':
        case 'stops.returned':
        case 'trip.closed':
          await this.triggerPulseRefresh(event.type);
          await this.triggerOpsRefresh(event.type);
          await this.triggerAnalyticsRefresh(event.type);
          break;

        // M6 events
        case 'collection.logged':
        case 'invoice.issued':
          await this.triggerPulseRefresh(event.type);
          await this.triggerAnalyticsRefresh(event.type);
          break;
        case 'handover.verified':
          await this.triggerPulseRefresh(event.type);
          break;
        case 'eod.closed':
          await this.triggerAnalyticsRefresh(event.type);
          break;

        // M7a events
        case 'exception.requested':
        case 'exception.resolved':
          await this.triggerPulseRefresh(event.type);
          break;

        default:
          this.logger.debug(
            `No dashboard refresh handler required for event: ${event.type}`,
          );
          return;
      }

      const elapsed = Date.now() - startTime;
      this.logger.log(
        `Successfully handled dashboard event ${event.type} (${event.id || event.aggregateId}) in ${elapsed}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling domain event ${event.type}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Concurrency-safe, coalescing materialized view refresh
   */
  private async refreshView(
    viewName: string,
    refreshSql: string,
  ): Promise<void> {
    const existing = this.isRefreshing.get(viewName);
    if (existing) {
      // Coalesce / deduplicate concurrent refresh
      return existing;
    }

    const start = Date.now();
    const promise = (async () => {
      try {
        await this.knex.raw(refreshSql);
        const duration = Date.now() - start;
        this.logger.debug(`Refreshed ${viewName} in ${duration}ms`);
      } catch (error) {
        this.logger.error(
          `Failed to refresh ${viewName}: ${(error as Error).message}`,
        );
        throw error;
      } finally {
        this.isRefreshing.delete(viewName);
      }
    })();

    this.isRefreshing.set(viewName, promise);
    return promise;
  }

  /**
   * Trigger pulse MV refresh
   */
  async triggerPulseRefresh(_trigger: string): Promise<void> {
    await this.refreshView('mv_pulse_today', 'SELECT refresh_mv_pulse_today()');
  }

  /**
   * Trigger ops status MV refresh
   */
  async triggerOpsRefresh(_trigger: string): Promise<void> {
    await this.refreshView('mv_ops_status', 'SELECT refresh_mv_ops_status()');
  }

  /**
   * Trigger inventory alerts MV refresh
   */
  async triggerInventoryAlertsRefresh(_trigger: string): Promise<void> {
    await this.refreshView(
      'mv_inventory_alerts',
      'SELECT refresh_mv_inventory_alerts()',
    );
  }

  /**
   * Trigger analytics MVs refresh
   */
  async triggerAnalyticsRefresh(_trigger: string): Promise<void> {
    await this.refreshView(
      'mv_customer_profitability',
      'SELECT refresh_mv_customer_profitability()',
    );
    await this.refreshView(
      'mv_supplier_scorecard',
      'SELECT refresh_mv_supplier_scorecard()',
    );
  }

  /**
   * Manual trigger for testing
   */
  async manualRefreshAll(): Promise<void> {
    await this.triggerPulseRefresh('manual');
    await this.triggerOpsRefresh('manual');
    await this.triggerInventoryAlertsRefresh('manual');
    await this.triggerAnalyticsRefresh('manual');
    this.logger.log('Manual dashboard refresh triggered for all MVs');
  }
}
