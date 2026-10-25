import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { ItemService } from './item.service.js';
import { CreateItemDto, UpdateItemDto, CreateUomConversionDto } from './dto/item.dto.js';

@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemController {
  constructor(private readonly itemSvc: ItemService) {}

  /**
   * POST /items - Create item (OWNER)
   */
  @Post()
  @RequirePermission('item.modify')
  async create(@Body() dto: CreateItemDto, @Req() req: any) {
    return this.itemSvc.create({
      skuCode: dto.skuCode,
      name: dto.name,
      itemCategory: dto.itemCategory,
      primaryUom: dto.primaryUom,
      secondaryUom: dto.secondaryUom,
      shelfLifeDays: dto.shelfLifeDays,
      taxRatePct: dto.taxRatePct,
      hsnCode: dto.hsnCode,
      isCatchWeight: dto.isCatchWeight,
      standardWeightPerSecondaryKg: dto.standardWeightPerSecondaryKg,
      minMarginPct: dto.minMarginPct,
      taxTreatment: dto.taxTreatment,
      isActive: dto.isActive,
      userId: req.user.id,
    });
  }

  /**
   * GET /items - List items (RLS-scoped via M0 middleware)
   */
  @Get()
  @RequirePermission('item.view')
  async list(@Query() q: { itemCategory?: string; isActive?: string; search?: string }) {
    return this.itemSvc.findAll({
      itemCategory: q.itemCategory,
      isActive: q.isActive === 'true' ? true : q.isActive === 'false' ? false : undefined,
      search: q.search,
    });
  }

  /**
   * GET /items/:id - Get item detail
   */
  @Get(':id')
  @RequirePermission('item.view')
  async getOne(@Param('id') id: string) {
    return this.itemSvc.findById(id);
  }

  /**
   * GET /items/sku/:skuCode - Get item by SKU
   */
  @Get('sku/:skuCode')
  @RequirePermission('item.view')
  async getBySku(@Param('skuCode') skuCode: string) {
    const item = await this.itemSvc.findBySku(skuCode);
    if (!item) throw new NotFoundException(`Item with SKU ${skuCode} not found`);
    return item;
  }

  /**
   * PATCH /items/:id - Update item (OWNER)
   */
  @Patch(':id')
  @RequirePermission('item.modify')
  async update(@Param('id') id: string, @Body() dto: UpdateItemDto, @Req() req: any) {
    return this.itemSvc.update(id, {
      name: dto.name,
      itemCategory: dto.itemCategory,
      primaryUom: dto.primaryUom,
      secondaryUom: dto.secondaryUom,
      shelfLifeDays: dto.shelfLifeDays,
      taxRatePct: dto.taxRatePct,
      hsnCode: dto.hsnCode,
      isCatchWeight: dto.isCatchWeight,
      standardWeightPerSecondaryKg: dto.standardWeightPerSecondaryKg,
      minMarginPct: dto.minMarginPct,
      taxTreatment: dto.taxTreatment,
      isActive: dto.isActive,
      userId: req.user.id,
    });
  }

  /**
   * POST /items/:id/uom - Add UoM conversion
   */
  @Post(':id/uom')
  @RequirePermission('item.modify')
  async addUomConversion(@Param('id') id: string, @Body() dto: CreateUomConversionDto, @Req() req: any) {
    return this.itemSvc.addUomConversion({
      itemId: id,
      fromUom: dto.fromUom,
      toUom: dto.toUom,
      factor: dto.factor,
      userId: req.user.id,
    });
  }

  /**
   * GET /items/:id/uom - List UoM conversions
   */
  @Get(':id/uom')
  @RequirePermission('item.view')
  async getUomConversions(@Param('id') id: string) {
    return this.itemSvc.getUomConversions(id);
  }
}