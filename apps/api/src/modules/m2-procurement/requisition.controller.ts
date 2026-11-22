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
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { RequisitionService } from './requisition.service.js';
import { CreateRequisitionDto, ConvertToPODto } from './dto/requisition.dto.js';

@ApiTags('Procurement - Requisitions')
@ApiBearerAuth()
@Controller('procurement/requisitions')
@UseGuards(JwtAuthGuard, RbacGuard)
export class RequisitionController {
  constructor(private readonly requisitionService: RequisitionService) {}

  @Post()
  @RequirePermission('requisition.create')
  @ApiOperation({ summary: 'Create a purchase requisition' })
  @ApiResponse({ status: 201, description: 'Requisition created' })
  async create(
    @Body() dto: CreateRequisitionDto,
    @Query('userId') userId?: string,
    @Query('requestedBy') requestedBy?: string,
    @Req() req?: any,
  ) {
    const actorId = userId || req?.user?.sub || req?.user?.id;
    return this.requisitionService.create({
      ...dto,
      requestedBy: requestedBy || actorId,
      userId: actorId,
    });
  }

  @Get()
  @RequirePermission('requisition.read')
  @ApiOperation({ summary: 'List requisitions' })
  @ApiResponse({ status: 200, description: 'List of requisitions' })
  async list(
    @Query('status') status?: string,
    @Query('itemId') itemId?: string,
    @Query('source') source?: string,
    @Query('sourceRefId') sourceRefId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.requisitionService.list({
      status,
      itemId,
      source: source as any,
      sourceRefId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      limit,
      offset,
    });
  }

  @Get(':id')
  @RequirePermission('requisition.read')
  @ApiOperation({ summary: 'Get requisition by ID' })
  @ApiResponse({ status: 200, description: 'Requisition details' })
  async getById(@Param('id') id: string) {
    return this.requisitionService.getById(id);
  }

  @Get('grouped/by-supplier')
  @RequirePermission('requisition.read')
  @ApiOperation({ summary: 'Group open requisitions by primary supplier' })
  @ApiResponse({ status: 200, description: 'Requisitions grouped by supplier' })
  async getGroupedBySupplier(@Query('siteId') siteId?: string) {
    return this.requisitionService.getGroupedBySupplier(siteId);
  }

  @Post('convert-to-po')
  @RequirePermission('po.create')
  @ApiOperation({ summary: 'Convert requisitions to a PO for a supplier' })
  @ApiResponse({ status: 201, description: 'PO created from requisitions' })
  async convertToPO(
    @Body() dto: ConvertToPODto,
    @Query('userId') userId?: string,
    @Req() req?: any,
  ) {
    const actorId = userId || req?.user?.sub || req?.user?.id;
    return this.requisitionService.convertToPO(
      dto.supplierId,
      dto.requisitionIds,
      actorId,
    );
  }

  @Post(':id/cancel')
  @RequirePermission('requisition.update')
  @ApiOperation({ summary: 'Cancel requisition' })
  @ApiResponse({ status: 200, description: 'Requisition cancelled' })
  async cancel(
    @Param('id') id: string,
    @Query('userId') userId?: string,
    @Req() req?: any,
  ) {
    const actorId = userId || req?.user?.sub || req?.user?.id;
    return this.requisitionService.cancel(id, actorId);
  }

  @Get('source/:source/:sourceRefId')
  @RequirePermission('requisition.read')
  @ApiOperation({
    summary: 'Get requisitions by source (production order or sales order)',
  })
  @ApiResponse({ status: 200, description: 'Requisitions for source' })
  async getBySource(
    @Param('source') source: 'PRODUCTION' | 'SALES_ORDER',
    @Param('sourceRefId') sourceRefId: string,
  ) {
    return this.requisitionService.getBySource(source, sourceRefId);
  }
}
