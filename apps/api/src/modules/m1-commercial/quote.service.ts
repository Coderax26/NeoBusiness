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

  /**
   * Get quote detail.
   */
  async findById(id: string) {
    const quote = await this.knex('quotes').where('id', id).first();
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);

    const lines = await this.knex('quote_lines').where('quote_id', id);
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
          inBand: true, // No band today, allow with warning
          floorPrice: 'N/A',
          quotedPrice: String(line.quoted_unit_price),
        });
      }
    }

    // Update quote status to CONVERTED
    await this.knex('quotes').where('id', quoteId).update({
      status: 'CONVERTED',
      updated_by: userId,
      updated_at: new Date(),
    });

    return {
      quoteId: quoteId,
      quoteNo: quote.quote_no,
      status: 'CONVERTED',
      totalAmount: quote.total_amount,
      validUntil: quote.valid_until,
      customer: String(quote.customer_id),
      site: String(quote.site_id),
      conversionInstructions: 'POST /orders with quoteId in body to convert',
      priceValidation: validationResults,
    };
  }
}
