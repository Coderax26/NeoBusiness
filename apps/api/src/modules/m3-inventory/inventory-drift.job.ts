import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { ConfigService } from '@nestjs/config';
import { Qty } from '../../shared/utils/qty.util.js';

@Injectable()
export class InventoryDriftJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryDriftJob.name);
  private interval: NodeJS.Timeout | undefined;

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs =
      this.config.get<number>('inventory.drift_check_interval_ms') ??
      86_400_000;
    this.interval = setInterval(() => {
      this.check().catch((error: unknown) =>
        this.logger.error(
          `Inventory drift check error: ${(error as Error).message}`,
        ),
      );
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
  }

  async check(): Promise<number> {
    const batches = await this.knex('inventory_batches').select(
      'id',
      'qty_on_hand',
      'qty_committed',
    );
    let driftCount = 0;
    for (const batch of batches) {
      const ledgerRows = await this.knex('stock_ledger_txns')
        .where({ batch_id: batch.id })
        .select('id', 'txn_type', 'qty', 'reverses_txn_id');
      const byId = new Map(
        ledgerRows.map((row) => [String(row.id), row]),
      );
      const expected = ledgerRows.reduce((total, row) => {
        const type = String(row.txn_type);
        const qty = Qty.of(String(row.qty), 'KG');
        let delta = this.onHandDelta(type, qty);
        if (type === 'REVERSAL' && row.reverses_txn_id) {
          const original = byId.get(String(row.reverses_txn_id));
          if (original) {
            delta = this.onHandDelta(String(original.txn_type), qty).mul(-1);
          }
        }
        return total.add(delta);
      }, Qty.zero('KG'));
      const actual = Qty.of(String(batch.qty_on_hand), 'KG');
      if (expected.toStorageString() !== actual.toStorageString()) {
        driftCount++;
        this.logger.warn(
          `Inventory drift for batch ${batch.id}: expected=${expected.toStorageString()} actual=${actual.toStorageString()}`,
        );
      }
    }
    return driftCount;
  }

  private onHandDelta(type: string, qty: Qty): Qty {
    if (['RECEIPT', 'RETURN', 'TRANSFER_IN', 'PROD_OUTPUT'].includes(type)) {
      return qty;
    }
    if (
      [
        'SALE_DISPATCH',
        'TRANSFER_OUT',
        'ADJUSTMENT',
        'WRITEOFF',
        'EXPIRY_REMOVAL',
        'SHRINKAGE',
        'PROD_CONSUME',
      ].includes(type)
    ) {
      return qty.mul(-1);
    }
    return Qty.zero('KG');
  }
}
