import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import {
  EXCEPTION_PORT,
  PRODUCTION_PORT,
  type ExceptionPort,
  type ProductionPort,
} from '../../shared/ports/ports.interface.js';
import { InventoryService } from './inventory.service.js';
import { Clock } from '../../shared/utils/clock.util.js';
import { getRedisConnection } from '../../shared/config/redis-connection.js';

interface DomainJob {
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class InventoryEventHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryEventHandler.name);
  private worker: Worker | undefined;

  constructor(
    private readonly inventory: InventoryService,
    @Optional()
    @Inject(EXCEPTION_PORT)
    private readonly exceptionPort?: ExceptionPort,
    @Optional()
    @Inject(PRODUCTION_PORT)
    private readonly productionPort?: ProductionPort,
  ) {}

  onModuleInit(): void {
    this.exceptionPort?.onResolved(
      'STOCK_VARIANCE',
      async (exceptionId, action, remarks) => {
        await this.resolveStockVariance(exceptionId, action, remarks);
      },
    );
    this.worker = new Worker(
      'domain-events',
      async (job) => this.handle(job.data as DomainJob),
      { connection: getRedisConnection() },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `M3 event ${job?.name ?? 'unknown'} failed: ${error.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  async handle(event: DomainJob): Promise<void> {
    const payload = event.payload;
    switch (event.event_type) {
      case 'order.confirmed': {
        const lines = this.arrayPayload(payload.lines);
        for (const line of lines) {
          const result = await this.inventory.reserve(
            this.stringValue(line.orderLineId),
            this.stringValue(payload.siteId),
            this.stringValue(line.itemId),
            this.stringValue(line.qty),
            this.stringValue(payload.deliveryDate),
          );
          if (
            this.productionPort &&
            this.stringValue(line.itemCategory) === 'PROCESSED_FG' &&
            result.deficit !== '0.000'
          ) {
            await this.productionPort.createRequisition(
              this.stringValue(line.orderLineId),
              this.stringValue(line.itemId),
              result.deficit,
              Clock.parseKolkataDate(
                this.stringValue(payload.deliveryDate),
              ).toJSDate(),
            );
          }
        }
        return;
      }
      case 'order.cancelled':
        await this.inventory.release(event.aggregate_id);
        return;
      case 'grn.posted':
        await this.inventory.receiveGRN(
          this.stringValue(payload.siteId),
          this.stringValue(payload.poId ?? event.aggregate_id),
          this.stringValue(payload.itemId),
          this.stringValue(payload.requestedQty),
          this.stringValue(payload.receivedQty),
        );
        return;
      case 'trip.loaded': {
        const lines = this.arrayPayload(payload.lines).map((line) => ({
          itemId: this.stringValue(line.itemId),
          batchId: this.stringValue(line.batchId),
          qty: this.stringValue(line.qty),
        }));
        await this.inventory.postDispatch(event.aggregate_id, lines);
        return;
      }
      case 'delivery.completed': {
        const delivered = this.arrayPayload(payload.deliveredLines).map(
          (line) => ({
            itemId: this.stringValue(line.itemId),
            batchId: this.stringValue(line.batchId),
            qty: this.stringValue(line.deliveredQty),
          }),
        );
        const returned = this.arrayPayload(payload.returnedLines).map(
          (line) => ({
            itemId: this.stringValue(line.itemId),
            batchId: this.stringValue(line.batchId),
            qty: this.stringValue(line.returnedQty),
            damaged: Boolean(line.damaged),
          }),
        );
        if (delivered.length > 0) {
          await this.inventory.postDispatch(event.aggregate_id, delivered);
        }
        if (returned.length > 0) {
          await this.inventory.postReturn(event.aggregate_id, returned);
        }
        return;
      }
      case 'exception.resolved': {
        const exceptionType = this.stringValue(payload.exceptionType);
        if (exceptionType === 'STOCK_VARIANCE') {
          const action = this.stringValue(payload.action);
          if (action !== 'APPROVED' && action !== 'REJECTED') {
            throw new Error(`Unsupported stock variance action: ${action}`);
          }
          await this.inventory.resolveTransferVariance(
            this.stringValue(payload.referenceId),
            action,
            this.stringValue(payload.remarks ?? ''),
          );
        }
        return;
      }
      default:
        this.logger.debug(`M3 ignored event ${event.event_type}`);
    }
  }

  private async resolveStockVariance(
    exceptionId: string,
    action: string,
    remarks: string,
  ): Promise<void> {
    this.logger.log(
      `Stock variance exception ${exceptionId} resolved as ${action}: ${remarks}`,
    );
  }

  private arrayPayload(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null,
        )
      : [];
  }

  private stringValue(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('M3 domain event contains a missing string field');
    }
    return value;
  }
}
