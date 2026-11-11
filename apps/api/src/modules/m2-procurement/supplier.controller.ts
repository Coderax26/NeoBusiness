import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { SupplierService } from './supplier.service.js';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  LinkSupplierItemDto,
  AddRateQuoteDto,
} from './dto/supplier.dto.js';

@ApiTags('Procurement - Suppliers')
@ApiBearerAuth()
@Controller('procurement/suppliers')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @RequirePermission('supplier.create')
  @ApiOperation({ summary: 'Create a new supplier' })
  @ApiResponse({ status: 201, description: 'Supplier created' })
  async create(
    @Body() dto: CreateSupplierDto,
    @Query('userId') userId: string,
  ) {
    return this.supplierService.create({ ...dto, userId });
  }

  @Get()
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'List suppliers' })
  @ApiResponse({ status: 200, description: 'List of suppliers' })
  async list(
    @Query('isActive') isActive?: boolean,
    @Query('isApproved') isApproved?: boolean,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.supplierService.list({ isActive, isApproved, limit, offset });
  }

  @Get(':id')
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'Get supplier by ID' })
  @ApiResponse({ status: 200, description: 'Supplier details' })
  async getById(@Param('id') id: string) {
    return this.supplierService.getById(id);
  }

  @Get('code/:code')
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'Get supplier by code' })
  @ApiResponse({ status: 200, description: 'Supplier details' })
  async getByCode(@Param('code') code: string) {
    return this.supplierService.getByCode(code);
  }

  @Put(':id')
  @RequirePermission('supplier.update')
  @ApiOperation({ summary: 'Update supplier' })
  @ApiResponse({ status: 200, description: 'Supplier updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @Query('userId') userId: string,
  ) {
    return this.supplierService.update(id, { ...dto, userId });
  }

  @Post(':id/items/:itemId')
  @RequirePermission('supplier.update')
  @ApiOperation({ summary: 'Link supplier to item' })
  @ApiResponse({ status: 200, description: 'Supplier-item linked' })
  async linkItem(
    @Param('id') supplierId: string,
    @Param('itemId') itemId: string,
    @Body() dto: LinkSupplierItemDto,
    @Query('userId') userId: string,
  ) {
    return this.supplierService.linkItem(supplierId, itemId, {
      ...dto,
      userId,
    });
  }

  @Get(':id/items')
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'Get supplier items' })
  @ApiResponse({ status: 200, description: 'Supplier items' })
  async getSupplierItems(@Param('id') supplierId: string) {
    return this.supplierService.getSupplierItems(supplierId);
  }

  @Get('item/:itemId/approved')
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'Get approved suppliers for an item' })
  @ApiResponse({ status: 200, description: 'Approved suppliers for item' })
  async getApprovedSuppliersForItem(@Param('itemId') itemId: string) {
    return this.supplierService.getApprovedSuppliersForItem(itemId);
  }

  @Post(':id/rates')
  @RequirePermission('supplier.rate.manage')
  @ApiOperation({ summary: 'Add rate quote for supplier-item' })
  @ApiResponse({ status: 201, description: 'Rate quote added' })
  async addRateQuote(
    @Param('id') supplierId: string,
    @Body() dto: AddRateQuoteDto,
    @Query('userId') userId: string,
  ) {
    return this.supplierService.addRateQuote({ ...dto, supplierId, userId });
  }

  @Get(':id/rates/:itemId')
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'Get rate history for supplier-item' })
  @ApiResponse({ status: 200, description: 'Rate history' })
  async getRateHistory(
    @Param('id') supplierId: string,
    @Param('itemId') itemId: string,
    @Query('limit') limit?: number,
  ) {
    return this.supplierService.getRateHistory(supplierId, itemId, limit);
  }

  @Get(':id/latest-rate/:itemId')
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'Get latest rate for supplier-item' })
  @ApiResponse({ status: 200, description: 'Latest rate' })
  async getLatestRate(
    @Param('id') supplierId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.supplierService.getLatestRate(supplierId, itemId);
  }

  @Get(':id/performance')
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'Get supplier performance metrics' })
  @ApiResponse({ status: 200, description: 'Supplier performance' })
  async getPerformance(@Param('id') supplierId: string) {
    return this.supplierService.getPerformance(supplierId);
  }

  @Post(':id/update-reliability')
  @RequirePermission('supplier.update')
  @ApiOperation({ summary: 'Update supplier reliability score' })
  @ApiResponse({ status: 200, description: 'Reliability score updated' })
  async updateReliabilityScore(
    @Param('id') supplierId: string,
    @Query('userId') userId: string,
  ) {
    return this.supplierService.updateReliabilityScore(supplierId, userId);
  }

  @Get('alerts/missing-rates')
  @RequirePermission('supplier.read')
  @ApiOperation({ summary: 'Get suppliers missing recent rate quotes' })
  @ApiResponse({ status: 200, description: 'Suppliers with stale rates' })
  async getMissingRates(
    @Query('itemCategory') itemCategory?: string,
    @Query('daysThreshold') daysThreshold?: number,
  ) {
    return this.supplierService.getSuppliersMissingRates(
      itemCategory,
      daysThreshold,
    );
  }
}
