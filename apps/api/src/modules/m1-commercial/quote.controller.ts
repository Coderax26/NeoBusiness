import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { PdfGeneratorService } from '../../shared/services/pdf-generator.service.js';
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
  async create(
    @Body()
    dto: {
      customerId: string;
      siteId: string;
      lines: Array<{ itemId: string; qty: string; requestedPrice: string }>;
      validUntil?: string;
    },
    @Req() req: any,
  ) {
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
  async list(
    @Query()
    q: {
      siteId?: string;
      customerId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    return this.quoteSvc.list(q);
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
  async convert(
    @Param('id') id: string,
    @Body() dto: { fulfillmentSiteId?: string },
    @Req() req: any,
  ) {
    const userId = String(req.user?.sub || req.user?.id || '');
    const siteId = dto?.fulfillmentSiteId || req.user?.siteId || '';
    return this.quoteSvc.convertToOrder(id, siteId, userId);
  }

  /**
   * GET /quotes/:id/pdf - Server-rendered Quote PDF (G-DOC-2)
   */
  @Get(':id/pdf')
  @RequirePermission('quote.view')
  async getPdf(@Param('id') id: string, @Res() res: any) {
    const quote = await this.quoteSvc.findById(id);
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);

    const customer = await this.quoteSvc['knex']('customers').where('id', quote.customer_id).first();
    const site = await this.quoteSvc['knex']('sites').where('id', quote.site_id).first();

    const pdfGen = new PdfGeneratorService();
    const buffer = await pdfGen.generateQuote({
      quoteNo: quote.quote_no,
      quoteDate: new Date(quote.created_at).toISOString().split('T')[0],
      validUntil: quote.valid_until ? new Date(quote.valid_until).toISOString().split('T')[0] : undefined,
      customerName: customer?.business_name || 'Customer',
      siteName: site?.name || 'NeoBus',
      lines: (quote.lines || []).map((l: any) => ({
        itemName: l.item_name || 'Item',
        qty: String(l.qty),
        unitPrice: String(l.quoted_unit_price || '0'),
        lineTotal: String(l.line_total || '0'),
      })),
      totalAmount: String(quote.total_amount || '0'),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Quote-${quote.quote_no}.pdf"`);
    res.send(buffer);
  }

  /**
   * POST /quotes/:id/mark-lost - Mark quote as lost (G-M1-2)
   */
  @Post(':id/mark-lost')
  @RequirePermission('quote.create')
  async markLost(@Param('id') id: string, @Body('reason') reason?: string) {
    const quote = await this.quoteSvc.findById(id);
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);
    await this.quoteSvc['knex']('quotes').where('id', id).update({
      status: 'LOST',
      notes: reason ? `Lost reason: ${reason}` : 'Lost',
      updated_at: new Date(),
    });
    return { success: true, status: 'LOST' };
  }

  /**
   * POST /quotes/:id/send - Mark quote as sent (G-M1-2)
   */
  @Post(':id/send')
  @RequirePermission('quote.create')
  async markSent(@Param('id') id: string) {
    const quote = await this.quoteSvc.findById(id);
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);
    await this.quoteSvc['knex']('quotes').where('id', id).update({
      status: 'SENT',
      updated_at: new Date(),
    });
    return { success: true, status: 'SENT' };
  }
}
