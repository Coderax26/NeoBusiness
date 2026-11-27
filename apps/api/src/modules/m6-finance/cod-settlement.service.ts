import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Worker } from 'bullmq';
import { Money } from '../../shared/utils/money.util.js';
import { LedgerService } from './ledger.service.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { getRedisConnection } from '../../shared/config/redis-connection.js';
import {
  LEDGER_PORT,
  NOTIFY_PORT,
} from '../../shared/ports/ports.interface.js';
import type {
  LedgerPort,
  NotifyPort,
} from '../../shared/ports/ports.interface.js';

interface DomainJob {
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
}

interface CodStopData {
  stopId: string;
  customerId: string;
  orderId: string;
  codAmount: string;
  codCollectedAmount: string;
}

/**
 * CodSettlementService — Handles COD settlement on trip.closed event
 *
 * Listens to trip.closed domain events and automatically creates collection receipts
 * for COD stops, posting to customer_ledger_entries and custody_ledger.
 *
 * This replaces the manual invoice trigger flow with automated COD settlement.
 */
@Injectable()
export class CodSettlementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CodSettlementService.name);
  private worker: Worker | undefined;

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly ledger: LedgerService,
    private readonly docNumber: DocNumberService,
    private readonly config: ConfigService,
    @Inject(LEDGER_PORT) private readonly ledgerPort: LedgerPort,
    @Optional()
    @Inject(NOTIFY_PORT)
    private readonly notify?: NotifyPort,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      'm6-cod-events',
      async (job) => this.handle(job.data as DomainJob),
      { connection: getRedisConnection() },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `M6 COD Settlement ${job?.name ?? 'unknown'} failed: ${error.message}`,
      );
    });
    this.logger.log(
      'CodSettlementService started (listening on m6-cod-events queue)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  async handle(event: DomainJob): Promise<void> {
    const payload = event.payload;
    switch (event.event_type) {
      case 'trip.closed': {
        await this.handleTripClosed(payload);
        return;
      }
      default:
        this.logger.debug(
          `M6 CodSettlementService ignored event ${event.event_type}`,
        );
    }
  }

  private async handleTripClosed(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const tripId = this.getStringValue(payload.tripId);
    const siteId = this.getStringValue(payload.siteId);

    this.logger.log(`Trip ${tripId} closed - processing COD settlement`);

    try {
      // Get all COD stops for this trip
      const codStops = await this.knex('delivery_stops')
        .where('trip_id', tripId)
        .andWhere('is_cod', true)
        .select(
          'id',
          'customer_id',
          'sales_order_id',
          'cod_amount',
          'cod_collected_amount',
          'status',
        );

      if (codStops.length === 0) {
        this.logger.log(
          `Trip ${tripId} has no COD stops - skipping COD settlement`,
        );
        return;
      }

      // Process each COD stop
      for (const stop of codStops) {
        await this.settleCodStop(
          String(stop.id),
          String(stop.customer_id),
          String(stop.sales_order_id ?? ''),
          String(stop.cod_amount),
          String(stop.cod_collected_amount),
          String(stop.status),
          siteId,
          tripId,
        );
      }

      this.logger.log(
        `COD settlement completed for trip ${tripId}: ${codStops.length} stops processed`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process COD settlement for trip ${tripId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * List pending COD stops that have not been settled into receipts yet
   */
  async listPendingCodStops(siteId?: string) {
    let query = this.knex('delivery_stops as ds')
      .join('delivery_trips as dt', 'ds.trip_id', 'dt.id')
      .join('customers as c', 'ds.customer_id', 'c.id')
      .where('ds.is_cod', true)
      .whereNotExists(function () {
        this.select('id')
          .from('collection_receipts')
          .where('reference_type', 'TRIP_COD')
          .whereRaw('reference_id = ds.id');
      });

    if (siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
      query = query.where('dt.site_id', siteId);
    }

    return query.select(
      'ds.id as stopId',
      'ds.trip_id as tripId',
      'dt.trip_no as tripNumber',
      'ds.customer_id as customerId',
      'c.business_name as customerName',
      'ds.sales_order_id as salesOrderId',
      'ds.cod_amount as codAmount',
      'ds.cod_collected_amount as codCollectedAmount',
      'ds.status as stopStatus',
      'dt.status as tripStatus',
      'dt.site_id as siteId',
    );
  }

  /**
   * Settle a specific COD stop manually
   */
  async settleStopById(stopId: string, siteIdOverride?: string) {
    const stop = await this.knex('delivery_stops as ds')
      .join('delivery_trips as dt', 'ds.trip_id', 'dt.id')
      .where('ds.id', stopId)
      .first('ds.*', 'dt.site_id as tripSiteId');
    if (!stop) throw new NotFoundException(`Delivery stop ${stopId} not found`);

    const siteId = siteIdOverride || stop.tripSiteId;
    await this.settleCodStop(
      String(stop.id),
      String(stop.customer_id),
      String(stop.sales_order_id ?? ''),
      String(stop.cod_amount ?? '0'),
      String(stop.cod_collected_amount ?? stop.cod_amount ?? '0'),
      String(stop.status),
      String(siteId),
      String(stop.trip_id),
    );

    return this.knex('collection_receipts')
      .where('reference_type', 'TRIP_COD')
      .where('reference_id', stopId)
      .first('*');
  }

  /**
   * Get settlement details by receipt ID
   */
  async getSettlement(receiptId: string) {
    const receipt = await this.knex('collection_receipts')
      .where('id', receiptId)
      .first('*');
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`);
    return receipt;
  }

  private async settleCodStop(
    stopId: string,
    customerId: string,
    orderId: string,
    codAmount: string,
    codCollectedAmount: string,
    stopStatus: string,
    siteId: string,
    tripId: string,
  ): Promise<void> {
    // Only settle if COD was collected
    const collectedAmount = Money.of(codCollectedAmount);
    if (collectedAmount.isZero()) {
      this.logger.warn(
        `Stop ${stopId}: COD amount ${codCollectedAmount} not collected - skipping settlement`,
      );
      return;
    }

    const amountToSettle = Money.of(codCollectedAmount);

    // Check if already settled (idempotency)
    const existingReceipt = await this.knex('collection_receipts')
      .where('reference_type', 'TRIP_COD')
      .andWhere('reference_id', stopId)
      .first('id', 'receipt_no', 'amount', 'idempotency_key');

    if (existingReceipt) {
      // Verify amount matches - if different, throw error
      if (
        Money.of(existingReceipt.amount).toStorageString() !==
        amountToSettle.toStorageString()
      ) {
        this.logger.error(
          `Stop ${stopId}: Duplicate COD settlement with different amount! Existing: ${existingReceipt.amount}, New: ${amountToSettle.toStorageString()}`,
        );
        return;
      }
      this.logger.log(
        `Stop ${stopId}: COD already settled with receipt ${existingReceipt.receipt_no} (idempotent)`,
      );
      return;
    }

    // Use stopId as part of idempotency key - tripId from outer scope
    const idempotencyKey = `cod-settlement:${stopId}:${tripId}`;

    // Log collection via ledger service (BR-07 atomic transaction)
    const result = await this.knex.transaction(async (trx) => {
      const receiptNo = await this.docNumber.next('RECEIPT', siteId, null, trx);

      // Get the driver who delivered this stop
      const stop = await trx('delivery_stops')
        .where('id', stopId)
        .first('trip_id');
      const trip = await trx('delivery_trips')
        .where('id', stop.trip_id)
        .first('driver_id');
      const driverId = String(trip?.driver_id ?? '');

      // 1. Insert collection_receipts
      const [receipt] = await trx('collection_receipts')
        .insert({
          site_id: siteId,
          customer_id: customerId,
          receipt_no: receiptNo,
          amount: amountToSettle.toStorageString(),
          on_account_amount: '0.00',
          payment_mode: 'CASH',
          reference_type: 'TRIP_COD',
          reference_id: stopId,
          collected_by_user_id: driverId,
          idempotency_key: idempotencyKey,
        })
        .returning('*');

      const receiptId = String(receipt.id);

      // 2. Allocate to invoice if order exists
      let allocatedAmount = Money.zero();
      if (orderId) {
        const invoices = await trx('invoices')
          .where('sales_order_id', orderId)
          .whereIn('status', ['UNPAID', 'PARTIAL', 'OVERDUE'])
          .where('balance_due', '>', 0)
          .orderBy('due_date', 'asc')
          .orderBy('invoice_date', 'asc')
          .select('id', 'balance_due');

        for (const inv of invoices) {
          const due = Money.of(inv.balance_due);
          const actualAmt = amountToSettle.isLessThan(due)
            ? amountToSettle
            : due;

          if (actualAmt.isZero()) continue;

          await trx('receipt_allocations').insert({
            receipt_id: receiptId,
            invoice_id: inv.id,
            allocated_amount: actualAmt.toStorageString(),
          });

          // Update invoice
          const newPaid = Money.of(
            (await trx('invoices').where('id', inv.id).first('paid_amount'))
              ?.paid_amount ?? '0',
          ).add(actualAmt);
          const newBalance = Money.of(
            (await trx('invoices').where('id', inv.id).first('total_amount'))
              ?.total_amount ?? '0',
          ).sub(newPaid);
          let newStatus = 'UNPAID';
          if (newBalance.isZero()) newStatus = 'PAID';
          else if (!newPaid.isZero()) newStatus = 'PARTIAL';

          await trx('invoices').where('id', inv.id).update({
            paid_amount: newPaid.toStorageString(),
            balance_due: newBalance.toStorageString(),
            status: newStatus,
            updated_at: new Date(),
          });

          allocatedAmount = allocatedAmount.add(actualAmt);
        }
      }

      // 3. Post customer_ledger_entries CREDIT (reduces AR balance)
      const prevCustomerBal = await this.ledger.getCustomerBalance(
        customerId,
        trx,
      );
      const newCustomerBal = prevCustomerBal.sub(
        allocatedAmount.isZero() ? amountToSettle : allocatedAmount,
      );
      await trx('customer_ledger_entries').insert({
        site_id: siteId,
        customer_id: customerId,
        entry_type: 'RECEIPT',
        credit: allocatedAmount.isZero()
          ? amountToSettle.toStorageString()
          : allocatedAmount.toStorageString(),
        ref_id: receiptId,
        ref_no: receiptNo,
        running_balance: newCustomerBal.toStorageString(),
      });

      // 4. Post custody_ledger COLLECTION (+amount) — driver wallet increases
      if (driverId) {
        const prevCustodyBal = await this.ledger.getCustodyBalance(
          driverId,
          trx,
        );
        const newCustodyBal = prevCustodyBal.add(amountToSettle);
        await trx('custody_ledger').insert({
          user_id: driverId,
          site_id: siteId,
          entry_type: 'COLLECTION',
          amount_delta: amountToSettle.toStorageString(),
          receipt_id: receiptId,
          running_balance: newCustodyBal.toStorageString(),
        });
      }

      return {
        receiptId,
        receiptNo,
        allocatedAmount: allocatedAmount.toStorageString(),
        customerBalance: newCustomerBal.toStorageString(),
        custodyBalance: (
          await this.ledger.getCustodyBalance(driverId, trx)
        ).toStorageString(),
      };
    });

    this.logger.log(
      `COD settled for stop ${stopId}: receipt ${result.receiptNo}, amount ${amountToSettle.toStorageString()}`,
    );

    // Send notification to driver about COD settlement
    if (this.notify) {
      try {
        const driver = await this.knex('users')
          .join('delivery_trips', 'users.id', 'delivery_trips.driver_id')
          .join('delivery_stops', 'delivery_trips.id', 'delivery_stops.trip_id')
          .where('delivery_stops.id', stopId)
          .first(
            'users.id',
            'users.full_name',
            'users.phone',
            'users.whatsapp_opt_in',
            'delivery_trips.id as trip_id',
          );

        if (driver) {
          await this.notify.send('IN_APP', 'cod_settled', String(driver.id), {
            driverName: driver.full_name,
            tripId: String(driver.trip_id),
            stopId,
            amount: amountToSettle.toStorageString(),
            receiptNo: result.receiptNo,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Failed to send COD settlement notification for stop ${stopId}: ${(err as Error).message}`,
        );
      }
    }
  }

  private getStringValue(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Domain event contains a missing string field');
    }
    return value;
  }
}

// Export the provider for module wiring
export const CodSettlementProvider = {
  provide: 'COD_SETTLEMENT_SERVICE',
  useExisting: CodSettlementService,
};
