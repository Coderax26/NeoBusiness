import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { ConfigService } from '@nestjs/config';
import { Qty } from '../../shared/utils/qty.util.js';
import { v4 as uuidv4 } from 'uuid';
import { Clock } from '../../shared/utils/clock.util.js';
import { InventoryService } from './inventory.service.js';
import { LedgerPostingService } from './ledger-posting.service.js';

/**
 * InventoryExpiryJob — sweeps for expired batches every configured interval.
 *
 * When a batch with status 'AVAILABLE' has an expiry_date in the past,
 * this job:
 *   1. Updates the batch status to 'EXPIRED'
 *   2. Creates a stock_adjustment of type 'EXPIRY_REMOVAL' for the remaining qty
 *   3. Logs the removal in stock_ledger_txns
 *
 * This runs in a transaction to ensure atomicity.
 */
@Injectable()
export class InventoryExpiryJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryExpiryJob.name);
  private interval: NodeJS.Timeout | undefined;

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly config: ConfigService,
    private readonly inventoryService: InventoryService,
    private readonly ledgerPosting: LedgerPostingService,
  ) {}

  onModuleInit(): void {
    const intervalMs =
      this.config.get<number>('inventory.expiry_sweep_interval_ms') ?? 60_000;
    this.interval = setInterval(() => {
      this.sweep().catch((err) =>
        this.logger.error(
          `Inventory expiry sweep error: ${(err as Error).message}`,
        ),
      );
    }, intervalMs);
    this.logger.log(
      `Inventory expiry sweep started (polling every ${intervalMs}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.logger.log('Inventory expiry sweep stopped');
  }

  /**
   * Find and process expired batches.
   * Returns the number of batches processed.
   */
  async sweep(): Promise<number> {
    const now = Clock.todayKolkata();
    await this.inventoryService.releaseExpiredReservations();

    // Find batches that are AVAILABLE and have expiry_date < today
    const expiredBatches = await this.knex('inventory_batches')
      .where({ status: 'AVAILABLE' })
      .andWhere('expiry_date', '<', now)
      .whereNotNull('expiry_date')
      .select(
        'id',
        'site_id',
        'item_id',
        'batch_number',
        'qty_on_hand',
        'qty_committed',
        'created_by',
        'expiry_date',
      )
      .limit(100); // Process in batches of 100

    if (expiredBatches.length === 0) {
      this.logger.debug('Inventory expiry sweep: no expired batches found');
      return 0;
    }

    let processed = 0;
    for (const batch of expiredBatches) {
      try {
        await this.processExpiredBatch(batch);
        processed++;
      } catch (err) {
        this.logger.error(
          `Failed to process expired batch ${batch.batch_number}: ${(err as Error).message}`,
        );
        // Continue with other batches rather than stopping
      }
    }

    if (processed > 0) {
      this.logger.log(
        `Inventory expiry sweep: processed ${processed} expired batch(es)`,
      );
    }
    return processed;
  }

  private async processExpiredBatch(batch: {
    id: string;
    site_id: string;
    item_id: string;
    batch_number: string;
    qty_on_hand: string;
    qty_committed: string;
    created_by: string | null;
    expiry_date: string;
  }): Promise<void> {
    const onHand = Qty.of(batch.qty_on_hand, 'KG');
    const committed = Qty.of(batch.qty_committed, 'KG');
    const available = onHand.sub(committed);

    // Skip if nothing available (committed stock will be handled by reservation expiry)
    if (available.isZero()) {
      this.logger.debug(
        `Batch ${batch.batch_number} has no available qty to expire (on_hand=${onHand.toStorageString()}, committed=${committed.toStorageString()})`,
      );
      return;
    }

    const adjustmentNo = `EXP-${batch.batch_number}-${Clock.nowUtc().getTime()}`;
    const now = Clock.nowUtc();

    await this.knex.transaction(async (trx) => {
      // 1. Update batch status to EXPIRED
      await trx('inventory_batches').where({ id: batch.id }).update({
        status: 'EXPIRED',
        updated_at: now,
      });

      // 2. Create stock_adjustment for the expired removal
      await trx('stock_adjustments').insert({
        id: uuidv4(),
        site_id: batch.site_id,
        item_id: batch.item_id,
        adjustment_no: adjustmentNo,
        adjustment_type: 'EXPIRY_REMOVAL',
        qty: available.toStorageString(),
        uom: 'KG',
        variance_pct: '100.00', // 100% of available stock removed
        reason: `Batch ${batch.batch_number} expired on ${batch.expiry_date}`,
        status: 'APPROVED',
        requested_by: batch.created_by ?? null,
        requested_at: now,
        approved_by: null, // Auto-approved by system
        approved_at: now,
        created_at: now,
        updated_at: now,
      });

      // 3. Post the removal and update the cached on-hand quantity atomically.
      await this.ledgerPosting.post(trx, {
        siteId: batch.site_id,
        itemId: batch.item_id,
        batchId: batch.id,
        txnType: 'EXPIRY_REMOVAL',
        qty: available.toStorageString(),
        referenceTable: 'stock_adjustments',
        referenceNo: adjustmentNo,
        note: `Auto-removal of expired batch ${batch.batch_number}`,
      });

      this.logger.log(
        `Expired batch ${batch.batch_number} (site: ${batch.site_id}, item: ${batch.item_id}, qty: ${available.toStorageString()})`,
      );
    });
  }
}
