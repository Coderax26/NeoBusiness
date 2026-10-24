import { Injectable, NotFoundException, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { ConfigService } from '../m0-platform/config.service.js';
import type { ExceptionPort } from '../../shared/ports/ports.interface.js';

/**
 * PricingService — calculates dynamic pricing bands and returns price memory.
 *
 * Implements PricingPort + calls ExceptionPort when requested price is below floor.
 *
 * Rules:
 * - Returns None if price band not yet set for today (manual upsert required).
 * - Auto-floor uses Money.autoFloor(landedCost, minMarginPct) → rounded UP to ₹0.50.
 * - BR-01: price >= floor → in band; price < floor → requires exception.
 */
@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    @Inject('EXCEPTION_PORT') private readonly exceptionPort: ExceptionPort,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.logger.log('PricingService initialized (PRICING_PORT → real implementation)');
  }

  async getBand(itemId: string, date: string): Promise<{
    itemId: string;
    date: string;
    latestLandedCost: string;
    floorPrice: string;
    targetPrice: string;
    minMarginPct: number;
  } | null> {
    const row = await this.knex('daily_price_lists')
      .where('item_id', itemId)
      .where('effective_date', date)
      .first(
        'item_id',
        'effective_date',
        'latest_landed_cost',
        'floor_price',
        'target_price',
        'min_margin_pct_used',
      );

    if (!row) {
      return null;
    }

    return {
      itemId: String(row.item_id),
      date: row.effective_date,
      latestLandedCost: row.latest_landed_cost,
      floorPrice: row.floor_price,
      targetPrice: row.target_price,
      minMarginPct: Number(row.min_margin_pct_used),
    };
  }

  /**
   * Calculate auto floor price from landed cost and minimum margin.
   * Uses Money.autoFloor as defined in OD-001 CONFIRMED (10% gross margin default).
   */
  async getAutoFloor(landedCost: string, minMarginPct: number): Promise<string> {
    const cost = Money.of(landedCost);
    const floor = Money.autoFloor(cost, minMarginPct);
    return floor.toStorageString();
  }

  /**
   * Evaluate a line price against the band.
   * Returns null if band not found.
   */
  async evaluateLine(
    itemId: string,
    date: string,
    qty: string,
    requestedPrice: string,
    requestId: string,
    userId: string,
    siteId: string,
  ): Promise<{
    inBand: boolean;
    marginPct: number | null;
    gap: string | null;
    band: any;
  } | null> {
    const band = await this.getBand(itemId, date);
    if (!band) {
      return null;
    }

    const requested = Money.of(requestedPrice);
    const cost = Money.of(band.latestLandedCost);
    const margin = Money.marginPct(requested, cost);

    if (margin === null) {
      // requested price is zero → undefined margin, corresponding error elsewhere
      return null;
    }

    const floor = Money.of(band.floorPrice);
    const inBand = requested.isGreaterThanOrEqual(floor);
    const gap = inBand ? null : floor.sub(requested).toStorageString();

    // External consumers like OrderService raise the exception immediately.
    // This method only evaluates; raising is up to the caller.
    if (!inBand) {
      // Prepare exception payload with full context
      const payload = {
        title: 'Price Below Floor',
        summary: 'Order line price is below the daily floor price minimum.',
        facts: [
          { label: 'Item', value: itemId },
          { label: 'Qty', value: qty },
          { label: 'Requested Price', value: requestedPrice },
          { label: 'Landed Cost', value: band.latestLandedCost },
          { label: 'Floor Price', value: band.floorPrice },
          { label: 'Target Price', value: band.targetPrice },
          { label: 'Margin %', value: margin.toFixed(2) },
        ],
        impact: 'Order cannot be confirmed until a price override is approved.',
        actions: [
          { code: 'REQUEST_OVERRIDE', label: 'Request Owner Override' },
          { code: 'ACCEPT_COUNTER', label: 'Accept Counter Price' },
        ],
        valueAtRisk: requested.mul(qty).toStorageString(),
      };

      const exceptionId = await this.exceptionPort.raise(
        'PRICE_OVERRIDE',
        'sales_order_lines',
        requestId,
        userId,
        payload,
        siteId,
      );

      this.logger.debug(`Raised PRICE_OVERRIDE for sales_order_line ${requestId}: ${exceptionId}`);
    }

    return {
      inBand,
      marginPct: margin.toNumber(),
      gap,
      band,
    };
  }

  /**
   * Price memory: last 5 confirmed sales for customer + item.
   */
  async lastPrices(customerId: string, itemId: string, limit = 5): Promise<
    Array<{ date: string; qty: string; unitPrice: string; orderId: string }>
  > {
    const rows = await this.knex('sales_orders as so')
      .join('sales_order_lines as sol', 'so.id', 'sol.order_id')
      .where('so.customer_id', customerId)
      .where('sold_item_id', itemId)
      .andWhere('so.order_status', 'CONFIRMED')
      .orderBy('so.created_at_idx', 'desc')
      .limit(limit)
      .select(
        'so.created_at as date',
        'so.id as orderId',
        'sol.ordered_qty as qty',
        'sol.quoted_unit_price as unitPrice',
      );

    return rows.map((r) => ({
      date: r.date,
      qty: r.qty,
      unitPrice: r.unitPrice,
      orderId: String(r.orderId),
    }));
  }

  /**
   * Publish daily price to outbox (called when prices are updated via API).
   */
  async publishPrices(updatedItemIds: string[], updatedBy: string): Promise<void> {
    await this.knex.transaction(async (trx) => {
      for (const itemId of updatedItemIds) {
        const row = await trx('daily_price_lists')
          .where('item_id', itemId)
          .where('effective_date', new Date().toISOString().split('T')[0])
          .first('item_id', 'floor_price', 'target_price', 'latest_landed_cost');

        if (row) {
          // Note: Domain event type name matches domain-events.ts (price.updated)
          await this.knex('outbox_events').insert({
            aggregate_id: itemId,
            event_type: 'price.updated',
            payload: {
              itemId: String(row.item_id),
              date: row.effective_date,
              floorPrice: row.floor_price,
              targetPrice: row.target_price,
              landedCost: row.latest_landed_cost,
            },
            source_module: 'm1',
            created_at: trx.raw('NOW()'),
          });
        }
      }

      // Update updated_by timestamps
      await trx('daily_price_lists')
        .whereIn('item_id', updatedItemIds)
        .update('updated_by', updatedBy);
    });

    this.logger.log(`Published price.updated events for ${updatedItemIds.length} items`);
  }
}