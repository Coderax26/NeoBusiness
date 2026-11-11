import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { InvoiceService } from '../m6-finance/invoice.service.js';

interface DomainJob {
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class TripListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripListenerService.name);
  private worker: Worker | undefined;

  constructor(private readonly invoiceService: InvoiceService) {}

  onModuleInit(): void {
    this.worker = new Worker(
      'domain-events',
      async (job) => this.handle(job.data as DomainJob),
      { connection: { host: 'localhost', port: 6379 } },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `M5 trip listener ${job?.name ?? 'unknown'} failed: ${error.message}`,
      );
    });
    this.logger.log(
      'TripListenerService started (listening on domain-events queue)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  async handle(event: DomainJob): Promise<void> {
    const payload = event.payload;
    switch (event.event_type) {
      case 'trip.dispatched': {
        await this.handleTripDispatched(payload);
        return;
      }
      case 'trip.closed': {
        // COD settlement is handled in M6
        this.logger.log(
          `M5 trip listener: trip.closed received for ${payload.tripId}`,
        );
        return;
      }
      default:
        this.logger.debug(`M5 trip listener ignored event ${event.event_type}`);
    }
  }

  private async handleTripDispatched(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const tripId = this.getStringValue(payload.tripId);
    const siteId = this.getStringValue(payload.siteId);
    const stops = this.getArrayValue(payload.stops);

    this.logger.log(
      `Trip ${tripId} dispatched - generating invoices for ${stops.length} stops`,
    );

    for (const stop of stops) {
      const salesOrderId = this.getStringValue(stop.salesOrderId);
      const customerId = this.getStringValue(stop.customerId);
      const isCod = Boolean(stop.isCod);

      if (!salesOrderId) {
        this.logger.warn(
          `Stop ${this.getStringValue(stop.stopId)} has no sales order - skipping invoice`,
        );
        continue;
      }

      try {
        // Generate invoice for this sales order
        const invoice = await this.invoiceService.generateFromOrder(
          salesOrderId,
          siteId,
          tripId, // using tripId as userId for now (system-generated)
          { tripId, isCOD: isCod },
        );
        this.logger.log(
          `Invoice ${invoice.invoiceNo} generated for order ${salesOrderId}`,
        );

        // Send invoice notification to customer via InvoiceService
        await this.invoiceService.sendInvoiceNotification(
          customerId,
          invoice.invoiceNo,
          invoice.totalAmount,
        );
      } catch (err) {
        this.logger.error(
          `Failed to generate invoice for order ${salesOrderId} on trip ${tripId}: ${(err as Error).message}`,
        );
        // Continue with other stops - don't block trip dispatch on invoice failure
      }
    }
  }

  private getStringValue(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Domain event contains a missing string field');
    }
    return value;
  }

  private getArrayValue(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null,
        )
      : [];
  }
}
