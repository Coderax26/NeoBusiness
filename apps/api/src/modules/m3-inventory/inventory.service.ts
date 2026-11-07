import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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

  async listStock(
    siteId: string,
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
    }>
  > {
    const query = this.knex('inventory_batches')
      .where('site_id', siteId)
      .select(
        'id as batchId',
        'item_id as itemId',
        'site_id as siteId',
        'location_id as locationId',
        'batch_number as batchNumber',
        'status',
        'qty_on_hand as qtyOnHand',
        'qty_committed as qtyCommitted',
        'qty_available as qtyAvailable',
        'expiry_date as expiryDate',
      )
      .orderBy([{ column: 'expiry_date', order: 'asc', nulls: 'last' }]);
    if (locationId) query.where('location_id', locationId);
    if (itemId) query.where('item_id', itemId);
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
    const query = this.knex('stock_ledger_txns')
      .select(
        'id',
        'site_id as siteId',
        'item_id as itemId',
        'batch_id as batchId',
        'txn_type as txnType',
        'qty',
        'uom',
        'reference_table as referenceTable',
        'reference_id as referenceId',
        'reference_no as referenceNo',
        'posted_at as postedAt',
        'note',
      )
      .orderBy('posted_at', 'desc')
      .limit(500);
    if (filters.siteId) query.where('site_id', filters.siteId);
    if (filters.itemId) query.where('item_id', filters.itemId);
    if (filters.batchId) query.where('batch_id', filters.batchId);
    if (filters.from) query.where('posted_at', '>=', filters.from);
    if (filters.to) query.where('posted_at', '<=', filters.to);
    return query;
  }

  async listExpiryWatchlist(siteId: string, days = 30): Promise<unknown[]> {
    const horizon = new Date(Clock.nowUtc());
    horizon.setUTCDate(horizon.getUTCDate() + days);
    return this.knex('inventory_batches')
      .where({ site_id: siteId, status: 'AVAILABLE' })
      .whereNotNull('expiry_date')
      .where('expiry_date', '<=', horizon.toISOString().slice(0, 10))
      .select(
        'id as batchId',
        'item_id as itemId',
        'location_id as locationId',
        'batch_number as batchNumber',
        'qty_available as availableQty',
        'expiry_date as expiryDate',
      )
      .orderBy('expiry_date', 'asc');
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

  async release(orderLineId: string): Promise<void> {
    const reservations = await this.knex('stock_reservations')
      .where({ order_id: orderLineId, status: 'ACTIVE' })
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
    throw new BadRequestException(
      `GRN ${grnId} requires the M2 posting payload`,
    );
  }

  async postConsumption(
    workOrderId: string,
    materialLineId: string,
    itemId: string,
    batchId: string,
    qty: string,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const batch = await trx('inventory_batches')
        .where({ id: batchId, item_id: itemId })
        .forUpdate()
        .first('id', 'site_id', 'qty_on_hand');
      if (!batch) throw new BadRequestException('Inventory batch not found');
      const consumedQty = Qty.of(qty, 'KG');
      if (Qty.of(String(batch.qty_on_hand), 'KG').isLessThan(consumedQty)) {
        throw new BadRequestException('Insufficient physical stock');
      }
      await this.insertLedger(trx, {
        siteId: String(batch.site_id),
        itemId,
        batchId,
        txnType: 'PROD_CONSUME',
        qty: consumedQty.toStorageString(),
        referenceTable: 'work_order_materials',
        referenceNo: materialLineId,
        committedDelta: -consumedQty.toNumber(),
      });
      await trx('stock_reservations')
        .where({
          item_id: itemId,
          batch_id: batchId,
          status: 'ACTIVE',
        })
        .update({
          status: 'CONSUMED',
          consumed_at: Clock.nowUtc(),
          updated_at: Clock.nowUtc(),
        });
    });
  }

  async postOutput(
    workOrderId: string,
    itemId: string,
    batchId: string,
    qty: string,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const batch = await trx('inventory_batches')
        .where({ id: batchId, item_id: itemId })
        .forUpdate()
        .first('id', 'site_id');
      if (!batch) throw new BadRequestException('Inventory batch not found');
      const outputQty = Qty.of(qty, 'KG');
      await this.insertLedger(trx, {
        siteId: String(batch.site_id),
        itemId,
        batchId,
        txnType: 'PROD_OUTPUT',
        qty: outputQty.toStorageString(),
        referenceTable: 'work_order_outputs',
        referenceNo: `${workOrderId}-out`,
        committedDelta: outputQty.toNumber(),
      });
    });
  }

  async receiveGRN(
    siteId: string,
    poId: string,
    itemId: string,
    requestedQty: string,
    receivedQty: string,
  ): Promise<{
    success: boolean;
    receivedQty: string;
    shortfall: string;
    exceptionType?: string;
  }> {
    return this.knex.transaction(async (trx) => {
      const existing = await trx('stock_ledger_txns')
        .where({
          reference_no: poId,
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
      const batch =
        (await trx('inventory_batches')
          .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
          .orderBy('expiry_date', 'asc')
          .first('id', 'site_id')) ??
        (await this.createBatch(trx, siteId, itemId));

      await this.insertLedger(trx, {
        siteId,
        itemId,
        batchId: String(batch.id),
        txnType: 'RECEIPT',
        qty: received.toStorageString(),
        referenceTable: 'grn',
        referenceNo: poId,
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
          `GRN shortfall for ${poId}: ${shortfall.toStorageString()}`,
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
        .select('id', 'item_id', 'dispatched_qty');
      let totalVariance = Qty.zero('KG');
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
        const batch = await this.createBatch(
          trx,
          String(transfer.to_site_id),
          String(line.item_id),
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
        .first('from_site_id');
      await this.exceptionPort.raise(
        'STOCK_VARIANCE',
        'stock_transfers',
        transferId,
        'system',
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

  async createAdjustment(
    siteId: string,
    itemId: string,
    adjustmentType: 'WRITEOFF' | 'SHRINKAGE',
    qty: string,
    remarks: string,
    requestedBy: string,
  ): Promise<{ success: boolean; approvedBy: string }> {
    return this.knex.transaction(async (trx) => {
      const availableRow = await trx('inventory_batches')
        .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
        .sum('qty_available as total')
        .first();
      const available = Qty.of(String(availableRow?.total ?? '0'), 'KG');
      const adjustment = Qty.of(qty, 'KG');
      if (available.isLessThan(adjustment)) {
        return { success: false, approvedBy: '' };
      }
      const threshold =
        (await this.config?.getNumber('adjustment_variance_threshold_pct')) ??
        5;
      const variancePct = available.isZero()
        ? 100
        : (adjustment.toNumber() / available.toNumber()) * 100;
      const autoApprove = variancePct <= threshold;
      const adjustmentId = uuidv4();
      const adjustmentNo = `ADJ-${Clock.nowUtc().getTime()}-${adjustmentId.slice(0, 8)}`;
      await trx('stock_adjustments').insert({
        id: adjustmentId,
        site_id: siteId,
        item_id: itemId,
        adjustment_no: adjustmentNo,
        adjustment_type: adjustmentType,
        qty: adjustment.toStorageString(),
        uom: 'KG',
        variance_pct: variancePct.toFixed(2),
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
  ) {
    const id = uuidv4();
    await trx('inventory_batches').insert({
      id,
      site_id: siteId,
      item_id: itemId,
      batch_number: `GRN-${Clock.nowUtc().getTime()}-${id.slice(0, 8)}`,
      status: 'AVAILABLE',
      qty_on_hand: '0.000',
      qty_committed: '0.000',
      received_date: Clock.todayKolkata(),
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
  ): Promise<void> {
    let remaining = qty;
    const batches = await trx('inventory_batches')
      .where({ site_id: siteId, item_id: itemId, status: 'AVAILABLE' })
      .where('qty_available', '>', 0)
      .orderBy('expiry_date', 'asc')
      .forUpdate()
      .select('id', 'qty_available');
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
}
