import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { POService } from './po.service.js';
import { CreatePODto, ConfirmQuantitiesDto } from './dto/po.dto.js';

@ApiTags('Procurement - Purchase Orders')
@ApiBearerAuth()
@Controller('procurement/purchase-orders')
@UseGuards(JwtAuthGuard, RbacGuard)
export class POController {
  constructor(private readonly poService: POService) {}

  @Post()
  @RequirePermission('po.create')
  @ApiOperation({ summary: 'Create a new purchase order (DRAFT)' })
  @ApiResponse({ status: 201, description: 'PO created' })
  async create(@Body() dto: CreatePODto, @Query('userId') userId: string) {
    const linesWithUser = dto.lines.map(line => ({ ...line, userId }));
    return this.poService.create({
      supplierId: dto.supplierId,
      receivingSiteId: dto.receivingSiteId,
      lines: linesWithUser,
      expectedDelivery: dto.expectedDelivery,
      linkedSalesOrderId: dto.linkedSalesOrderId,
      userId,
    });
  }

  @Get()
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'List purchase orders' })
  @ApiResponse({ status: 200, description: 'List of POs' })
  async list(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('siteId') siteId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.poService.list({ status, supplierId, siteId, limit, offset });
  }

  @Get(':id')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Get PO by ID with lines' })
  @ApiResponse({ status: 200, description: 'PO details with lines' })
  async getById(@Param('id') id: string) {
    const po = await this.poService.getById(id);
    const lines = await this.poService.getLines(id);
    return { ...po, lines };
  }

  @Get(':id/lines')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Get PO lines' })
  @ApiResponse({ status: 200, description: 'PO lines' })
  async getLines(@Param('id') id: string) {
    return this.poService.getLines(id);
  }

  @Post(':id/confirm-quantities')
  @RequirePermission('po.confirm')
  @ApiOperation({ summary: 'Confirm quantities and prices (BR-03 price spike check)' })
  @ApiResponse({ status: 200, description: 'Quantities confirmed' })
  async confirmQuantities(
    @Param('id') poId: string,
    @Body() dto: ConfirmQuantitiesDto,
    @Query('userId') userId: string,
  ) {
    return this.poService.confirmQuantities({ poId, confirmations: dto.confirmations.map(c => ({ ...c, userId })) });
  }

  @Post(':id/issue')
  @RequirePermission('po.issue')
  @ApiOperation({ summary: 'Issue PO (DRAFT/PENDING_APPROVAL -> ISSUED)' })
  @ApiResponse({ status: 200, description: 'PO issued' })
  async issuePO(@Param('id') poId: string, @Query('userId') userId: string) {
    return this.poService.issuePO({ poId, userId });
  }

  @Post(':id/cancel')
  @RequirePermission('po.cancel')
  @ApiOperation({ summary: 'Cancel PO' })
  @ApiResponse({ status: 200, description: 'PO cancelled' })
  async cancelPO(@Param('id') poId: string, @Query('userId') userId: string, @Query('reason') reason?: string) {
    return this.poService.cancelPO(poId, userId, reason);
  }

  @Get('sales-order/:salesOrderId')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Get POs linked to a sales order' })
  @ApiResponse({ status: 200, description: 'Linked POs' })
  async getPOsForSalesOrder(@Param('salesOrderId') salesOrderId: string) {
    return this.poService.getPOsForSalesOrder(salesOrderId);
  }
}