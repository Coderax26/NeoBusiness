import { Controller, Get, Put, Body, Param, Query, UseGuards, Req, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { PricingService } from './pricing.service.js';
import { PublishPricesDto, GetPricesQueryDto } from './dto/pricing.dto.js';

@Controller('prices')
@UseGuards(JwtAuthGuard)
export class PricingController {
  constructor(private readonly pricingSvc: PricingService) {}

  /**
   * GET /prices/today - Get today's price band for all active items
   * Returns: array of { itemId, skuCode, itemName, category, uom, landedCost, floorPrice, targetPrice, minMarginPct, source, publishedAt }
   */
  @Get('today')
  @RequirePermission('price.set_daily')
  async getTodayPrices(@Query() q: GetPricesQueryDto) {
    const date = q.date ?? new Date().toISOString().split('T')[0];
    return this.pricingSvc.getPricesForDate(date, { itemCategory: q.itemCategory });
  }

  /**
   * GET /prices/:date - Get price band for specific date
   */
  @Get(':date')
  @RequirePermission('price.set_daily')
  async getPricesForDate(@Param('date') date: string, @Query() q: GetPricesQueryDto) {
    return this.pricingSvc.getPricesForDate(date, { itemCategory: q.itemCategory });
  }

  /**
   * PUT /prices/:date - Bulk upsert daily prices (OWNER only)
   * Body: { items: [{ itemId, landedCost, floorPrice?, targetPrice?, source? }] }
   * If floorPrice/targetPrice omitted, they are auto-calculated.
   */
  @Put(':date')
  @RequirePermission('price.set_daily')
  async upsertPrices(@Param('date') date: string, @Body() dto: PublishPricesDto, @Req() req: any) {
    const updatedItemIds = await this.pricingSvc.upsertDailyPrices(
      date,
      dto.items.map(i => ({
        itemId: i.itemId,
        landedCost: i.latestLandedCost,
        floorPrice: i.floorPrice,
        targetPrice: i.targetPrice,
        source: i.source as 'AUTO' | 'MANUAL' | undefined,
      })),
      req.user.id,
    );

    // Publish price.updated events
    await this.pricingSvc.publishPrices(updatedItemIds, req.user.id);

    return { updated: updatedItemIds.length, itemIds: updatedItemIds, date };
  }

  /**
   * GET /prices/missing/:date - Get items missing prices for a date (Owner alert)
   */
  @Get('missing/:date')
  @RequirePermission('price.set_daily')
  async getMissingPrices(@Param('date') date: string, @Query('itemCategory') itemCategory?: string) {
    return this.pricingSvc.getItemsMissingPrices(date, { itemCategory });
  }
}