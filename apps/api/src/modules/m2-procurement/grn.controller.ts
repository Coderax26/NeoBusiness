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
import { GRNService } from './grn.service.js';
import { CreateGRNDto, BlindReceiveLineDto } from './dto/grn.dto.js';

@ApiTags('Procurement - Goods Receipts (GRN)')
@ApiBearerAuth()
@Controller('procurement/grns')
@UseGuards(JwtAuthGuard, RbacGuard)
export class GRNController {
  constructor(private readonly grnService: GRNService) {}

  @Post()
  @RequirePermission('grn.create')
  @ApiOperation({ summary: 'Create a blind GRN (storekeeper view)' })
  @ApiResponse({
    status: 201,
    description: 'GRN created with shortfalls if any',
  })
  async create(
    @Body() dto: CreateGRNDto,
    @Query('userId') userId?: string,
    @Req() req?: any,
  ) {
    const actorId = userId || req?.user?.sub || req?.user?.id;
    return this.grnService.createBlindGRN({ ...dto, userId: actorId });
  }

  @Get()
  @RequirePermission('grn.read')
  @ApiOperation({ summary: 'List GRNs' })
  @ApiResponse({ status: 200, description: 'List of GRNs' })
  async list(
    @Query('poId') poId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('siteId') siteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.grnService.list({
      poId,
      supplierId,
      siteId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      limit,
      offset,
    });
  }

  @Get(':id')
  @RequirePermission('grn.read')
  @ApiOperation({ summary: 'Get GRN by ID' })
  @ApiResponse({ status: 200, description: 'GRN details' })
  async getById(@Param('id') id: string) {
    return this.grnService.getById(id);
  }

  @Get(':id/lines')
  @RequirePermission('grn.read')
  @ApiOperation({
    summary: 'Get GRN lines (blind view - no expected qty or price)',
  })
  @ApiResponse({ status: 200, description: 'GRN lines' })
  async getLines(@Param('id') id: string) {
    return this.grnService.getLines(id);
  }

  @Get('po/:poId/blind-view')
  @RequirePermission('grn.read')
  @ApiOperation({
    summary: 'Get blind receive view for PO (item name + qty box only)',
  })
  @ApiResponse({ status: 200, description: 'Blind receive view' })
  async getBlindView(@Param('poId') poId: string) {
    return this.grnService.getBlindReceiveView(poId);
  }

  @Get('po/:poId/shortfalls')
  @RequirePermission('grn.read')
  @ApiOperation({ summary: 'Get shortfalls for a PO' })
  @ApiResponse({ status: 200, description: 'PO shortfalls' })
  async getShortfallsForPO(@Param('poId') poId: string) {
    return this.grnService.getShortfallsForPO(poId);
  }

  @Get('supplier/:supplierId/open-shortfalls')
  @RequirePermission('grn.read')
  @ApiOperation({ summary: 'Get open shortfalls for a supplier' })
  @ApiResponse({ status: 200, description: 'Open shortfalls' })
  async getOpenShortfallsForSupplier(@Param('supplierId') supplierId: string) {
    return this.grnService.getOpenShortfallsForSupplier(supplierId);
  }
}
