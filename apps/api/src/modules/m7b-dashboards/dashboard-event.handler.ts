import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import {
  EXCEPTION_PORT,
  type ExceptionPort,
  ExceptionType,
} from '../../shared/ports/ports.interface.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import type {
  DomainEvent,
  EventType,
} from '../../shared/events/domain-events.js';

/**
 * DashboardEventHandler — Listens to domain events and triggers targeted MV refreshes
 *
 * Subscribes to events from M1-M6 that affect dashboard data and raises
 * dashboard.refresh_* events to trigger incremental MV updates.
 */

@Injectable()
export class DashboardEventHandler implements OnModuleInit {
  private readonly logger = new Logger(DashboardEventHandler.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly outbox: OutboxService,
    @Inject(EXCEPTION_PORT) private readonly exceptionPort: ExceptionPort,
  ) {}

  onModuleInit(): void {
    // Register handlers for exception resolution to refresh pulse
    this.exceptionPort.onResolved(
      'PRICE_OVERRIDE',
      async (
        exceptionId: string,
        action: string,
        remarks: string,
        counterJson?: object,
      ) => {
        await this.triggerPulseRefresh('exception_resolved');
        this.logger.log(
          `PRICE_OVERRIDE ${exceptionId} resolved with ${action} — pulse refresh triggered`,
        );
      },
    );

    this.exceptionPort.onResolved(
      'CREDIT_BREACH',
      async (
        exceptionId: string,
        action: string,
        remarks: string,
        counterJson?: object,
      ) => {
        await this.triggerPulseRefresh('exception_resolved');
        this.logger.log(
          `CREDIT_BREACH ${exceptionId} resolved with ${action} — pulse refresh triggered`,
        );
      },
    );

    this.exceptionPort.onResolved(
      'SUPPLIER_PRICE_SPIKE',
      async (
        exceptionId: string,
        action: string,
        remarks: string,
        counterJson?: object,
      ) => {
        await this.triggerPulseRefresh('exception_resolved');
        await this.triggerAnalyticsRefresh('exception_resolved');
        this.logger.log(
          `SUPPLIER_PRICE_SPIKE ${exceptionId} resolved with ${action} — pulse & analytics refresh triggered`,
        );
      },
    );

    this.exceptionPort.onResolved(
      'ALLOCATION',
      async (
        exceptionId: string,
        action: string,
        remarks: string,
        counterJson?: object,
      ) => {
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

  /**
   * Handle domain events from the outbox relay
   * This would be called by the OutboxRelayService when processing events
   */
  async handleDomainEvent(event: DomainEvent): Promise<void> {
    try {
      switch (event.type) {
        // M1 events
        case 'order.confirmed':
        case 'order.cancelled':
          await this.triggerPulseRefresh(event.type);
          await this.triggerOpsRefresh(event.type);
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

        // M2 events
        case 'grn.posted':
        case 'po.price_spike_detected':
        case 'po.shortfall_detected':
          await this.triggerInventoryAlertsRefresh(event.type);
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
          await this.triggerPulseRefresh(event.type);
          await this.triggerOpsRefresh(event.type);
          await this.triggerAnalyticsRefresh(event.type);
          break;
        case 'trip.closed':
          await this.triggerPulseRefresh(event.type);
          await this.triggerOpsRefresh(event.type);
          await this.triggerAnalyticsRefresh(event.type);
          break;

        // M6 events
        case 'collection.logged':
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
          await this.triggerPulseRefresh(event.type);
          break;
        case 'exception.resolved':
          await this.triggerPulseRefresh(event.type);
          break;

        default:
          this.logger.debug(
            `No dashboard refresh handler for event: ${event.type}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Error handling domain event ${event.type}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Trigger pulse MV refresh by raising dashboard.refresh_pulse event
   */
  private async triggerPulseRefresh(trigger: string): Promise<void> {
    await this.outbox.raiseStandalone(
      'dashboard.refresh_pulse',
      `pulse-${Date.now()}`,
      {
        siteId: '', // Will be populated by listener with actual site IDs
        trigger: trigger as any,
      },
      'm7b',
    );
  }

  /**
   * Trigger ops status MV refresh
   */
  private async triggerOpsRefresh(trigger: string): Promise<void> {
    await this.outbox.raiseStandalone(
      'dashboard.refresh_ops',
      `ops-${Date.now()}`,
      {
        siteId: '',
        trigger: trigger as any,
      },
      'm7b',
    );
  }

  /**
   * Trigger inventory alerts MV refresh
   */
  private async triggerInventoryAlertsRefresh(trigger: string): Promise<void> {
    await this.outbox.raiseStandalone(
      'dashboard.refresh_inventory_alerts',
      `alerts-${Date.now()}`,
      {
        siteId: '',
        trigger: trigger as any,
      },
      'm7b',
    );
  }

  /**
   * Trigger analytics MVs refresh
   */
  private async triggerAnalyticsRefresh(trigger: string): Promise<void> {
    await this.outbox.raiseStandalone(
      'dashboard.refresh_analytics',
      `analytics-${Date.now()}`,
      {
        siteId: '',
        trigger: trigger as any,
      },
      'm7b',
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
