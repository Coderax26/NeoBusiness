import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { Money } from '../../shared/utils/money.util.js';
import { ItemService } from './item.service.js';
import { PricingService } from './pricing.service.js';

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly items: ItemService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Create a new quote.
   */
  async create(data: {
    customerId: string;
    siteId: string;
    lines: Array<{ itemId: string; qty: string; requestedPrice: string }>;
    validUntil?: Date;
    userId: string;
  }) {
    return this.knex.transaction(async (trx) => {
      const quoteNo = await this.docNumber.next(
        'QUOTE',
        data.siteId,
        null,
        trx,
      );
      const validUntil =
        data.validUntil ?? new Date(Date.now() + 4 * 60 * 60 * 1000); // default 4h

      const [quote] = await trx('quotes')
        .insert({
          quote_no: quoteNo,
          customer_id: data.customerId,
          site_id: data.siteId,
          status: 'DRAFT',
          total_amount: '0.00',
          valid_until: validUntil,
          created_by: data.userId,
          updated_by: data.userId,
        })
        .returning('*');

      let totalAmount = Money.zero();
      const lines = [];

      for (const line of data.lines) {
        const item = await this.items.getItemSummary(line.itemId);
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);

        const band = await this.pricing.getBand(
          line.itemId,
          new Date().toISOString().split('T')[0],
        );
        if (!band)
          throw new BadRequestException(
            `Price band not set for item ${line.itemId} today`,
          );

        const requested = Money.of(line.requestedPrice);
        const cost = Money.of(band.latestLandedCost);
        const margin = Money.marginPct(requested, cost);
        const lineTotal = requested.mul(line.qty);
        totalAmount = totalAmount.add(lineTotal);

        const [quoteLine] = await trx('quote_lines')
          .insert({
            quote_id: quote.id,
            item_id: line.itemId,
            qty: line.qty,
            quoted_unit_price: requested.toStorageString(),
            floor_price_snapshot: band.floorPrice,
            target_price_snapshot: band.targetPrice,
            landed_cost_snapshot: band.latestLandedCost,
            margin_pct_snapshot: margin?.toNumber(),
          })
          .returning('*');

        lines.push(quoteLine);
      }

      await trx('quotes').where('id', quote.id).update({
        total_amount: totalAmount.toStorageString(),
        status: 'SENT',
      });

      return {
        ...quote,
        status: 'SENT',
        total_amount: totalAmount.toStorageString(),
        lines,
      };
    });
  }

  async list(filters: { siteId?: string; customerId?: string; status?: string; limit?: number; offset?: number }) {
    const validSiteId =
      filters.siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.siteId)
        ? filters.siteId
        : undefined;
    let query = this.knex('quotes as q')
      .leftJoin('customers as c', 'q.customer_id', 'c.id')
      .select('q.*', 'c.business_name as customer_name', 'c.customer_code');
    if (validSiteId) query = query.where('q.site_id', validSiteId);
    if (filters.customerId) query = query.where('q.customer_id', filters.customerId);
    if (filters.status) query = query.where('q.status', filters.status);

    const rows = await query
      .orderBy('q.created_at', 'desc')
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    if (rows.length === 0) return [];
    const quoteIds = rows.map((r: any) => r.id);
    const allLines = await this.knex('quote_lines as ql')
      .leftJoin('items as i', 'ql.item_id', 'i.id')
      .whereIn('ql.quote_id', quoteIds)
      .select('ql.*', 'i.name as item_name', 'i.sku_code', 'i.primary_uom');
    const linesByQuote = new Map<string, any[]>();
    for (const l of allLines) {
      const k = String(l.quote_id);
      if (!linesByQuote.has(k)) linesByQuote.set(k, []);
      linesByQuote.get(k)!.push(l);
    }
    return rows.map((r: any) => ({ ...r, lines: linesByQuote.get(String(r.id)) || [] }));
  }

  /**
   * Get quote detail.
   */
  async findById(id: string) {
    const quote = await this.knex('quotes as q')
      .leftJoin('customers as c', 'q.customer_id', 'c.id')
      .where('q.id', id)
      .select('q.*', 'c.business_name as customer_name', 'c.customer_code')
      .first();
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);

    const lines = await this.knex('quote_lines as ql')
      .leftJoin('items as i', 'ql.item_id', 'i.id')
      .where('ql.quote_id', id)
      .select('ql.*', 'i.name as item_name', 'i.sku_code', 'i.primary_uom');
    return { ...quote, lines };
  }

  /**
   * Quote expiry job (called by scheduler).
   */
  async sweepExpired() {
    const expiredCount = await this.knex('quotes')
      .where('status', 'SENT')
      .where('valid_until', '<', new Date())
      .update({ status: 'EXPIRED', updated_at: new Date() });

    if (expiredCount > 0) {
      this.logger.log(`Expired ${expiredCount} quotes`);
    }
  }

  /**
   * Convert a quote to a sales order.
   * Re-validates each line against the current day's price band before conversion.
   *
   * BR-01 applies: if any line is below floor, PRICE_OVERRIDE exception will be
   * raised later by OrderService.confirm().
   */
  async convertToOrder(
    quoteId: string,
    siteId: string,
    userId: string,
    validationDate?: string,
  ): Promise<{
    quoteId: string;
    quoteNo: string;
    orderId: string;
    orderNo: string;
    status: string;
    totalAmount: string;
    validUntil: Date;
    customer: string;
    site: string;
    conversionInstructions: string;
    priceValidation: Array<{
      itemId: string;
      inBand: boolean;
      floorPrice: string;
      quotedPrice: string;
    }>;
  }> {
    const quote = await this.findById(quoteId);

    if (quote.status === 'EXPIRED') {
      throw new BadRequestException(
        'Expired quotes cannot be converted. Create a new quote.',
      );
    }
    if (quote.status === 'CONVERTED') {
      throw new BadRequestException('Quote already converted to order.');
    }

    const quoteLines = quote.lines as Array<{
      item_id: string;
      qty: string;
      quoted_unit_price: string;
      floor_price_snapshot: string;
      target_price_snapshot?: string;
      landed_cost_snapshot?: string;
      margin_pct_snapshot?: string;
    }>;

    // Re-validate quote lines against today's band (or specified date)
    const today = validationDate ?? new Date().toISOString().split('T')[0];
    const validationResults: Array<{
      itemId: string;
      inBand: boolean;
      floorPrice: string;
      quotedPrice: string;
    }> = [];

    for (const line of quoteLines) {
      const band = await this.pricing.getBand(line.item_id, today);
      if (band) {
        const requested = Money.of(line.quoted_unit_price);
        const floor = Money.of(band.floorPrice);
        const inBand = requested.isGreaterThanOrEqual(floor);
        validationResults.push({
          itemId: String(line.item_id),
          inBand,
          floorPrice: band.floorPrice,
          quotedPrice: String(line.quoted_unit_price),
        });
      } else {
        validationResults.push({
          itemId: String(line.item_id),
          inBand: true,
          floorPrice: String(line.floor_price_snapshot || '0.00'),
          quotedPrice: String(line.quoted_unit_price),
        });
      }
    }

    const targetSiteId =
      siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)
        ? siteId
        : String(quote.site_id);

    const { orderId, orderNo } = await this.knex.transaction(async (trx) => {
      const genOrderNo = await this.docNumber.next('SALES_ORDER', targetSiteId, null, trx);
      const anyBelowFloor = validationResults.some((r) => !r.inBand);
      const orderStatus = anyBelowFloor ? 'PENDING_APPROVAL' : 'CONFIRMED';

      const [newOrder] = await trx('sales_orders')
        .insert({
          order_no: genOrderNo,
          customer_id: quote.customer_id,
          fulfillment_site_id: targetSiteId,
          order_status: orderStatus,
          total_amount: String(quote.total_amount || '0.00'),
          delivery_date: today,
          delivery_time_window: '10-12',
          credit_flag: 'OK',
          payment_terms: 'CREDIT',
          source_quote_id: quoteId,
          confirmed_at: orderStatus === 'CONFIRMED' ? new Date() : null,
          created_by: userId,
          updated_by: userId,
        })
        .returning(['id', 'order_no']);

      for (const line of quoteLines) {
        const lineTotal = Money.of(line.quoted_unit_price).mul(line.qty);
        await trx('sales_order_lines').insert({
          order_id: newOrder.id,
          item_id: line.item_id,
          ordered_qty: line.qty,
          quoted_unit_price: line.quoted_unit_price,
          floor_price_snapshot: line.floor_price_snapshot || line.quoted_unit_price,
          target_price_snapshot: line.target_price_snapshot || line.quoted_unit_price,
          landed_cost_snapshot: line.landed_cost_snapshot || '0.00',
          margin_pct_snapshot: line.margin_pct_snapshot ?? null,
          line_margin_pct: line.margin_pct_snapshot ?? null,
          line_total: lineTotal.toStorageString(),
          created_by: userId,
          updated_by: userId,
        });
      }

      await trx('quotes').where('id', quoteId).update({
        status: 'CONVERTED',
        updated_by: userId,
        updated_at: new Date(),
      });

      return { orderId: String(newOrder.id), orderNo: String(newOrder.order_no) };
    });

    return {
      quoteId,
      quoteNo: quote.quote_no,
      orderId,
      orderNo,
      status: 'CONVERTED',
      totalAmount: quote.total_amount,
      validUntil: quote.valid_until,
      customer: String(quote.customer_id),
      site: targetSiteId,
      conversionInstructions: `Converted to Sales Order ${orderNo}`,
      priceValidation: validationResults,
    };
  }
}
