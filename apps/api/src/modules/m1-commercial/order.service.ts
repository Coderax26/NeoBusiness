import {
  Injectable,
  Logger,
  Inject,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import {
  CREDIT_PORT,
  EXCEPTION_PORT,
  ITEM_PORT,
  PRICING_PORT,
} from '../../shared/ports/ports.interface.js';
import type {
  PricingPort,
  CreditPort,
  ItemPort,
  ExceptionPort,
  ExceptionPayload,
  CreditEvaluation,
  ItemSummary,
  UomConversion,
  ExceptionType,
} from '../../shared/ports/ports.interface.js';

/**
 * OrderService — handles sales order lifecycle and business rules.
 *
 * Implements:
 * - BR-01 pricing evaluation (floor/target band, margin, exceptions)
 * - BR-02 credit evaluation
 * - `exception.resolved` handler registration (for PRICE_OVERRIDE)
 * - Order state machine state transitions
 *
 * Build order: Registers PRICE_OVERRIDE handler immediately; other handlers (e.g. onStockInsufficient) to be registered when M3 completes.
 */
@Injectable()
export class OrderService implements OnModuleInit {
  private readonly logger = new Logger(OrderService.name);

  private handlers = new Map<
    ExceptionType,
    (
      exceptionId: string,
      action: string,
      remarks: string,
      counterJson?: object,
    ) => Promise<void>
  >();

  constructor(
    @InjectKnex() private readonly knex: Knex,
    @Inject(PRICING_PORT) private readonly pricing: PricingPort,
    @Inject(CREDIT_PORT) private readonly credit: CreditPort,
    @Inject(ITEM_PORT) private readonly items: ItemPort,
    @Inject(EXCEPTION_PORT) private readonly exceptionPort: ExceptionPort,
    private readonly docNumber: DocNumberService,
  ) {}

  onModuleInit(): void {
    const resolveOrderException = async (
      exceptionId: string,
      action: string,
      remarks: string,
      counterJson?: object,
    ) => {
      this.logger.log(`Exception handler invoked: ${exceptionId} → ${action}`);
      try {
        const card = await this.knex('exception_approvals')
          .where({ id: exceptionId })
          .first('reference_table', 'reference_id', 'exception_type');

        let orderId: string | null = (counterJson as any)?.orderId
          ? String((counterJson as any).orderId)
          : null;

        if (!orderId && card) {
          if (card.reference_table === 'sales_orders') {
            orderId = String(card.reference_id);
          } else if (card.reference_table === 'sales_order_lines') {
            const line = await this.knex('sales_order_lines')
              .where({ id: card.reference_id })
              .first('order_id');
            if (line?.order_id) orderId = String(line.order_id);
          }
        }

        if (!orderId || orderId === 'PENDING_REPROCESSING') {
          this.logger.warn(
            `Exception ${exceptionId} resolved without resolvable orderId`,
          );
          return;
        }

        const rawCounter =
          (counterJson as any)?.counterPrice ??
          (counterJson as any)?.proposedPrice ??
          (counterJson as any)?.price;
        const counterPrice =
          rawCounter !== undefined && rawCounter !== null
            ? String(rawCounter)
            : null;

        await this.knex.transaction(async (trx) => {
          const order = await trx('sales_orders')
            .where({ id: orderId })
            .forUpdate()
            .first('id', 'order_status', 'created_by');
          if (!order) return;

          if (action === 'APPROVED') {
            if (order.order_status === 'PENDING_APPROVAL') {
              await trx('sales_orders').where({ id: orderId }).update({
                order_status: 'CONFIRMED',
                confirmed_at: new Date(),
                updated_at: new Date(),
              });
              await trx('order_status_log').insert({
                order_id: orderId,
                from_status: order.order_status,
                to_status: 'CONFIRMED',
                by_user: order.created_by,
                reason: remarks || `Exception ${exceptionId} approved by owner`,
              });
            }
          } else if (action === 'COUNTERED') {
            await trx('order_status_log').insert({
              order_id: orderId,
              from_status: order.order_status,
              to_status: order.order_status,
              by_user: order.created_by,
              reason: `Owner counter-offer${counterPrice ? ` ₹${counterPrice}` : ''}: ${remarks || ''}`.trim(),
            });
          } else if (action === 'REJECTED') {
            await trx('sales_orders').where({ id: orderId }).update({
              order_status: 'REJECTED',
              updated_at: new Date(),
            });
            await trx('order_status_log').insert({
              order_id: orderId,
              from_status: order.order_status,
              to_status: 'REJECTED',
              by_user: order.created_by,
              reason: remarks || `Exception ${exceptionId} rejected by owner`,
            });
          }
        });

        if (action === 'APPROVED') {
          const lines = await this.knex('sales_order_lines')
            .where({ order_id: orderId })
            .select('*');
          await this.emitOrderConfirmedEvent(orderId, lines, 'OK').catch(() => {});
        }
      } catch (err) {
        this.logger.error(
          `Exception handler failed for ${exceptionId}: ${(err as Error).message}`,
        );
      }
    };

    this.exceptionPort.onResolved('PRICE_OVERRIDE', resolveOrderException);
    this.exceptionPort.onResolved('CREDIT_BREACH', resolveOrderException);

    this.logger.log('OrderService initialized');
  }

  /**
   * Create a new order with validated lines.
   *
   * Flow:
   * 1. Fetch band for each line (fails if band not set today).
   * 2. Evaluate price against floor: in-band → auto-confirm; below-floor → raise exception and return PENDING_APPROVAL.
   * 3. Evaluate credit: HOLD → raise CREDIT_BREACH.
   * 4. Return order DTO with status and exception IDs.
   */
  async createOrder(
    customerId: string,
    fulfillmentSiteId: string,
    lineData: Array<{ itemId: string; qty: string; requestedPrice: string }>,
    userId: string,
    quoteId?: string,
    deliveryDate?: string,
    deliveryTimeWindow?: string,
  ): Promise<{
    orderId: string;
    orderNo: string;
    status: string;
    exceptionIds: string[];
    creditEvaluation: CreditEvaluation | null;
  }> {
    return this.knex.transaction(async (trx) => {
      // Doc number
      const orderNo = await this.docNumber.next(
        'SALES_ORDER',
        fulfillmentSiteId,
        null,
        trx,
      );

      // Build status log entry
      const newStatus = 'DRAFT';
      const orderRows = await trx('sales_orders')
        .insert({
          order_no: orderNo,
          customer_id: customerId,
          fulfillment_site_id: fulfillmentSiteId,
          order_status: newStatus,
          total_amount: '0.00',
          margin_pct: null,
          delivery_date: deliveryDate ?? new Date().toISOString().split('T')[0],
          delivery_time_window: deliveryTimeWindow ?? '10-12',
          created_by: userId,
          source_quote_id: quoteId ?? null,
        })
        .returning('id');

      const orderId = String(orderRows[0].id);

      // Insert lines with line total computation
      const linesToInsert = await Promise.all(
        lineData.map(async (line) => {
          const item = await this.items.getItem(line.itemId);
          if (!item) {
            throw new NotFoundException(`Item ${line.itemId} not found`);
          }

          // Verify band exists for today (falls back to most recent carried-forward band)
          const band = await this.pricing.getBand(
            line.itemId,
            new Date().toISOString().split('T')[0],
          );
          if (!band) {
            throw new BadRequestException(
              `Price band not set for item "${item.name}" (${item.skuCode || line.itemId}). Please publish prices in Sales → Today's Prices first.`,
            );
          }

          // Compute margin (allow 0% break-even or negative-margin override requests; only reject <= ₹0 requested price)
          const requested = Money.of(line.requestedPrice);
          const cost = Money.of(band.latestLandedCost);
          const margin = Money.marginPct(requested, cost);
          if (requested.isZero() || requested.isNegative() || margin === null) {
            throw new BadRequestException(
              `Requested price for "${item.name}" must be greater than ₹0.`,
            );
          }

          const lineTotal = requested.mul(line.qty);

          // Store line snapshots
          return {
            order_id: orderId,
            item_id: line.itemId,
            ordered_qty: line.qty,
            quoted_unit_price: requested.toStorageString(),
            floor_price_snapshot: band.floorPrice,
            target_price_snapshot: band.targetPrice,
            landed_cost_snapshot: band.latestLandedCost,
            margin_pct_snapshot: margin.toNumber(),
            line_total: lineTotal.toStorageString(),
          };
        }),
      );

      await trx('sales_order_lines').insert(linesToInsert);

      const computedTotal = Money.of(
        linesToInsert
          .reduce((sum, l) => sum + parseFloat(l.line_total || '0'), 0)
          .toFixed(2),
      ).toStorageString();
      await trx('sales_orders')
        .where('id', orderId)
        .update({ total_amount: computedTotal });

      // Create status log
      await trx('order_status_log').insert({
        order_id: orderId,
        from_status: '', // initial creation
        to_status: newStatus,
        by_user: userId,
      });

      return {
        orderId,
        orderNo,
        status: newStatus,
        exceptionIds: [],
        creditEvaluation: null, // will be called externally or after aggregates
      };
    });
  }

  /**
   * Confirm an in-band order.
   * Caller must have validated pricing first (typically via pricing.evaluateLine).
   */
  async confirm(
    orderId: string,
    remarks: string | undefined,
    userId: string,
  ): Promise<{ orderId: string; status: string }> {
    return this.knex.transaction(async (trx) => {
      const order = await trx('sales_orders')
        .where('id', orderId)
        .forUpdate()
        .first(
          'id',
          'order_status',
          'customer_id',
          'credit_flag',
          'fulfillment_site_id',
        );

      if (!order) throw new NotFoundException(`Order ${orderId} not found`);
      if (order.order_status !== 'DRAFT') {
        throw new ConflictException(
          `Order must be in DRAFT status to confirm, current: ${order.order_status}`,
        );
      }

      // Re-evaluate all lines for price band compliance
      const lines = await trx('sales_order_lines')
        .where('order_id', orderId)
        .select('*');
      const today = new Date().toISOString().split('T')[0];

      for (const line of lines) {
        const band = await this.pricing.getBand(line.item_id, today);
        if (!band)
          throw new BadRequestException(
            `Price band not set for item ${line.item_id}. Please publish prices in Sales → Today's Prices first.`,
          );

        const requested = Money.of(line.quoted_unit_price);
        const floor = Money.of(band.floorPrice);
        if (requested.isLessThan(floor)) {
          throw new BadRequestException(
            `Line ${line.id} is below floor (${line.quoted_unit_price} < ${band.floorPrice}). Request override first.`,
          );
        }
      }

      // Credit evaluation - compute sum manually since Knex sum() doesn't support expressions
      const orderLines = await trx('sales_order_lines')
        .where('order_id', orderId)
        .select('quoted_unit_price', 'ordered_qty');
      const totalAmount = Money.of(
        orderLines
          .reduce(
            (sum, l) =>
              sum + parseFloat(l.quoted_unit_price) * parseFloat(l.ordered_qty),
            0,
          )
          .toFixed(2),
      ).toStorageString();
      const evaluation = await this.credit.evaluate(
        order.customer_id,
        totalAmount,
      );

      // Determine final status
      let finalStatus = 'CONFIRMED';
      if (evaluation.status === 'HOLD') {
        finalStatus = 'PENDING_APPROVAL';
        // Raise CREDIT_BREACH exception
        const payload = {
          title: 'Credit Limit Breach',
          summary: evaluation.reason || 'Order exceeds credit limit',
          facts: [
            { label: 'Customer', value: order.customer_id },
            { label: 'Order Total', value: totalAmount },
            { label: 'Credit Limit', value: evaluation.creditLimit },
            { label: 'Current AR', value: evaluation.currentArBalance },
          ],
          impact:
            'Order cannot be dispatched until credit is approved or converted to COD.',
          actions: [
            { code: 'APPROVE', label: 'Approve Credit' },
            { code: 'CONVERT_COD', label: 'Convert to COD' },
            { code: 'REJECT', label: 'Reject Order' },
          ],
          valueAtRisk: totalAmount,
        };

        await this.exceptionPort.raise(
          'CREDIT_BREACH',
          'sales_orders',
          orderId,
          userId,
          payload,
          order.fulfillment_site_id,
        );
      }

      // Update order
      await trx('sales_orders')
        .where('id', orderId)
        .update({
          order_status: finalStatus,
          total_amount: totalAmount,
          confirmed_at: finalStatus === 'CONFIRMED' ? new Date() : null,
          credit_flag: evaluation.status,
          approved_by:
            finalStatus === 'CONFIRMED' && evaluation.status === 'OK'
              ? userId
              : null,
        });

      // Status log
      await trx('order_status_log').insert({
        order_id: orderId,
        from_status: 'DRAFT',
        to_status: finalStatus,
        by_user: userId,
        reason:
          remarks ??
          (evaluation.status === 'OK'
            ? 'Confirmed in-band'
            : 'Credit hold - awaiting approval'),
      });

      // Emit domain event only when order actually moves to CONFIRMED
      if (finalStatus === 'CONFIRMED') {
        await this.emitOrderConfirmedEvent(orderId, lines, evaluation.status);
      }

      this.logger.log(`Order ${orderId} confirm result: status=${finalStatus}`);
      return { orderId, status: finalStatus };
    });
  }

  /**
   * Request a price override for a below-floor order line.
   */
  async requestOverride(
    orderId: string,
    reason: string,
    userId: string,
  ): Promise<{ orderId: string; exceptionId: string }> {
    return this.knex.transaction(async (trx) => {
      const order = await trx('sales_orders')
        .where('id', orderId)
        .forUpdate()
        .first('id', 'order_status', 'customer_id', 'fulfillment_site_id');

      if (!order) throw new NotFoundException(`Order ${orderId} not found`);
      if (order.order_status !== 'DRAFT') {
        throw new ConflictException(
          `Order must be in DRAFT to request override`,
        );
      }

      // Find the first below-floor line (or all)
      const lines = await trx('sales_order_lines')
        .where('order_id', orderId)
        .select(
          'id',
          'item_id',
          'ordered_qty',
          'quoted_unit_price',
          'floor_price_snapshot',
          'target_price_snapshot',
          'landed_cost_snapshot',
        );

      const today = new Date().toISOString().split('T')[0];
      let belowFloorLineId: string | null = null;
      let exceptionId: string | null = null;

      for (const line of lines) {
        const band = await this.pricing.getBand(line.item_id, today);
        if (!band) continue;

        const requested = Money.of(line.quoted_unit_price);
        const floor = Money.of(band.floorPrice);

        if (requested.isLessThan(floor)) {
          belowFloorLineId = line.id;

          // Raise exception for this line
          const payload = {
            title: 'Price Below Floor',
            summary: reason,
            facts: [
              { label: 'Item', value: line.item_id },
              { label: 'Qty', value: line.ordered_qty },
              { label: 'Requested Price', value: line.quoted_unit_price },
              { label: 'Landed Cost', value: band.latestLandedCost },
              { label: 'Floor Price', value: band.floorPrice },
              { label: 'Target Price', value: band.targetPrice },
            ],
            impact:
              'Order cannot be confirmed until a price override is approved.',
            actions: [
              { code: 'APPROVE', label: 'Approve Price' },
              { code: 'COUNTER', label: 'Counter Price' },
              { code: 'REJECT', label: 'Reject' },
            ],
            valueAtRisk: requested.mul(line.ordered_qty).toStorageString(),
          };

          exceptionId = await this.exceptionPort.raise(
            'PRICE_OVERRIDE',
            'sales_order_lines',
            line.id,
            userId,
            payload,
            order.fulfillment_site_id,
          );

          // Mark order as pending approval
          await trx('sales_orders')
            .where('id', orderId)
            .update({ order_status: 'PENDING_APPROVAL' });

          await trx('order_status_log').insert({
            order_id: orderId,
            from_status: 'DRAFT',
            to_status: 'PENDING_APPROVAL',
            by_user: userId,
            reason: `Price override requested: ${reason}`,
          });

          break; // One exception per order for MVP
        }
      }

      if (!exceptionId) {
        throw new BadRequestException('No below-floor lines found to override');
      }

      this.logger.log(
        `Price override requested for order ${orderId}: ${exceptionId}`,
      );
      return { orderId, exceptionId };
    });
  }

  /**
   * Accept a counter price from owner.
   * Called after owner resolves PRICE_OVERRIDE with COUNTERED action.
   */
  async acceptCounter(
    orderId: string,
    remarks: string | undefined,
    userId: string,
    explicitCounterPrice?: number,
  ): Promise<{ orderId: string; status: string; totalAmount?: string }> {
    return this.knex.transaction(async (trx) => {
      const order = await trx('sales_orders')
        .where('id', orderId)
        .forUpdate()
        .first('id', 'order_status', 'customer_id', 'total_amount');

      if (!order) throw new NotFoundException(`Order ${orderId} not found`);
      if (order.order_status !== 'PENDING_APPROVAL') {
        throw new ConflictException(
          `Order must be in PENDING_APPROVAL to accept counter`,
        );
      }

      const lines = await trx('sales_order_lines')
        .where('order_id', orderId)
        .select('*');
      const lineIds = lines.map((l: any) => String(l.id));

      // Locate latest COUNTERED exception event for this order or its lines
      let counterPriceValue =
        explicitCounterPrice !== undefined && explicitCounterPrice > 0
          ? Money.of(explicitCounterPrice)
          : null;

      if (!counterPriceValue && lineIds.length > 0) {
        const latestEvent = await trx('exception_events as ee')
          .join('exception_approvals as ea', 'ee.exception_id', 'ea.id')
          .where(function () {
            this.where({ 'ea.reference_table': 'sales_orders', 'ea.reference_id': orderId })
              .orWhere(function () {
                this.where('ea.reference_table', 'sales_order_lines').whereIn(
                  'ea.reference_id',
                  lineIds,
                );
              });
          })
          .andWhere('ee.event', 'RESOLVED')
          .orderBy('ee.at', 'desc')
          .first('ee.metadata_json');

        const meta =
          typeof latestEvent?.metadata_json === 'string'
            ? JSON.parse(latestEvent.metadata_json)
            : latestEvent?.metadata_json;
        const c = meta?.counter;
        const raw = c?.counterPrice ?? c?.proposedPrice ?? c?.price;
        if (raw !== undefined && raw !== null && Number(raw) > 0) {
          counterPriceValue = Money.of(raw);
        }
      }

      let recalculatedTotal = Money.zero();
      for (const line of lines) {
        let unitPrice = Money.of(line.quoted_unit_price);
        const floor = Money.of(line.floor_price_snapshot || '0');
        const wasBelowFloor = unitPrice.isLessThan(floor);
        if (counterPriceValue && (wasBelowFloor || lines.length === 1)) {
          unitPrice = counterPriceValue;
          const lineTotal = unitPrice.mul(Number(line.ordered_qty));
          const cost = Money.of(line.landed_cost_snapshot || '0');
          const margin = Money.marginPct(unitPrice, cost);
          await trx('sales_order_lines')
            .where('id', line.id)
            .update({
              quoted_unit_price: unitPrice.toStorageString(),
              line_total: lineTotal.toStorageString(),
              margin_pct_snapshot: margin ? margin.toNumber() : line.margin_pct_snapshot,
            });
          line.quoted_unit_price = unitPrice.toStorageString();
          line.line_total = lineTotal.toStorageString();
          recalculatedTotal = recalculatedTotal.add(lineTotal);
        } else {
          recalculatedTotal = recalculatedTotal.add(
            Money.of(line.line_total || unitPrice.mul(Number(line.ordered_qty)).toStorageString()),
          );
        }
      }

      const finalTotal =
        lines.length > 0 ? recalculatedTotal.toStorageString() : String(order.total_amount || '0.00');

      await trx('sales_orders').where('id', orderId).update({
        order_status: 'CONFIRMED',
        total_amount: finalTotal,
        confirmed_at: new Date(),
        approved_by: userId,
        updated_at: new Date(),
      });

      await trx('order_status_log').insert({
        order_id: orderId,
        from_status: 'PENDING_APPROVAL',
        to_status: 'CONFIRMED',
        by_user: userId,
        reason:
          remarks ??
          (counterPriceValue
            ? `Counter price ₹${counterPriceValue.toStorageString()} accepted`
            : 'Counter price accepted'),
      });

      await this.emitOrderConfirmedEvent(orderId, lines, 'OK');

      this.logger.log(`Order ${orderId} confirmed with counter price`);
      return { orderId, status: 'CONFIRMED', totalAmount: finalTotal };
    });
  }

  /**
   * Cancel an order (releases any active stock reservations & emits order.cancelled).
   */
  async cancel(
    orderId: string,
    reason: string,
    userId: string,
  ): Promise<{ orderId: string; status: string }> {
    return this.knex.transaction(async (trx) => {
      const order = await trx('sales_orders')
        .where('id', orderId)
        .forUpdate()
        .first('id', 'order_status', 'fulfillment_site_id');

      if (!order) throw new NotFoundException(`Order ${orderId} not found`);

      const terminalStates = ['CANCELLED', 'REJECTED', 'CLOSED'];
      if (terminalStates.includes(order.order_status)) {
        throw new ConflictException(
          `Order already in terminal state: ${order.order_status}`,
        );
      }

      await trx('sales_orders').where('id', orderId).update({
        order_status: 'CANCELLED',
        updated_at: new Date(),
      });

      // Release any active stock reservations belonging to this order's lines
      const lines = await trx('sales_order_lines')
        .where('order_id', orderId)
        .select('id');
      const targetIds = [orderId, ...lines.map((l: any) => String(l.id))];
      const activeReservations = await trx('stock_reservations')
        .whereIn('order_id', targetIds)
        .andWhere('status', 'ACTIVE')
        .select('id', 'site_id', 'item_id', 'batch_id', 'qty');

      if (activeReservations.length > 0) {
        await trx('stock_reservations')
          .whereIn(
            'id',
            activeReservations.map((r: any) => r.id),
          )
          .update({ status: 'RELEASED', updated_at: new Date() });

        for (const r of activeReservations) {
          const item = await trx('items')
            .where({ id: r.item_id })
            .first('primary_uom');
          await trx('stock_ledger_txns').insert({
            site_id: r.site_id,
            item_id: r.item_id,
            batch_id: r.batch_id,
            txn_type: 'RELEASE',
            qty: String(r.qty),
            uom: item?.primary_uom ?? 'KG',
            reference_table: 'sales_orders',
            reference_id: orderId,
            reference_no: `cancel:${orderId}`,
            note: `Order cancelled: ${reason}`,
            created_by: userId,
          });
        }
      }

      await trx('order_status_log').insert({
        order_id: orderId,
        from_status: order.order_status,
        to_status: 'CANCELLED',
        by_user: userId,
        reason,
      });

      await trx('outbox_events').insert({
        aggregate_id: orderId,
        event_type: 'order.cancelled',
        payload: {
          orderId,
          siteId: order.fulfillment_site_id,
          lineIds: lines.map((l: any) => String(l.id)),
          reason,
        },
        module_source: 'm1',
        published_at: trx.raw('NOW()'),
      });

      this.logger.log(`Order ${orderId} cancelled: ${reason}`);
      return { orderId, status: 'CANCELLED' };
    });
  }

  async markReady(orderId: string, userId: string, remarks?: string) {
    return this.transitionStatus(
      orderId,
      ['CONFIRMED', 'IN_PRODUCTION_SOURCING'],
      'READY',
      userId,
      remarks ?? 'Marked ready for dispatch',
    );
  }

  async markDispatched(orderId: string, userId: string, remarks?: string) {
    return this.transitionStatus(
      orderId,
      ['CONFIRMED', 'READY'],
      'DISPATCHED',
      userId,
      remarks ?? 'Order dispatched',
    );
  }

  async markDelivered(orderId: string, userId: string, remarks?: string) {
    return this.transitionStatus(
      orderId,
      ['DISPATCHED'],
      'DELIVERED_FULL',
      userId,
      remarks ?? 'Order delivered',
    );
  }

  private async transitionStatus(
    orderId: string,
    allowedFrom: string[],
    toStatus: string,
    userId: string,
    reason: string,
  ): Promise<{ orderId: string; status: string }> {
    return this.knex.transaction(async (trx) => {
      const order = await trx('sales_orders')
        .where('id', orderId)
        .forUpdate()
        .first('id', 'order_status');
      if (!order) throw new NotFoundException(`Order ${orderId} not found`);
      if (!allowedFrom.includes(order.order_status)) {
        throw new ConflictException(
          `Cannot move order from ${order.order_status} to ${toStatus}`,
        );
      }
      await trx('sales_orders')
        .where('id', orderId)
        .update({ order_status: toStatus, updated_at: new Date() });
      await trx('order_status_log').insert({
        order_id: orderId,
        from_status: order.order_status,
        to_status: toStatus,
        by_user: userId,
        reason,
      });
      return { orderId, status: toStatus };
    });
  }

  /**
   * Evaluate credit and raise CREDIT_BREACH if needed.
   */
  async evaluateOrderCredit(
    orderId: string,
    userId: string,
  ): Promise<{
    ok: boolean;
    status: string;
    creditEvaluation: CreditEvaluation;
  }> {
    const orderRow = await this.knex('sales_orders')
      .where('id', orderId)
      .first('order_status', 'customer_id');
    if (!orderRow) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (orderRow.order_status !== 'DRAFT') {
      throw new BadRequestException(
        `Order status must be DRAFT for credit evaluation`,
      );
    }

    // Compute order total - use raw SQL for expression
    const totalResult = await this.knex.raw(
      'SELECT SUM(CAST(quoted_unit_price AS NUMERIC) * CAST(ordered_qty AS NUMERIC)) as total FROM sales_order_lines WHERE order_id = ?',
      [orderId],
    );
    const totalAmount = totalResult.rows[0]?.total || '0.00';

    const evaluation = await this.credit.evaluate(
      orderRow.customer_id,
      totalAmount,
    );

    this.logger.debug(
      `Order ${orderId} credit check: ${evaluation.status}, reason: ${evaluation.reason || 'none'}`,
    );

    return {
      ok: evaluation.status === 'OK',
      status: evaluation.status,
      creditEvaluation: evaluation,
    };
  }

  /**
   * Reassign fulfillment site for an editable sales order.
   */
  async updateFulfillmentSite(
    orderId: string,
    fulfillmentSiteId: string,
    userId: string,
  ): Promise<{ orderId: string; fulfillmentSiteId: string; siteName: string }> {
    const editableStatuses = [
      'DRAFT',
      'PENDING_APPROVAL',
      'CONFIRMED',
      'IN_PRODUCTION_SOURCING',
      'READY',
      'READY_FOR_DISPATCH',
    ];
    return this.knex.transaction(async (trx) => {
      const order = await trx('sales_orders')
        .where('id', orderId)
        .forUpdate()
        .first('id', 'order_status', 'fulfillment_site_id');
      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }
      if (!editableStatuses.includes(order.order_status)) {
        throw new ConflictException(
          `Cannot change fulfillment site after order is ${order.order_status}`,
        );
      }

      const site = await trx('sites')
        .where('id', fulfillmentSiteId)
        .first('id', 'name', 'is_active', 'is_fulfillment_site');
      if (!site || !site.is_active) {
        throw new BadRequestException('Selected site is inactive or does not exist.');
      }
      if (!site.is_fulfillment_site) {
        throw new BadRequestException(
          `${site.name} is not enabled as a fulfillment site. Enable it in Settings → Sites first.`,
        );
      }

      await trx('sales_orders')
        .where('id', orderId)
        .update({
          fulfillment_site_id: fulfillmentSiteId,
          updated_at: new Date(),
        });

      await trx('order_status_log').insert({
        order_id: orderId,
        from_status: order.order_status,
        to_status: order.order_status,
        by_user: userId,
        reason: `Fulfillment site changed to ${site.name}`,
      });

      return {
        orderId,
        fulfillmentSiteId,
        siteName: site.name,
      };
    });
  }

  /**
   * Publish order.confirmed domain event.
   */
  private async emitOrderConfirmedEvent(
    orderId: string,
    lines: any[],
    creditStatus: string,
  ): Promise<void> {
    const order = await this.knex('sales_orders')
      .where('id', orderId)
      .first('customer_id', 'fulfillment_site_id', 'delivery_date');
    if (!order) return;

    // Pre-fetch item categories for all line items in one query
    const itemIds = Array.from(new Set(lines.map((l) => l.item_id)));
    const itemCategories = new Map<string, string>();
    const itemRows = await this.knex('items')
      .whereIn('id', itemIds)
      .select('id', 'item_category');
    for (const row of itemRows) {
      itemCategories.set(String(row.id), row.item_category);
    }

    const linePayload = lines.map((l) => ({
      orderLineId: l.id,
      itemId: l.item_id,
      qty: l.ordered_qty,
      unitPrice: l.quoted_unit_price,
      itemCategory: itemCategories.get(String(l.item_id)),
    }));

    await this.knex('outbox_events').insert({
      aggregate_id: orderId,
      event_type: 'order.confirmed',
      payload: {
        orderId,
        customerId: order.customer_id,
        siteId: order.fulfillment_site_id,
        lines: linePayload,
        deliveryDate: order.delivery_date,
        creditFlag: creditStatus,
      },
      module_source: 'm1',
      published_at: this.knex.raw('NOW()'),
    });

    this.logger.log(`Published order.confirmed event for ${orderId}`);
  }

  /**
   * Publish credit evaluation events (for async consumption by M6 or other consumers).
   */
  async publishOrderEvaluation(
    orderId: string,
    creditEvaluation: CreditEvaluation,
  ): Promise<void> {
    await this.knex('outbox_events').insert({
      aggregate_id: orderId,
      event_type: 'order.credit_evaluated',
      payload: {
        orderId,
        creditEvaluation,
      },
      module_source: 'm1',
      published_at: this.knex.raw('NOW()'),
    });
    this.logger.log(
      `Published order.credit_evaluated event for order ${orderId}`,
    );
  }
}
