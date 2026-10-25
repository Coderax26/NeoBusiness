import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { QuoteService } from './quote.service.js';
import { Money } from '../../shared/utils/money.util.js';

@Controller('quotes')
@UseGuards(JwtAuthGuard)
export class QuoteController {
  constructor(private readonly quoteSvc: QuoteService) {}

  /**
   * POST /quotes - Create quote
   */
  @Post()
  @RequirePermission('quote.create')
  async create(@Body() dto: {
    customerId: string;
    siteId: string;
    lines: Array<{ itemId: string; qty: string; requestedPrice: string }>;
    validUntil?: string;
  }, @Req() req: any) {
    return this.quoteSvc.create({
      customerId: dto.customerId,
      siteId: dto.siteId,
      lines: dto.lines,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      userId: req.user.id,
    });
  }

  /**
   * GET /quotes - List quotes
   */
  @Get()
  @RequirePermission('quote.view')
  async list(@Query() q: { customerId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = Math.min(q.limit ?? 50, 100);
    const offset = q.offset ?? 0;

    let query = this.quoteSvc['knex']('quotes').orderBy('created_at', 'desc').limit(limit).offset(offset);

    if (q.customerId) query.andWhere('customer_id', q.customerId);
    if (q.status) query.andWhere('status', q.status);

    return query;
  }

  /**
   * GET /quotes/:id - Get quote detail
   */
  @Get(':id')
  @RequirePermission('quote.view')
  async getOne(@Param('id') id: string) {
    return this.quoteSvc.findById(id);
  }

  /**
   * POST /quotes/:id/convert - Convert quote to order
   */
  @Post(':id/convert')
  @RequirePermission('order.create')
  async convert(@Param('id') id: string, @Body() dto: { fulfillmentSiteId?: string }, @Req() req: any) {
    const quote = await this.quoteSvc.findById(id);

    if (quote.status === 'EXPIRED') {
      throw new BadRequestException('Expired quotes cannot be converted. Create a new quote.');
    }
    if (quote.status === 'CONVERTED') {
      throw new BadRequestException('Quote already converted to order.');
    }

    // Re-validate quote lines against current band before conversion
    const today = new Date().toISOString().split('T')[0];
    const quoteLines = quote.lines as Array<{
      item_id: string;
      qty: string;
      quoted_unit_price: string;
      floor_price_snapshot: string;
    }>;

    // Check if quoted prices are still in-band against today's floor
    const validationResults: Array<{
      itemId: string;
      inBand: boolean;
      floorPrice: string;
      quotedPrice: string;
    }> = [];

    for (const line of quoteLines) {
      const band = await this.quoteSvc['pricing'].getBand(line.item_id, today);
      if (band) {
        const requested = Money.of(line.quoted_unit_price);
        const floor = Money.of(band.floorPrice);
        const inBand = requested.isGreaterThanOrEqual(floor);
        validationResults.push({
          itemId: line.item_id,
          inBand,
          floorPrice: band.floorPrice,
          quotedPrice: line.quoted_unit_price,
        });
      }
    }

    return {
      quoteId: id,
      quoteNo: quote.quote_no,
      status: quote.status,
      totalAmount: quote.total_amount,
      validUntil: quote.valid_until,
      customer: quote.customer_id,
      site: quote.site_id,
      conversionInstructions: 'POST /orders with quoteId in body to convert',
      priceValidation: validationResults,
    };
  }
}