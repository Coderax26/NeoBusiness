import { BadRequestException, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { Clock } from '../../shared/utils/clock.util.js';
import { Qty } from '../../shared/utils/qty.util.js';

export interface LedgerPostEntry {
  siteId: string;
  itemId: string;
  batchId?: string;
  txnType: string;
  qty: string;
  referenceTable?: string;
  referenceId?: string;
  referenceNo?: string;
  postedBy?: string;
  note?: string;
  reversesTxnId?: string;
  committedDelta?: number;
  onHandDelta?: number;
  applyCache?: boolean;
}

@Injectable()
export class LedgerPostingService {
  async post(trx: Knex.Transaction, entry: LedgerPostEntry): Promise<string> {
    const qty = Qty.of(entry.qty, 'KG');
    if (qty.isLessThan(Qty.zero('KG'))) {
      throw new BadRequestException('Ledger quantity cannot be negative');
    }

    const now = Clock.nowUtc();
    const id = uuidv4();
    if (entry.applyCache !== false && entry.batchId) {
      const delta =
        entry.onHandDelta ?? this.onHandDelta(entry.txnType, qty.toNumber());
      if (delta !== 0) {
        const updated = await trx('inventory_batches')
          .where({ id: entry.batchId })
          .update({
            qty_on_hand: trx.raw('qty_on_hand + ?', [delta]),
            updated_at: now,
          });
        if (updated === 0)
          throw new BadRequestException('Inventory batch not found');
      }
    }
    if (
      entry.applyCache !== false &&
      entry.batchId &&
      entry.txnType === 'RESERVATION'
    ) {
      const updated = await trx('inventory_batches')
        .where({ id: entry.batchId })
        .update({
          qty_committed: trx.raw('qty_committed + ?', [qty.toNumber()]),
          updated_at: now,
        });
      if (updated === 0)
        throw new BadRequestException('Inventory batch not found');
    }
    if (
      entry.applyCache !== false &&
      entry.batchId &&
      entry.txnType === 'RELEASE'
    ) {
      const updated = await trx('inventory_batches')
        .where({ id: entry.batchId })
        .update({
          qty_committed: trx.raw('GREATEST(0, qty_committed - ?)', [
            qty.toNumber(),
          ]),
          updated_at: now,
        });
      if (updated === 0)
        throw new BadRequestException('Inventory batch not found');
    }
    if (
      entry.applyCache !== false &&
      entry.batchId &&
      entry.committedDelta !== undefined
    ) {
      const updated = await trx('inventory_batches')
        .where({ id: entry.batchId })
        .update({
          qty_committed: trx.raw('GREATEST(0, qty_committed + ?)', [
            entry.committedDelta,
          ]),
          updated_at: now,
        });
      if (updated === 0)
        throw new BadRequestException('Inventory batch not found');
    }

    await trx('stock_ledger_txns').insert({
      id,
      site_id: entry.siteId,
      item_id: entry.itemId,
      batch_id: entry.batchId ?? null,
      txn_type: entry.txnType,
      qty: qty.toStorageString(),
      uom: 'KG',
      reference_table: entry.referenceTable ?? null,
      reference_id: entry.referenceId ?? null,
      reference_no: entry.referenceNo ?? null,
      posted_by: entry.postedBy ?? null,
      note: entry.note ?? null,
      reverses_txn_id: entry.reversesTxnId ?? null,
      posted_at: now,
      created_at: now,
    });
    return id;
  }

  private onHandDelta(txnType: string, qty: number): number {
    if (
      [
        'RECEIPT',
        'RETURN',
        'TRANSFER_IN',
        'PROD_OUTPUT',
        'OPENING_STOCK',
        'COUNT_SURPLUS',
        'FOUND',
      ].includes(txnType)
    ) {
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
        'COUNT_DEFICIT',
      ].includes(txnType)
    ) {
      return -qty;
    }
    return 0;
  }
}
