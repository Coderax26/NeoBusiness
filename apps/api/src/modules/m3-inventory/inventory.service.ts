import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { Clock } from '../../shared/utils/clock.util.js';
import { Qty } from '../../shared/utils/qty.util.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import {
  LedgerPostingService,
  type LedgerPostEntry,
} from './ledger-posting.service.js';
import {
  EXCEPTION_PORT,
  type AtpResult,
  type ExceptionPort,
  type InventoryPort,
  type ReserveResult,
} from '../../shared/ports/ports.interface.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class InventoryService implements InventoryPort {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly outbox?: OutboxService,
    @Optional()
    @Inject(EXCEPTION_PORT)
    private readonly exceptionPort?: ExceptionPort,
    @Optional() private readonly ledgerPosting?: LedgerPostingService,
  ) {}

  async getAvailableQty(siteId: string, itemId: string): Promise<string> {
    if (!UUID_RE.test(siteId) || !UUID_RE.test(itemId)) {
      return Qty.zero('KG').toStorageString();
    }

    const row = await this.knex('inventory_batches')
      .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
      .where(function () {
        this.whereNull('expiry_date').orWhere(
          'expiry_date',
          '>=',
          Clock.todayKolkata(),
        );
      })
      .sum('qty_available as total')
      .first();
    return Qty.of(String(row?.total ?? '0'), 'KG').toStorageString();
  }

  private isUuid(v?: string): boolean {
    return (
      !!v &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    );
  }

  async listStock(
    siteId?: string,
    locationId?: string,
    itemId?: string,
  ): Promise<
    Array<{
      batchId: string;
      itemId: string;
      siteId: string;
      locationId: string | null;
      batchNumber: string;
      status: string;
      qtyOnHand: string;
      qtyCommitted: string;
      qtyAvailable: string;
      expiryDate: string | null;
      skuCode?: string | null;
      itemName?: string | null;
      uom?: string | null;
      siteName?: string | null;
      locationName?: string | null;
    }>
  > {
    const query = this.knex('inventory_batches as ib')
      .leftJoin('items as i', 'ib.item_id', 'i.id')
      .leftJoin('sites as s', 'ib.site_id', 's.id')
      .leftJoin('locations as l', 'ib.location_id', 'l.id')
      .select(
        'ib.id as batchId',
        'ib.item_id as itemId',
        'ib.site_id as siteId',
        'ib.location_id as locationId',
        'ib.batch_number as batchNumber',
        'ib.status',
        'ib.qty_on_hand as qtyOnHand',
        'ib.qty_committed as qtyCommitted',
        'ib.qty_available as qtyAvailable',
        'ib.expiry_date as expiryDate',
        'ib.landed_cost_per_unit as unitCost',
        'i.sku_code as skuCode',
        'i.name as itemName',
        'i.primary_uom as uom',
        'i.item_category as category',
        'i.min_stock_qty as minStock',
        's.name as siteName',
        'l.name as locationName',
      )
      .orderBy([{ column: 'ib.expiry_date', order: 'asc', nulls: 'last' }]);
    if (this.isUuid(siteId)) query.where('ib.site_id', siteId);
    if (this.isUuid(locationId)) query.where('ib.location_id', locationId);
    if (this.isUuid(itemId)) query.where('ib.item_id', itemId);
    return query;
  }

  async listLedger(filters: {
    siteId?: string;
    itemId?: string;
    batchId?: string;
    from?: string;
    to?: string;
  }): Promise<unknown[]> {
    if (filters.from && filters.to && filters.from > filters.to) {
      throw new BadRequestException('Ledger date range is invalid');
    }
    const query = this.knex('stock_ledger_txns as slt')
      .leftJoin('items as i', 'slt.item_id', 'i.id')
      .leftJoin('sites as s', 'slt.site_id', 's.id')
      .leftJoin('inventory_batches as ib', 'slt.batch_id', 'ib.id')
      .select(
        'slt.id',
        'slt.site_id as siteId',
        's.name as siteName',
        'slt.item_id as itemId',
        'i.sku_code as skuCode',
        'i.name as itemName',
        'slt.batch_id as batchId',
        'ib.batch_number as batchNumber',
        'slt.txn_type as txnType',
        'slt.qty',
        'slt.uom',
        'slt.reference_table as referenceTable',
        'slt.reference_id as referenceId',
        'slt.reference_no as referenceNo',
        'slt.posted_at as postedAt',
        'slt.note',
        'slt.reverses_txn_id as reversesTxnId',
      )
      .orderBy('slt.posted_at', 'desc')
      .limit(500);
    if (this.isUuid(filters.siteId)) query.where('slt.site_id', filters.siteId);
    if (this.isUuid(filters.itemId)) query.where('slt.item_id', filters.itemId);
    if (this.isUuid(filters.batchId))
      query.where('slt.batch_id', filters.batchId);
    if (filters.from) query.where('slt.posted_at', '>=', filters.from);
    if (filters.to) query.where('slt.posted_at', '<=', filters.to);
    return query;
  }

  async listExpiryWatchlist(siteId?: string, days = 30): Promise<unknown[]> {
    const horizon = new Date(Clock.nowUtc());
    horizon.setUTCDate(horizon.getUTCDate() + days);
    const query = this.knex('inventory_batches as ib')
      .leftJoin('items as i', 'ib.item_id', 'i.id')
      .leftJoin('sites as s', 'ib.site_id', 's.id')
      .leftJoin('locations as l', 'ib.location_id', 'l.id')
      .where('ib.status', 'AVAILABLE')
      .whereNotNull('ib.expiry_date')
      .where('ib.expiry_date', '<=', horizon.toISOString().slice(0, 10))
      .select(
        'ib.id as batchId',
        'ib.item_id as itemId',
        'i.sku_code as skuCode',
        'i.name as itemName',
        'i.primary_uom as uom',
        'ib.site_id as siteId',
        's.name as siteName',
        'ib.location_id as locationId',
        'l.name as locationName',
        'ib.batch_number as batchNumber',
        'ib.qty_available as availableQty',
        'ib.expiry_date as expiryDate',
      )
      .orderBy('ib.expiry_date', 'asc');
    if (this.isUuid(siteId)) query.where('ib.site_id', siteId);
    return query;
  }

  async reverseLedgerTransaction(
    transactionId: string,
    postedBy: string,
    reason: string,
  ): Promise<string> {
    return this.knex.transaction(async (trx) => {
      const original = await trx('stock_ledger_txns')
        .where({ id: transactionId })
        .first();
      if (!original)
        throw new BadRequestException('Ledger transaction not found');
      const existing = await trx('stock_ledger_txns')
        .where({ reverses_txn_id: transactionId })
        .first('id');
      if (existing) return String(existing.id);
      if (String(original.txn_type) === 'REVERSAL') {
        throw new ConflictException(
          'A reversal transaction cannot be reversed',
        );
      }
      if (original.batch_id) {
        const qty = Number(original.qty);
        const txnType = String(original.txn_type);
        const committedDelta =
          txnType === 'RESERVATION'
            ? -qty
            : txnType === 'RELEASE'
              ? qty
              : undefined;
        const onHandDelta =
          committedDelta === undefined
            ? this.reversalOnHandDelta(txnType, qty)
            : undefined;
        return this.insertLedger(trx, {
          siteId: String(original.site_id),
          itemId: String(original.item_id),
          batchId: original.batch_id ? String(original.batch_id) : undefined,
          txnType: 'REVERSAL',
          qty: String(original.qty),
          referenceTable: 'stock_ledger_txns',
          referenceId: transactionId,
          referenceNo: `REV-${transactionId}`,
          postedBy,
          note: reason,
          reversesTxnId: transactionId,
          committedDelta,
          onHandDelta,
        });
      }
      return this.insertLedger(trx, {
        siteId: String(original.site_id),
        itemId: String(original.item_id),
        txnType: 'REVERSAL',
        qty: String(original.qty),
        referenceTable: 'stock_ledger_txns',
        referenceId: transactionId,
        referenceNo: `REV-${transactionId}`,
        postedBy,
        note: reason,
        reversesTxnId: transactionId,
        applyCache: false,
      });
    });
  }

  async getATP(
    siteId: string,
    itemId: string,
    orderQty: string,
    deliveryDate = Clock.todayKolkata(),
  ): Promise<AtpResult> {
    const available = await this.getAvailableQty(siteId, itemId);
    const availableQty = Qty.of(available, 'KG');
    const requestedQty = Qty.of(orderQty, 'KG');
    return {
      itemId,
      siteId,
      availableQty: availableQty.toStorageString(),
      uom: 'KG',
      canFulfil: !availableQty.isLessThan(requestedQty),
    };
  }

  async checkATP(
    siteId: string,
    itemId: string,
    qty: string,
    deliveryDate: string,
  ): Promise<AtpResult> {
    return this.getATP(siteId, itemId, qty, deliveryDate);
  }

  async reserveStock(
    siteId: string,
    itemId: string,
    qty: string,
    orderId: string,
    idempotencyKey: string,
    deliveryDate = Clock.todayKolkata(),
  ): Promise<ReserveResult> {
    const requested = Qty.of(qty, 'KG');
    const existing = await this.knex('stock_reservations')
      .where('idempotency_key', idempotencyKey)
      .select('id', 'qty', 'order_id', 'item_id', 'site_id')
      .first();

    if (existing) {
      if (
        String(existing.order_id) !== orderId ||
        String(existing.item_id) !== itemId ||
        String(existing.site_id) !== siteId ||
        Qty.of(String(existing.qty), 'KG').toStorageString() !==
          requested.toStorageString()
      ) {
        throw new ConflictException(
          'Idempotency key was already used for a different reservation',
        );
      }
      const reservations = await this.knex('stock_reservations')
        .where({ order_id: orderId, item_id: itemId })
        .whereIn('status', ['ACTIVE', 'CONSUMED'])
        .select('id', 'qty');
      const allocated = reservations.reduce(
        (sum, row) => sum.add(Qty.of(String(row.qty), 'KG')),
        Qty.zero('KG'),
      );
      return {
        allocated: allocated.toStorageString(),
        deficit: requested.sub(allocated).toStorageString(),
        reservationIds: reservations.map((row) => String(row.id)),
      };
    }

    return this.knex.transaction(async (trx) => {
      const batches = await trx('inventory_batches')
        .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
        .where('qty_available', '>', 0)
        .where(function () {
          this.whereNull('expiry_date').orWhere(
            'expiry_date',
            '>=',
            deliveryDate,
          );
        })
        .orderBy([{ column: 'expiry_date', order: 'asc', nulls: 'last' }])
        .forUpdate()
        .select('id', 'qty_available');

      let remaining = requested;
      const reservationIds: string[] = [];
      for (const batch of batches) {
        if (remaining.isZero()) break;
        const available = Qty.of(String(batch.qty_available), 'KG');
        const allocated = available.isLessThan(remaining)
          ? available
          : remaining;
        const reservationId = uuidv4();

        await trx('stock_reservations').insert({
          id: reservationId,
          site_id: siteId,
          item_id: itemId,
          batch_id: batch.id,
          order_id: orderId,
          order_type: 'SALES_ORDER',
          qty: allocated.toStorageString(),
          uom: 'KG',
          status: 'ACTIVE',
          idempotency_key: reservationIds.length === 0 ? idempotencyKey : null,
          expires_at: Clock.addHours(Clock.nowUtc(), 24),
          updated_at: Clock.nowUtc(),
        });
        await this.insertLedger(trx, {
          siteId,
          itemId,
          batchId: String(batch.id),
          txnType: 'RESERVATION',
          qty: allocated.toStorageString(),
          referenceTable: 'stock_reservations',
          referenceId: reservationId,
          referenceNo: idempotencyKey,
        });
        reservationIds.push(reservationId);
        remaining = remaining.sub(allocated);
      }

      const allocated = requested.sub(remaining);
      if (this.outbox) {
        await this.outbox.raise(
          trx,
          remaining.isZero() ? 'stock.reserved' : 'stock.insufficient',
          orderId,
          {
            orderLineId: orderId,
            itemId,
            reservedQty: allocated.toStorageString(),
            deficitQty: remaining.toStorageString(),
            requestedQty: requested.toStorageString(),
            reservationIds,
            availableQty: allocated.toStorageString(),
            itemCategory: 'UNKNOWN',
          },
          'm3',
        );
      }
      return {
        allocated: allocated.toStorageString(),
        deficit: remaining.toStorageString(),
        reservationIds,
      };
    });
  }

  async reserve(
    orderLineId: string,
    siteId: string,
    itemId: string,
    qty: string,
    deliveryDate: string,
  ): Promise<ReserveResult> {
    return this.reserveStock(
      siteId,
      itemId,
      qty,
      orderLineId,
      `reservation:${orderLineId}:${qty}`,
      deliveryDate,
    );
  }

  async releaseReservation(
    reservationId: string,
    idempotencyKey: string,
  ): Promise<{ success: boolean }> {
    return this.knex.transaction(async (trx) => {
      const reservation = await trx('stock_reservations')
        .where({ id: reservationId })
        .forUpdate()
        .first('id', 'status', 'qty', 'item_id', 'site_id', 'batch_id');
      if (!reservation) return { success: false };
      if (reservation.status === 'RELEASED') return { success: true };
      if (reservation.status !== 'ACTIVE') {
        throw new ConflictException('Only active reservations can be released');
      }

      await trx('stock_reservations')
        .where({ id: reservationId })
        .update({ status: 'RELEASED', updated_at: Clock.nowUtc() });
      await this.insertLedger(trx, {
        siteId: String(reservation.site_id),
        itemId: String(reservation.item_id),
        batchId: String(reservation.batch_id),
        txnType: 'RELEASE',
        qty: String(reservation.qty),
        referenceTable: 'stock_reservations',
        referenceId: reservationId,
        referenceNo: idempotencyKey,
      });
      return { success: true };
    });
  }

  async release(orderOrLineId: string): Promise<void> {
    const lineRows = await this.knex('sales_order_lines')
      .where('order_id', orderOrLineId)
      .select('id');
    const targetIds = Array.from(
      new Set([orderOrLineId, ...lineRows.map((l: any) => String(l.id))]),
    );
    const reservations = await this.knex('stock_reservations')
      .whereIn('order_id', targetIds)
      .andWhere('status', 'ACTIVE')
      .select('id');
    for (const reservation of reservations) {
      await this.releaseReservation(
        String(reservation.id),
        `release:${reservation.id}`,
      );
    }
  }

  async postDispatch(
    tripStopId: string,
    lines: Array<{ itemId: string; batchId: string; qty: string }>,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      for (const line of lines) {
        const batch = await trx('inventory_batches')
          .where({ id: line.batchId, item_id: line.itemId })
          .forUpdate()
          .first('id', 'site_id', 'qty_on_hand', 'qty_committed');
        if (!batch) throw new BadRequestException('Inventory batch not found');
        const qty = Qty.of(line.qty, 'KG');
        if (Qty.of(String(batch.qty_on_hand), 'KG').isLessThan(qty)) {
          throw new BadRequestException('Insufficient physical stock');
        }
        await this.insertLedger(trx, {
          siteId: String(batch.site_id),
          itemId: line.itemId,
          batchId: line.batchId,
          txnType: 'SALE_DISPATCH',
          qty: qty.toStorageString(),
          referenceTable: 'trip_stops',
          referenceNo: tripStopId,
          committedDelta: -qty.toNumber(),
        });
        await trx('stock_reservations')
          .where({
            item_id: line.itemId,
            batch_id: line.batchId,
            status: 'ACTIVE',
          })
          .update({
            status: 'CONSUMED',
            consumed_at: Clock.nowUtc(),
            updated_at: Clock.nowUtc(),
          });
      }
    });
  }

  async postReturn(
    tripStopId: string,
    lines: Array<{
      itemId: string;
      batchId: string;
      qty: string;
      damaged: boolean;
    }>,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      for (const line of lines) {
        const batch = await trx('inventory_batches')
          .where({ id: line.batchId, item_id: line.itemId })
          .forUpdate()
          .first('id', 'site_id');
        if (!batch) throw new BadRequestException('Inventory batch not found');
        const qty = Qty.of(line.qty, 'KG');
        await this.insertLedger(trx, {
          siteId: String(batch.site_id),
          itemId: line.itemId,
          batchId: line.batchId,
          txnType: 'RETURN',
          qty: qty.toStorageString(),
          referenceTable: 'trip_stops',
          referenceNo: tripStopId,
          note: line.damaged ? 'Damaged return quarantined' : undefined,
        });
        await trx('inventory_batches')
          .where({ id: batch.id })
          .update({
            status: line.damaged ? 'QUARANTINE' : 'AVAILABLE',
            updated_at: Clock.nowUtc(),
          });
      }
    });
  }

  async postGRN(grnId: string): Promise<void> {
    const grn = await this.knex('goods_receipts').where({ id: grnId }).first();
    if (!grn) {
      throw new NotFoundException(`GRN ${grnId} not found`);
    }

    const lines = await this.knex('goods_receipt_lines')
      .where({ grn_id: grnId })
      .select('*');

    const poQtyMap = new Map<string, string>();
    if (grn.po_id) {
      const poLines = await this.knex('purchase_order_lines')
        .where({ po_id: grn.po_id })
        .select('item_id', 'confirmed_qty', 'ordered_qty');
      for (const pl of poLines) {
        const expected =
          Number(pl.confirmed_qty) > 0 ? pl.confirmed_qty : pl.ordered_qty;
        poQtyMap.set(String(pl.item_id), String(expected));
      }
    }

    for (const line of lines) {
      const itemId = String(line.item_id);
      const receivedQty = String(line.received_qty);
      const requestedQty = poQtyMap.get(itemId) ?? receivedQty;
      await this.receiveGRN(
        String(grn.site_id),
        String(grn.po_id || grn.id),
        itemId,
        requestedQty,
        receivedQty,
        {
          grnId: String(grn.id),
          grnNo: grn.grn_no ? String(grn.grn_no) : undefined,
          locationId: grn.location_id ? String(grn.location_id) : undefined,
          batchLotNo: line.batch_lot_no ?? undefined,
          mfgDate: line.mfg_date ?? undefined,
          expiryDate: line.expiry_date ?? undefined,
          receivedBy: grn.received_by ? String(grn.received_by) : undefined,
        },
      );
    }
  }

  async postConsumption(
    workOrderId: string,
    materialLineId: string,
    itemId: string,
    batchId: string,
    qty: string,
    opts?: { siteId?: string; uom?: string },
  ): Promise<string> {
    return this.knex.transaction(async (trx) => {
      const consumedQty = Qty.of(qty, opts?.uom ?? 'KG');

      if (batchId) {
        const batch = await trx('inventory_batches')
          .where({ id: batchId, item_id: itemId })
          .forUpdate()
          .first('id', 'site_id', 'qty_on_hand', 'qty_committed');
        if (!batch) throw new BadRequestException('Inventory batch not found');
        if (Qty.of(String(batch.qty_on_hand), opts?.uom ?? 'KG').isLessThan(consumedQty)) {
          throw new BadRequestException('Insufficient physical stock');
        }
        const resolvedBatchId = String(batch.id);
        const currentCommitted = Number(batch.qty_committed ?? 0);
        const committedDelta =
          currentCommitted > 0
            ? -Math.min(currentCommitted, consumedQty.toNumber())
            : 0;

        await this.insertLedger(trx, {
          siteId: String(batch.site_id),
          itemId,
          batchId: resolvedBatchId,
          txnType: 'PROD_CONSUME',
          qty: consumedQty.toStorageString(),
          referenceTable: 'work_order_materials',
          referenceId: workOrderId,
          referenceNo: materialLineId,
          committedDelta: committedDelta !== 0 ? committedDelta : undefined,
        });

        await trx('stock_reservations')
          .where({ status: 'ACTIVE' })
          .andWhere(function () {
            this.where({ order_id: materialLineId }).orWhere({
              item_id: itemId,
              batch_id: resolvedBatchId,
            });
          })
          .update({
            status: 'CONSUMED',
            consumed_at: Clock.nowUtc(),
            updated_at: Clock.nowUtc(),
          });

        return resolvedBatchId;
      }

      if (!opts?.siteId) {
        throw new BadRequestException('Inventory batch not found');
      }

      const candidateBatches = await trx('inventory_batches')
        .where({ site_id: opts.siteId, item_id: itemId })
        .where('qty_on_hand', '>', 0)
        .orderByRaw("CASE WHEN status = 'AVAILABLE' THEN 0 ELSE 1 END, expiry_date ASC NULLS LAST, created_at ASC")
        .forUpdate()
        .select('id', 'site_id', 'qty_on_hand', 'qty_committed');

      const totalOnHand = candidateBatches.reduce(
        (sum, b: any) => sum + Number(b.qty_on_hand ?? 0),
        0,
      );
      if (candidateBatches.length === 0 || totalOnHand + 1e-6 < consumedQty.toNumber()) {
        throw new BadRequestException(
          candidateBatches.length === 0
            ? 'Inventory batch not found'
            : 'Insufficient physical stock',
        );
      }

      let remaining = consumedQty;
      let firstBatchId = '';
      for (const batch of candidateBatches) {
        if (remaining.isZero()) break;
        const batchOnHand = Qty.of(String(batch.qty_on_hand), opts?.uom ?? 'KG');
        const take = batchOnHand.isLessThan(remaining) ? batchOnHand : remaining;
        if (take.isZero()) continue;

        const bId = String(batch.id);
        if (!firstBatchId) firstBatchId = bId;
        const currentCommitted = Number(batch.qty_committed ?? 0);
        const committedDelta =
          currentCommitted > 0 ? -Math.min(currentCommitted, take.toNumber()) : 0;

        await this.insertLedger(trx, {
          siteId: String(batch.site_id),
          itemId,
          batchId: bId,
          txnType: 'PROD_CONSUME',
          qty: take.toStorageString(),
          referenceTable: 'work_order_materials',
          referenceId: workOrderId,
          referenceNo: materialLineId,
          committedDelta: committedDelta !== 0 ? committedDelta : undefined,
        });

        await trx('stock_reservations')
          .where({ status: 'ACTIVE' })
          .andWhere(function () {
            this.where({ order_id: materialLineId }).orWhere({
              item_id: itemId,
              batch_id: bId,
            });
          })
          .update({
            status: 'CONSUMED',
            consumed_at: Clock.nowUtc(),
            updated_at: Clock.nowUtc(),
          });

        remaining = remaining.sub(take);
      }

      return firstBatchId;
    });
  }

  async postOutput(
    workOrderId: string,
    itemId: string,
    batchId: string,
    qty: string,
    opts?: {
      siteId?: string;
      batchNumber?: string;
      uom?: string;
      createdBy?: string;
    },
  ): Promise<string> {
    return this.knex.transaction(async (trx) => {
      const outputQty = Qty.of(qty, opts?.uom ?? 'KG');
      let resolvedBatchId = batchId;
      let resolvedSiteId = opts?.siteId ?? '';

      if (resolvedBatchId) {
        const batch = await trx('inventory_batches')
          .where({ id: resolvedBatchId, item_id: itemId })
          .forUpdate()
          .first('id', 'site_id');
        if (!batch) throw new BadRequestException('Inventory batch not found');
        resolvedSiteId = String(batch.site_id);
      } else {
        if (!resolvedSiteId) {
          throw new BadRequestException(
            'siteId is required when creating a new FG output batch',
          );
        }
        const defaultLocation = await trx('locations')
          .where({ site_id: resolvedSiteId })
          .first('id');
        let candidateBatchNo =
          opts?.batchNumber?.trim() ||
          `FG-${workOrderId.slice(0, 8).toUpperCase()}-${Clock.nowUtc().getTime().toString().slice(-6)}`;
        // Prevent duplicate batch_number 500 when recording multiple partial outputs for the same WO
        const dup = await trx('inventory_batches')
          .where({ site_id: resolvedSiteId, item_id: itemId, batch_number: candidateBatchNo })
          .first('id');
        if (dup) {
          candidateBatchNo = `${candidateBatchNo}-${Clock.nowUtc().getTime().toString().slice(-4)}`;
        }
        const createdBatch = await this.createBatch(trx, resolvedSiteId, itemId, {
          locationId: defaultLocation?.id ? String(defaultLocation.id) : undefined,
          batchLotNo: candidateBatchNo,
          mfgDate: Clock.nowUtc(),
          receivedBy: opts?.createdBy,
        });
        resolvedBatchId = String(createdBatch.id);
      }

      // Produced FG must be immediately AVAILABLE (qty_on_hand increases, qty_committed stays 0)
      await this.insertLedger(trx, {
        siteId: resolvedSiteId,
        itemId,
        batchId: resolvedBatchId,
        txnType: 'PROD_OUTPUT',
        qty: outputQty.toStorageString(),
        referenceTable: 'work_order_outputs',
        referenceId: workOrderId,
        referenceNo: `${workOrderId}-out`,
        postedBy:
          opts?.createdBy && UUID_RE.test(opts.createdBy)
            ? opts.createdBy
            : undefined,
      });

      return resolvedBatchId;
    });
  }

  async receiveGRN(
    siteId: string,
    poId: string,
    itemId: string,
    requestedQty: string,
    receivedQty: string,
    opts?: {
      grnId?: string;
      grnNo?: string;
      locationId?: string;
      batchLotNo?: string;
      mfgDate?: string | Date;
      expiryDate?: string | Date;
      receivedBy?: string;
    },
  ): Promise<{
    success: boolean;
    receivedQty: string;
    shortfall: string;
    exceptionType?: string;
  }> {
    const idempRef = opts?.grnNo || opts?.grnId || poId;
    return this.knex.transaction(async (trx) => {
      const existing = await trx('stock_ledger_txns')
        .where({
          reference_no: idempRef,
          item_id: itemId,
          site_id: siteId,
          txn_type: 'RECEIPT',
        })
        .first('qty');
      if (existing) {
        const received = Qty.of(String(existing.qty), 'KG');
        return {
          success: true,
          receivedQty: received.toStorageString(),
          shortfall: Qty.of(requestedQty, 'KG').sub(received).toStorageString(),
        };
      }

      const requested = Qty.of(requestedQty, 'KG');
      const received = Qty.of(receivedQty, 'KG');
      if (received.isLessThan(Qty.zero('KG'))) {
        throw new BadRequestException('Received quantity cannot be negative');
      }

      let batch = opts?.batchLotNo
        ? await trx('inventory_batches')
            .where({
              site_id: siteId,
              item_id: itemId,
              batch_number: opts.batchLotNo,
            })
            .first('id', 'site_id')
        : await trx('inventory_batches')
            .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
            .orderBy('expiry_date', 'asc')
            .first('id', 'site_id');

      if (!batch) {
        batch = await this.createBatch(trx, siteId, itemId, opts);
      }

      await this.insertLedger(trx, {
        siteId,
        itemId,
        batchId: String(batch.id),
        txnType: 'RECEIPT',
        qty: received.toStorageString(),
        referenceTable: opts?.grnId ? 'goods_receipts' : 'grn',
        referenceId: opts?.grnId,
        referenceNo: idempRef,
        postedBy:
          opts?.receivedBy && UUID_RE.test(opts.receivedBy)
            ? opts.receivedBy
            : undefined,
        note: `GRN requested=${requestedQty}, received=${receivedQty}`,
      });

      const shortfall = requested.sub(received);
      const tolerance = requested.mul(
        (await this.config?.getNumber('grn_shortfall_tolerance_pct')) ?? 0.02,
      );
      let exceptionType: string | undefined;
      if (shortfall.isGreaterThan(tolerance)) {
        exceptionType = 'SUPPLIER_SHORTFALL';
        this.logger.warn(
          `GRN shortfall for ${idempRef}: ${shortfall.toStorageString()}`,
        );
      }
      return {
        success: true,
        receivedQty: received.toStorageString(),
        shortfall: shortfall.toStorageString(),
        exceptionType,
      };
    });
  }

  async transferStock(
    fromSite: string,
    toSite: string,
    itemId: string,
    qty: string,
    idempotencyKey: string,
  ): Promise<{ success: boolean; transferId?: string; shortfall?: string }> {
    if (fromSite === toSite) {
      throw new BadRequestException(
        'Source and destination sites must be different for a transfer',
      );
    }
    return this.knex.transaction(async (trx) => {
      const existing = await trx('stock_transfers')
        .where({ idempotency_key: idempotencyKey })
        .first('id');
      if (existing) return { success: true, transferId: String(existing.id) };

      const requested = Qty.of(qty, 'KG');
      const batches = await trx('inventory_batches')
        .where({ site_id: fromSite, item_id: itemId, status: 'AVAILABLE' })
        .where('qty_available', '>', 0)
        .where(function () {
          this.whereNull('expiry_date').orWhere(
            'expiry_date',
            '>=',
            Clock.todayKolkata(),
          );
        })
        .orderBy('expiry_date', 'asc')
        .forUpdate()
        .select('id', 'qty_available');
      let remaining = requested;
      const allocations: Array<{ batchId: string; qty: Qty }> = [];
      for (const batch of batches) {
        if (remaining.isZero()) break;
        const available = Qty.of(String(batch.qty_available), 'KG');
        const allocated = available.isLessThan(remaining)
          ? available
          : remaining;
        allocations.push({ batchId: String(batch.id), qty: allocated });
        remaining = remaining.sub(allocated);
      }
      if (!remaining.isZero()) {
        return { success: false, shortfall: remaining.toStorageString() };
      }

      const transferId = uuidv4();
      await trx('stock_transfers').insert({
        id: transferId,
        from_site_id: fromSite,
        to_site_id: toSite,
        transfer_no: `TRF-${Clock.nowUtc().getTime()}-${transferId.slice(0, 8)}`,
        status: 'RESERVED',
        idempotency_key: idempotencyKey,
        created_at: Clock.nowUtc(),
        updated_at: Clock.nowUtc(),
      });
      for (const allocation of allocations) {
        await trx('inventory_batches')
          .where({ id: allocation.batchId })
          .update({
            qty_committed: trx.raw('qty_committed + ?', [
              allocation.qty.toNumber(),
            ]),
            updated_at: Clock.nowUtc(),
          });
        await trx('stock_transfer_lines').insert({
          id: uuidv4(),
          transfer_id: transferId,
          item_id: itemId,
          from_batch_id: allocation.batchId,
          requested_qty: allocation.qty.toStorageString(),
          reserved_qty: allocation.qty.toStorageString(),
          uom: 'KG',
          status: 'RESERVED',
          created_at: Clock.nowUtc(),
          updated_at: Clock.nowUtc(),
        });
      }
      return { success: true, transferId };
    });
  }

  async dispatchTransfer(transferId: string): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const transfer = await trx('stock_transfers')
        .where({ id: transferId })
        .forUpdate()
        .first('id', 'status', 'transfer_no');
      if (!transfer || transfer.status !== 'RESERVED') {
        throw new BadRequestException(
          'Only reserved transfers can be dispatched',
        );
      }

      const lines = await trx('stock_transfer_lines')
        .where({ transfer_id: transferId, status: 'RESERVED' })
        .select('id', 'item_id', 'from_batch_id', 'reserved_qty');
      for (const line of lines) {
        const qty = Qty.of(String(line.reserved_qty), 'KG');
        const batch = await trx('inventory_batches')
          .where({ id: line.from_batch_id })
          .forUpdate()
          .first('id', 'site_id');
        if (!batch)
          throw new BadRequestException('Transfer source batch not found');
        await this.insertLedger(trx, {
          siteId: String(batch.site_id),
          itemId: String(line.item_id),
          batchId: String(batch.id),
          txnType: 'TRANSFER_OUT',
          qty: qty.toStorageString(),
          referenceTable: 'stock_transfers',
          referenceId: transferId,
          referenceNo: String(transfer.transfer_no),
          committedDelta: -qty.toNumber(),
        });
        await trx('stock_transfer_lines').where({ id: line.id }).update({
          dispatched_qty: qty.toStorageString(),
          status: 'DISPATCHED',
          updated_at: Clock.nowUtc(),
        });
      }
      await trx('stock_transfers').where({ id: transferId }).update({
        status: 'IN_TRANSIT',
        dispatched_at: Clock.nowUtc(),
        updated_at: Clock.nowUtc(),
      });
    });
  }

  async receiveTransfer(
    transferId: string,
    receivedLines?: Array<{
      lineId: string;
      receivedQty: string;
      varianceReason?: string;
    }>,
    receivedByUserId?: string,
  ): Promise<{ varianceQty: string }> {
    let varianceQty = Qty.zero('KG');
    await this.knex.transaction(async (trx) => {
      const transfer = await trx('stock_transfers')
        .where({ id: transferId })
        .forUpdate()
        .first('id', 'status', 'to_site_id', 'transfer_no');
      if (!transfer || transfer.status !== 'IN_TRANSIT') {
        throw new BadRequestException(
          'Only in-transit transfers can be received',
        );
      }

      const lines = await trx('stock_transfer_lines')
        .where({ transfer_id: transferId, status: 'DISPATCHED' })
        .select('id', 'item_id', 'from_batch_id', 'dispatched_qty');
      let totalVariance = Qty.zero('KG');
      const destLoc = await trx('locations')
        .where({ site_id: transfer.to_site_id })
        .first('id');
      for (const line of lines) {
        const receivedLine = receivedLines?.find(
          (candidate) => candidate.lineId === String(line.id),
        );
        const dispatchedQty = Qty.of(String(line.dispatched_qty), 'KG');
        const qty = receivedLine
          ? Qty.of(receivedLine.receivedQty, 'KG')
          : dispatchedQty;
        if (qty.isGreaterThan(dispatchedQty)) {
          throw new BadRequestException(
            'Received quantity cannot exceed dispatched quantity',
          );
        }
        totalVariance = totalVariance.add(dispatchedQty.sub(qty));
        const srcBatch = line.from_batch_id
          ? await trx('inventory_batches')
              .where({ id: line.from_batch_id })
              .first('mfg_date', 'expiry_date', 'landed_cost_per_unit')
          : null;
        const batch = await this.createBatch(
          trx,
          String(transfer.to_site_id),
          String(line.item_id),
          {
            locationId: destLoc?.id ? String(destLoc.id) : undefined,
            mfgDate: srcBatch?.mfg_date ?? undefined,
            expiryDate: srcBatch?.expiry_date ?? undefined,
            landedCostPerUnit: srcBatch?.landed_cost_per_unit
              ? String(srcBatch.landed_cost_per_unit)
              : undefined,
            receivedBy: receivedByUserId,
          },
        );
        await this.insertLedger(trx, {
          siteId: String(transfer.to_site_id),
          itemId: String(line.item_id),
          batchId: batch.id,
          txnType: 'TRANSFER_IN',
          qty: qty.toStorageString(),
          referenceTable: 'stock_transfers',
          referenceId: transferId,
          referenceNo: String(transfer.transfer_no),
        });
        await trx('stock_transfer_lines')
          .where({ id: line.id })
          .update({
            to_batch_id: batch.id,
            received_qty: qty.toStorageString(),
            status: 'RECEIVED',
            note: receivedLine?.varianceReason ?? null,
            updated_at: Clock.nowUtc(),
          });
      }
      await trx('stock_transfers')
        .where({ id: transferId })
        .update({
          status: 'RECEIVED',
          received_at: Clock.nowUtc(),
          variance_qty: totalVariance.toStorageString(),
          variance_reason: totalVariance.isZero()
            ? null
            : 'Short receipt recorded at receiving',
          updated_at: Clock.nowUtc(),
        });
      varianceQty = totalVariance;
    });
    if (!varianceQty.isZero() && this.exceptionPort) {
      const transfer = await this.knex('stock_transfers')
        .where({ id: transferId })
        .first('from_site_id', 'requested_by', 'created_by');
      const actorId =
        (receivedByUserId && UUID_RE.test(receivedByUserId)
          ? receivedByUserId
          : undefined) ||
        (transfer?.requested_by && UUID_RE.test(String(transfer.requested_by))
          ? String(transfer.requested_by)
          : undefined) ||
        (transfer?.created_by && UUID_RE.test(String(transfer.created_by))
          ? String(transfer.created_by)
          : undefined) ||
        '00000000-0000-0000-0000-000000000000';
      await this.exceptionPort.raise(
        'STOCK_VARIANCE',
        'stock_transfers',
        transferId,
        actorId,
        {
          title: 'Stock transfer variance',
          summary: `Transfer ${transferId} was received short`,
          facts: [
            {
              label: 'Variance quantity',
              value: varianceQty.toStorageString(),
            },
          ],
          impact: 'Received stock is lower than dispatched stock.',
          actions: [
            { code: 'APPROVE', label: 'Approve variance' },
            { code: 'REJECT', label: 'Reject variance' },
          ],
        },
        transfer ? String(transfer.from_site_id) : undefined,
      );
    }
    return { varianceQty: varianceQty.toStorageString() };
  }

  async completeTransfer(transferId: string): Promise<void> {
    const updated = await this.knex('stock_transfers')
      .where({ id: transferId, status: 'RECEIVED' })
      .update({
        status: 'COMPLETED',
        completed_at: Clock.nowUtc(),
        updated_at: Clock.nowUtc(),
      });
    if (updated === 0)
      throw new BadRequestException('Only received transfers can be completed');
    await this.knex('stock_transfer_lines')
      .where({ transfer_id: transferId, status: 'RECEIVED' })
      .update({ status: 'COMPLETED', updated_at: Clock.nowUtc() });
  }

  async resolveTransferVariance(
    transferId: string,
    action: 'APPROVED' | 'REJECTED',
    remarks: string,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const transfer = await trx('stock_transfers')
        .where({ id: transferId })
        .forUpdate()
        .first('id', 'status', 'variance_qty', 'to_site_id');
      if (!transfer) throw new BadRequestException('Transfer not found');
      if (Qty.of(String(transfer.variance_qty), 'KG').isZero()) return;
      if (!['RECEIVED', 'COMPLETED'].includes(String(transfer.status))) {
        throw new BadRequestException('Transfer variance is not receivable');
      }

      const marker = `VARIANCE_${action}:`;
      if (String(transfer.variance_reason ?? '').startsWith(marker)) return;

      if (action === 'REJECTED') {
        const lines = await trx('stock_transfer_lines')
          .where({ transfer_id: transferId })
          .where('received_qty', '>', 0)
          .select('item_id', 'to_batch_id', 'received_qty');
        for (const line of lines) {
          await this.insertLedger(trx, {
            siteId: String(transfer.to_site_id),
            itemId: String(line.item_id),
            batchId: line.to_batch_id ? String(line.to_batch_id) : undefined,
            txnType: 'ADJUSTMENT',
            qty: String(line.received_qty),
            referenceTable: 'stock_transfers',
            referenceId: transferId,
            referenceNo: `VAR-${transferId.slice(0, 8)}`,
            note: 'Rejected stock transfer variance',
          });
        }
        await trx('stock_transfers')
          .where({ id: transferId })
          .update({
            status: 'CANCELLED',
            cancelled_at: Clock.nowUtc(),
            variance_reason: `${marker}${remarks}`,
            updated_at: Clock.nowUtc(),
          });
      } else {
        await trx('stock_transfers')
          .where({ id: transferId })
          .update({
            status: 'COMPLETED',
            completed_at: Clock.nowUtc(),
            variance_reason: `${marker}${remarks}`,
            updated_at: Clock.nowUtc(),
          });
        await trx('stock_transfer_lines')
          .where({ transfer_id: transferId, status: 'RECEIVED' })
          .update({ status: 'COMPLETED', updated_at: Clock.nowUtc() });
      }
    });
  }

  async cancelTransfer(transferId: string): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const transfer = await trx('stock_transfers')
        .where({ id: transferId })
        .forUpdate()
        .first('id', 'status');
      if (
        !transfer ||
        !['REQUESTED', 'RESERVED'].includes(String(transfer.status))
      ) {
        throw new BadRequestException(
          'Only requested or reserved transfers can be cancelled',
        );
      }
      if (transfer.status === 'RESERVED') {
        const lines = await trx('stock_transfer_lines')
          .where({ transfer_id: transferId, status: 'RESERVED' })
          .select('from_batch_id', 'reserved_qty');
        for (const line of lines) {
          await trx('inventory_batches')
            .where({ id: line.from_batch_id })
            .update({
              qty_committed: trx.raw('GREATEST(0, qty_committed - ?)', [
                Number(line.reserved_qty),
              ]),
              updated_at: Clock.nowUtc(),
            });
        }
      }
      await trx('stock_transfers').where({ id: transferId }).update({
        status: 'CANCELLED',
        cancelled_at: Clock.nowUtc(),
        updated_at: Clock.nowUtc(),
      });
    });
  }

  async postOpeningStock(
    siteId: string,
    lines: Array<{
      itemId: string;
      qty: string;
      unitCost?: string;
      batchNumber?: string;
      mfgDate?: string;
      expiryDate?: string;
      uom?: string;
    }>,
    postedBy: string,
    locationId?: string,
    notes?: string,
  ): Promise<{ postedCount: number; batches: Array<{ itemId: string; batchId: string; batchNumber: string; qty: string }> }> {
    if (!this.isUuid(siteId)) {
      throw new BadRequestException('Valid siteId UUID is required');
    }
    return this.knex.transaction(async (trx) => {
      const targetLoc =
        locationId && this.isUuid(locationId)
          ? locationId
          : (await trx('locations').where({ site_id: siteId }).first('id'))?.id;

      const createdBatches: Array<{ itemId: string; batchId: string; batchNumber: string; qty: string }> = [];
      for (const line of lines) {
        const qtyObj = Qty.of(line.qty, line.uom ?? 'KG');
        const item = await trx('items')
          .where({ id: line.itemId })
          .first('id', 'primary_uom', 'shelf_life_days');
        if (!item) {
          throw new BadRequestException(`Item ${line.itemId} not found`);
        }
        const batchNo =
          line.batchNumber?.trim() ||
          `OPN-${Clock.todayKolkata().replace(/-/g, '')}-${uuidv4().slice(0, 6).toUpperCase()}`;

        let batch = await trx('inventory_batches')
          .where({ site_id: siteId, item_id: line.itemId, batch_number: batchNo })
          .first('id', 'site_id', 'batch_number');
        if (!batch) {
          const defaultExp =
            !line.expiryDate && item.shelf_life_days
              ? new Date(Date.now() + Number(item.shelf_life_days) * 86400000)
                  .toISOString()
                  .slice(0, 10)
              : line.expiryDate;
          const b = await this.createBatch(trx, siteId, line.itemId, {
            locationId: targetLoc ? String(targetLoc) : undefined,
            batchLotNo: batchNo,
            mfgDate: line.mfgDate ?? Clock.todayKolkata(),
            expiryDate: defaultExp,
            landedCostPerUnit: line.unitCost ?? '0.00',
            receivedBy: postedBy,
          });
          batch = { id: b.id, site_id: siteId, batch_number: batchNo };
        }

        await this.insertLedger(trx, {
          siteId,
          itemId: line.itemId,
          batchId: String(batch.id),
          txnType: 'OPENING_STOCK',
          qty: qtyObj.toStorageString(),
          referenceTable: 'inventory_batches',
          referenceId: String(batch.id),
          referenceNo: batchNo,
          postedBy: this.isUuid(postedBy) ? postedBy : undefined,
          note: notes || 'Opening Stock Load',
        });

        createdBatches.push({
          itemId: line.itemId,
          batchId: String(batch.id),
          batchNumber: String(batch.batch_number),
          qty: qtyObj.toStorageString(),
        });
      }
      return { postedCount: createdBatches.length, batches: createdBatches };
    });
  }

  async createAdjustment(
    siteId: string,
    itemId: string,
    adjustmentType:
      | 'WRITEOFF'
      | 'SHRINKAGE'
      | 'COUNT_SURPLUS'
      | 'FOUND'
      | 'OPENING_STOCK'
      | 'EXPIRY_REMOVAL',
    qty: string,
    remarks: string,
    requestedBy: string,
    batchId?: string,
  ): Promise<{ success: boolean; approvedBy: string }> {
    const isPositive = ['COUNT_SURPLUS', 'FOUND', 'OPENING_STOCK'].includes(
      adjustmentType,
    );
    return this.knex.transaction(async (trx) => {
      const availableRow = await trx('inventory_batches')
        .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
        .sum('qty_available as total')
        .first();
      const available = Qty.of(String(availableRow?.total ?? '0'), 'KG');
      const adjustment = Qty.of(qty, 'KG');
      if (!isPositive && available.isLessThan(adjustment)) {
        return { success: false, approvedBy: '' };
      }
      const threshold =
        (await this.config?.getNumber('adjustment_variance_threshold_pct')) ??
        5;
      const variancePct = available.isZero()
        ? isPositive
          ? 0
          : 100
        : (adjustment.toNumber() / available.toNumber()) * 100;
      const autoApprove = isPositive || variancePct <= threshold;
      const adjustmentId = uuidv4();
      const adjustmentNo = `ADJ-${Clock.nowUtc().getTime()}-${adjustmentId.slice(0, 8)}`;
      await trx('stock_adjustments').insert({
        id: adjustmentId,
        site_id: siteId,
        item_id: itemId,
        batch_id: batchId && this.isUuid(batchId) ? batchId : null,
        adjustment_no: adjustmentNo,
        adjustment_type: adjustmentType,
        qty: adjustment.toStorageString(),
        uom: 'KG',
        variance_pct: Math.min(9999999, variancePct).toFixed(2),
        reason: remarks,
        status: autoApprove ? 'APPROVED' : 'PENDING',
        requested_by: requestedBy,
        requested_at: Clock.nowUtc(),
        approved_by: autoApprove ? requestedBy : null,
        approved_at: autoApprove ? Clock.nowUtc() : null,
        created_at: Clock.nowUtc(),
        updated_at: Clock.nowUtc(),
      });
      if (autoApprove) {
        await this.postAdjustmentInTransaction(
          trx,
          adjustmentId,
          siteId,
          itemId,
          adjustment,
          adjustmentType,
          adjustmentNo,
          requestedBy,
          remarks,
          batchId,
        );
      }
      return { success: true, approvedBy: autoApprove ? requestedBy : '' };
    });
  }

  async approveAdjustment(
    adjustmentId: string,
    approvedBy: string,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const adjustment = await trx('stock_adjustments')
        .where({ id: adjustmentId, status: 'PENDING' })
        .forUpdate()
        .first();
      if (!adjustment)
        throw new BadRequestException('Pending adjustment not found');
      await trx('stock_adjustments').where({ id: adjustmentId }).update({
        status: 'APPROVED',
        approved_by: approvedBy,
        approved_at: Clock.nowUtc(),
        updated_at: Clock.nowUtc(),
      });
      await this.postAdjustmentInTransaction(
        trx,
        adjustmentId,
        String(adjustment.site_id),
        String(adjustment.item_id),
        Qty.of(String(adjustment.qty), 'KG'),
        String(adjustment.adjustment_type),
        String(adjustment.adjustment_no),
        approvedBy,
        String(adjustment.reason),
        adjustment.batch_id ? String(adjustment.batch_id) : undefined,
      );
    });
  }

  async rejectAdjustment(
    adjustmentId: string,
    rejectedBy: string,
    rejectionReason: string,
  ): Promise<void> {
    const updated = await this.knex('stock_adjustments')
      .where({ id: adjustmentId, status: 'PENDING' })
      .update({
        status: 'REJECTED',
        rejected_by: rejectedBy,
        rejected_at: Clock.nowUtc(),
        rejection_reason: rejectionReason,
        updated_at: Clock.nowUtc(),
      });
    if (updated === 0)
      throw new BadRequestException('Pending adjustment not found');
  }

  async checkExpiryDrift(siteId: string) {
    return this.knex('inventory_batches')
      .leftJoin(
        'stock_reservations',
        'stock_reservations.batch_id',
        'inventory_batches.id',
      )
      .where({
        'inventory_batches.site_id': siteId,
        'inventory_batches.status': 'AVAILABLE',
      })
      .whereNotNull('inventory_batches.expiry_date')
      .where('inventory_batches.expiry_date', '<', Clock.todayKolkata())
      .select(
        'inventory_batches.item_id as itemId',
        'inventory_batches.id as batchId',
        'inventory_batches.batch_number as batchNumber',
        'inventory_batches.expiry_date as expiryDate',
        this.knex.raw(
          'GREATEST(CURRENT_DATE - inventory_batches.expiry_date, 0) as "daysDrifted"',
        ),
        this.knex.raw(
          `COALESCE(
             SUM(
               CASE WHEN stock_reservations.status = 'ACTIVE'
               THEN stock_reservations.qty ELSE 0 END
             ),
             0
           ) as "reservedQty"`,
        ),
      )
      .groupBy(
        'inventory_batches.item_id',
        'inventory_batches.id',
        'inventory_batches.batch_number',
        'inventory_batches.expiry_date',
      );
  }

  async releaseExpiredReservations(): Promise<number> {
    const reservations = await this.knex('stock_reservations')
      .where('status', 'ACTIVE')
      .whereNotNull('expires_at')
      .where('expires_at', '<', Clock.nowUtc())
      .select('id');
    for (const reservation of reservations) {
      await this.releaseReservation(
        String(reservation.id),
        `expiry:${reservation.id}`,
      );
    }
    return reservations.length;
  }

  private async createBatch(
    trx: Knex.Transaction,
    siteId: string,
    itemId: string,
    opts?: {
      locationId?: string;
      batchLotNo?: string;
      mfgDate?: string | Date;
      expiryDate?: string | Date;
      landedCostPerUnit?: string;
      receivedBy?: string;
    },
  ) {
    const id = uuidv4();
    await trx('inventory_batches').insert({
      id,
      site_id: siteId,
      item_id: itemId,
      location_id:
        opts?.locationId && UUID_RE.test(opts.locationId)
          ? opts.locationId
          : null,
      batch_number: opts?.batchLotNo || `GRN-${Clock.nowUtc().getTime()}-${id.slice(0, 8)}`,
      status: 'AVAILABLE',
      qty_on_hand: '0.000',
      qty_committed: '0.000',
      mfg_date: opts?.mfgDate ?? null,
      expiry_date: opts?.expiryDate ?? null,
      received_date: Clock.todayKolkata(),
      landed_cost_per_unit: opts?.landedCostPerUnit ?? '0.00',
      created_by:
        opts?.receivedBy && UUID_RE.test(opts.receivedBy)
          ? opts.receivedBy
          : null,
      updated_by:
        opts?.receivedBy && UUID_RE.test(opts.receivedBy)
          ? opts.receivedBy
          : null,
      created_at: Clock.nowUtc(),
      updated_at: Clock.nowUtc(),
    });
    return { id, site_id: siteId };
  }

  private async postAdjustmentInTransaction(
    trx: Knex.Transaction,
    adjustmentId: string,
    siteId: string,
    itemId: string,
    qty: Qty,
    adjustmentType: string,
    adjustmentNo: string,
    postedBy: string,
    reason: string,
    batchId?: string,
  ): Promise<void> {
    const isPositive = ['COUNT_SURPLUS', 'FOUND', 'OPENING_STOCK'].includes(
      adjustmentType,
    );
    if (isPositive) {
      let targetBatchId =
        batchId && this.isUuid(batchId) ? batchId : undefined;
      if (!targetBatchId) {
        const existingBatch = await trx('inventory_batches')
          .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
          .orderBy('expiry_date', 'asc')
          .first('id');
        if (existingBatch) {
          targetBatchId = String(existingBatch.id);
        } else {
          const defaultLoc = await trx('locations')
            .where({ site_id: siteId })
            .first('id');
          const created = await this.createBatch(trx, siteId, itemId, {
            locationId: defaultLoc?.id ? String(defaultLoc.id) : undefined,
            batchLotNo: `ADJ-${Clock.todayKolkata().replace(/-/g, '')}-${adjustmentId.slice(0, 6).toUpperCase()}`,
            receivedBy: postedBy,
          });
          targetBatchId = created.id;
        }
      }
      await this.insertLedger(trx, {
        siteId,
        itemId,
        batchId: targetBatchId,
        txnType: adjustmentType,
        qty: qty.toStorageString(),
        referenceTable: 'stock_adjustments',
        referenceId: adjustmentId,
        referenceNo: adjustmentNo,
        postedBy,
        note: reason,
      });
      await trx('stock_adjustments')
        .where({ id: adjustmentId })
        .update({ status: 'APPROVED', batch_id: targetBatchId, updated_at: Clock.nowUtc() });
      return;
    }

    let remaining = qty;
    const batchQuery = trx('inventory_batches')
      .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
      .where('qty_available', '>', 0);
    if (batchId && this.isUuid(batchId)) {
      batchQuery.orderByRaw('CASE WHEN id = ? THEN 0 ELSE 1 END, expiry_date ASC', [batchId]);
    } else {
      batchQuery.orderBy('expiry_date', 'asc');
    }
    const batches = await batchQuery.forUpdate().select('id', 'qty_available');
    for (const batch of batches) {
      if (remaining.isZero()) break;
      const available = Qty.of(String(batch.qty_available), 'KG');
      const deducted = available.isLessThan(remaining) ? available : remaining;
      await this.insertLedger(trx, {
        siteId,
        itemId,
        batchId: String(batch.id),
        txnType: adjustmentType,
        qty: deducted.toStorageString(),
        referenceTable: 'stock_adjustments',
        referenceId: adjustmentId,
        referenceNo: adjustmentNo,
        postedBy,
        note: reason,
      });
      remaining = remaining.sub(deducted);
    }
    if (!remaining.isZero()) {
      throw new BadRequestException('Adjustment exceeds available stock');
    }
    await trx('stock_adjustments')
      .where({ id: adjustmentId })
      .update({ status: 'APPROVED', updated_at: Clock.nowUtc() });
  }

  private reversalOnHandDelta(txnType: string, qty: number): number {
    if (['RECEIPT', 'RETURN', 'TRANSFER_IN', 'PROD_OUTPUT'].includes(txnType)) {
      return -qty;
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
      ].includes(txnType)
    ) {
      return qty;
    }
    return 0;
  }

  private async insertLedger(
    trx: Knex.Transaction,
    entry: LedgerPostEntry,
  ): Promise<string> {
    return (this.ledgerPosting ?? new LedgerPostingService()).post(trx, entry);
  }

  async listTransfers(siteId?: string, status?: string) {
    let query = this.knex('stock_transfers as st')
      .leftJoin('sites as fs', 'st.from_site_id', 'fs.id')
      .leftJoin('sites as ts', 'st.to_site_id', 'ts.id')
      .select(
        'st.*',
        'fs.name as from_site_name',
        'ts.name as to_site_name',
      );
    if (this.isUuid(siteId)) {
      query = query.where((q) =>
        q.where('st.from_site_id', siteId).orWhere('st.to_site_id', siteId),
      );
    }
    if (status) query = query.where('st.status', status);
    const transfers = await query.orderBy('st.created_at', 'desc');
    if (transfers.length === 0) return [];

    const transferIds = transfers.map((t: any) => t.id);
    const lines = await this.knex('stock_transfer_lines as stl')
      .leftJoin('items as i', 'stl.item_id', 'i.id')
      .whereIn('stl.transfer_id', transferIds)
      .select('stl.*', 'i.name as item_name', 'i.sku_code');

    const linesByTransfer = new Map<string, any[]>();
    for (const l of lines) {
      const key = String(l.transfer_id);
      if (!linesByTransfer.has(key)) linesByTransfer.set(key, []);
      linesByTransfer.get(key)!.push(l);
    }

    return transfers.map((t: any) => {
      const tLines = linesByTransfer.get(String(t.id)) || [];
      return {
        ...t,
        lines: tLines,
        item_name: tLines[0]?.item_name ?? null,
        sku_code: tLines[0]?.sku_code ?? null,
        requested_qty: tLines[0]?.requested_qty ?? null,
      };
    });
  }

  async listAdjustments(siteId?: string, status?: string) {
    let query = this.knex('stock_adjustments as sa')
      .leftJoin('sites as s', 'sa.site_id', 's.id')
      .leftJoin('items as i', 'sa.item_id', 'i.id')
      .leftJoin('inventory_batches as ib', 'sa.batch_id', 'ib.id')
      .leftJoin('users as u', 'sa.requested_by', 'u.id')
      .select(
        'sa.*',
        's.name as site_name',
        'i.name as item_name',
        'i.sku_code',
        'ib.batch_number as batch_no',
        'ib.landed_cost_per_unit as unit_cost',
        'u.full_name as requested_by_name',
      );
    if (this.isUuid(siteId)) query = query.where('sa.site_id', siteId);
    if (status) query = query.where('sa.status', status);
    return query.orderBy('sa.created_at', 'desc');
  }

  async listReservations(siteId?: string, itemId?: string) {
    let query = this.knex('stock_reservations as sr')
      .leftJoin('sites as s', 'sr.site_id', 's.id')
      .leftJoin('items as i', 'sr.item_id', 'i.id')
      .leftJoin('inventory_batches as ib', 'sr.batch_id', 'ib.id')
      .leftJoin('sales_order_lines as sol', 'sr.order_id', 'sol.id')
      .leftJoin('sales_orders as so', function () {
        this.on('so.id', '=', 'sol.order_id').orOn('so.id', '=', 'sr.order_id');
      })
      .leftJoin('customers as c', 'so.customer_id', 'c.id')
      .select(
        'sr.*',
        's.name as site_name',
        'i.name as item_name',
        'i.sku_code',
        'ib.batch_number',
        'so.order_no',
        'c.business_name as customer_name',
      );
    if (this.isUuid(siteId)) query = query.where('sr.site_id', siteId);
    if (this.isUuid(itemId)) query = query.where('sr.item_id', itemId);
    return query.orderBy('sr.created_at', 'desc');
  }

  async getStockProjection(itemId?: string, siteId?: string) {
    const stockQuery = this.knex('inventory_batches').where('status', 'AVAILABLE');
    if (this.isUuid(itemId)) stockQuery.where('item_id', itemId);
    if (this.isUuid(siteId)) stockQuery.where('site_id', siteId);
    const stockAgg = await stockQuery
      .select(
        this.knex.raw('COALESCE(SUM(qty_on_hand), 0) as on_hand'),
        this.knex.raw('COALESCE(SUM(qty_committed), 0) as reserved'),
      )
      .first();

    const poQuery = this.knex('purchase_order_lines as pol')
      .join('purchase_orders as po', 'pol.po_id', 'po.id')
      .whereIn('po.po_status', [
        'ISSUED',
        'PARTIALLY_RECEIVED',
        'PENDING_APPROVAL',
      ]);
    if (this.isUuid(itemId)) poQuery.where('pol.item_id', itemId);
    if (this.isUuid(siteId)) poQuery.where('po.receiving_site_id', siteId);
    const poAgg = await poQuery
      .select(
        this.knex.raw(
          'COALESCE(SUM(GREATEST(pol.ordered_qty - COALESCE(pol.received_qty, 0), 0)), 0) as incoming_po',
        ),
      )
      .first();

    const woQuery = this.knex('production_work_orders as wo')
      .join('bom_headers as bh', 'wo.bom_header_id', 'bh.id')
      .whereIn('wo.status', ['PLANNED', 'IN_PROGRESS']);
    if (this.isUuid(itemId)) woQuery.where('bh.item_id', itemId);
    if (this.isUuid(siteId)) woQuery.where('wo.site_id', siteId);
    const woAgg = await woQuery
      .select(
        this.knex.raw('COALESCE(SUM(wo.planned_qty), 0) as planned_wo'),
      )
      .first();

    const onHand = Number(stockAgg?.on_hand ?? 0);
    const reserved = Number(stockAgg?.reserved ?? 0);
    const incomingPo = Number(poAgg?.incoming_po ?? 0);
    const plannedWo = Number(woAgg?.planned_wo ?? 0);
    const projected = onHand - reserved + incomingPo + plannedWo;

    return {
      itemId: itemId ?? null,
      siteId: siteId ?? null,
      onHandQty: String(onHand),
      reservedQty: String(reserved),
      incomingPoQty: String(incomingPo),
      plannedWoQty: String(plannedWo),
      projectedAvailableQty: String(projected),
    };
  }

  /**
   * Create a physical stock count sheet (G-INV-3)
   */
  async createStockCount(
    siteId: string,
    locationId: string | undefined,
    notes: string | undefined,
    items: Array<{ itemId: string; batchNo?: string; systemQty?: string; countedQty: string }>,
    userId: string,
  ) {
    const countNo = `CNT-${Date.now().toString(36).toUpperCase()}`;
    const [sheet] = await this.knex('stock_count_sheets')
      .insert({
        site_id: siteId,
        location_id: locationId || null,
        count_no: countNo,
        status: 'DRAFT',
        notes: notes || null,
        created_by: userId,
      })
      .returning('*');

    const linesToInsert = items.map((it) => {
      const sys = Number(it.systemQty ?? 0);
      const counted = Number(it.countedQty ?? 0);
      return {
        count_sheet_id: sheet.id,
        item_id: it.itemId,
        batch_no: it.batchNo || null,
        system_qty: sys,
        counted_qty: counted,
        variance_qty: counted - sys,
      };
    });

    let insertedLines: any[] = [];
    if (linesToInsert.length > 0) {
      insertedLines = await this.knex('stock_count_items')
        .insert(linesToInsert)
        .returning('*');
    }

    return { ...sheet, items: insertedLines };
  }

  async listStockCounts(siteId?: string, status?: string) {
    let query = this.knex('stock_count_sheets as scs')
      .leftJoin('sites as s', 'scs.site_id', 's.id')
      .leftJoin('users as u', 'scs.created_by', 'u.id')
      .select('scs.*', 's.name as site_name', 'u.full_name as creator_name');

    if (this.isUuid(siteId)) query = query.where('scs.site_id', siteId);
    if (status) query = query.where('scs.status', status);

    const sheets = await query.orderBy('scs.created_at', 'desc');
    if (sheets.length === 0) return [];

    const sheetIds = sheets.map((s: any) => s.id);
    const items = await this.knex('stock_count_items as sci')
      .leftJoin('items as i', 'sci.item_id', 'i.id')
      .whereIn('sci.count_sheet_id', sheetIds)
      .select('sci.*', 'i.name as item_name', 'i.sku_code', 'i.primary_uom');

    const bySheet = new Map<string, any[]>();
    for (const it of items) {
      const k = String(it.count_sheet_id);
      if (!bySheet.has(k)) bySheet.set(k, []);
      bySheet.get(k)!.push(it);
    }

    return sheets.map((s: any) => ({
      ...s,
      items: bySheet.get(String(s.id)) ?? [],
    }));
  }

  async getStockCountById(id: string) {
    const sheet = await this.knex('stock_count_sheets as scs')
      .leftJoin('sites as s', 'scs.site_id', 's.id')
      .leftJoin('users as u', 'scs.created_by', 'u.id')
      .where('scs.id', id)
      .select('scs.*', 's.name as site_name', 'u.full_name as creator_name')
      .first();

    if (!sheet) throw new BadRequestException(`Stock count sheet ${id} not found`);

    const items = await this.knex('stock_count_items as sci')
      .leftJoin('items as i', 'sci.item_id', 'i.id')
      .where('sci.count_sheet_id', id)
      .select('sci.*', 'i.name as item_name', 'i.sku_code', 'i.primary_uom');

    return { ...sheet, items };
  }

  async updateStockCountLines(
    id: string,
    items: Array<{ itemId: string; batchNo?: string; countedQty: string }>,
  ) {
    return this.knex.transaction(async (trx) => {
      const sheet = await trx('stock_count_sheets')
        .where({ id })
        .forUpdate()
        .first();
      if (!sheet) {
        throw new BadRequestException(`Stock count sheet ${id} not found`);
      }
      if (sheet.status !== 'DRAFT') {
        throw new BadRequestException(`Stock count sheet is already ${sheet.status}`);
      }
      const existingLines = await trx('stock_count_items')
        .where({ count_sheet_id: id })
        .select('*');

      for (const it of items) {
        const match = existingLines.find(
          (l: any) =>
            String(l.item_id) === it.itemId &&
            (!it.batchNo || String(l.batch_no ?? '') === it.batchNo),
        );
        const counted = Number(it.countedQty ?? 0);
        if (match) {
          const sys = Number(match.system_qty ?? 0);
          await trx('stock_count_items')
            .where({ id: match.id })
            .update({
              counted_qty: counted,
              variance_qty: counted - sys,
            });
        } else {
          await trx('stock_count_items').insert({
            count_sheet_id: id,
            item_id: it.itemId,
            batch_no: it.batchNo || null,
            system_qty: 0,
            counted_qty: counted,
            variance_qty: counted,
          });
        }
      }
      return this.getStockCountById(id);
    });
  }

  async approveStockCount(id: string, userId: string) {
    return this.knex.transaction(async (trx) => {
      const sheet = await trx('stock_count_sheets as scs')
        .where('scs.id', id)
        .forUpdate()
        .first();
      if (!sheet) {
        throw new BadRequestException(`Stock count sheet ${id} not found`);
      }
      if (sheet.status !== 'DRAFT') {
        throw new BadRequestException(`Stock count sheet is already ${sheet.status}`);
      }

      const items = await trx('stock_count_items as sci')
        .leftJoin('items as i', 'sci.item_id', 'i.id')
        .where('sci.count_sheet_id', id)
        .select('sci.*', 'i.primary_uom');

      // For items with non-zero variance, record adjustment and post ledger movements
      for (const item of items) {
        const variance = Number(item.variance_qty);
        if (variance === 0) continue;

        const sysQty = Number(item.system_qty || 0);
        const variancePct =
          sysQty > 0 ? Number(((variance / sysQty) * 100).toFixed(2)) : null;
        const adjustmentNo = `ADJ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const absQty = Qty.of(String(Math.abs(variance)), 'KG');
        const reason = `Count variance on sheet ${sheet.count_no}`;

        const [adj] = await trx('stock_adjustments')
          .insert({
            site_id: sheet.site_id,
            item_id: item.item_id,
            adjustment_no: adjustmentNo,
            adjustment_type: variance > 0 ? 'COUNT_SURPLUS' : 'COUNT_DEFICIT',
            qty: absQty.toStorageString(),
            uom: item.primary_uom || 'KG',
            variance_pct: variancePct,
            reason,
            status: 'APPROVED',
            requested_by: sheet.created_by,
            approved_by: userId,
            approved_at: new Date(),
          })
          .returning('id');

        const adjId = String(adj?.id ?? uuidv4());

        if (variance > 0) {
          let batch = item.batch_no
            ? await trx('inventory_batches')
                .where({
                  site_id: sheet.site_id,
                  item_id: item.item_id,
                  batch_number: item.batch_no,
                })
                .first('id', 'site_id')
            : await trx('inventory_batches')
                .where({
                  site_id: sheet.site_id,
                  item_id: item.item_id,
                  status: 'AVAILABLE',
                })
                .orderBy('expiry_date', 'asc')
                .first('id', 'site_id');
          if (!batch) {
            batch = await this.createBatch(
              trx,
              String(sheet.site_id),
              String(item.item_id),
              {
                batchLotNo: item.batch_no || undefined,
                receivedBy: userId,
              },
            );
          }
          await this.insertLedger(trx, {
            siteId: String(sheet.site_id),
            itemId: String(item.item_id),
            batchId: String(batch.id),
            txnType: 'COUNT_SURPLUS',
            qty: absQty.toStorageString(),
            referenceTable: 'stock_adjustments',
            referenceId: adjId,
            referenceNo: adjustmentNo,
            postedBy: userId,
            note: reason,
          });
        } else {
          let remaining = absQty;
          const batches = await trx('inventory_batches')
            .where({
              site_id: sheet.site_id,
              item_id: item.item_id,
              status: 'AVAILABLE',
            })
            .where('qty_available', '>', 0)
            .orderBy('expiry_date', 'asc')
            .forUpdate()
            .select('id', 'qty_available');
          for (const batch of batches) {
            if (remaining.isZero()) break;
            const available = Qty.of(String(batch.qty_available), 'KG');
            const deducted = available.isLessThan(remaining)
              ? available
              : remaining;
            await this.insertLedger(trx, {
              siteId: String(sheet.site_id),
              itemId: String(item.item_id),
              batchId: String(batch.id),
              txnType: 'ADJUSTMENT',
              qty: deducted.toStorageString(),
              referenceTable: 'stock_adjustments',
              referenceId: adjId,
              referenceNo: adjustmentNo,
              postedBy: userId,
              note: reason,
            });
            remaining = remaining.sub(deducted);
          }
          if (!remaining.isZero()) {
            throw new BadRequestException(
              `Insufficient available stock for deficit on item ${item.item_id}`,
            );
          }
        }
      }

      await trx('stock_count_sheets')
        .where('id', id)
        .update({
          status: 'APPROVED',
          approved_by: userId,
          approved_at: new Date(),
        });

      return { success: true, status: 'APPROVED' };
    });
  }
}
