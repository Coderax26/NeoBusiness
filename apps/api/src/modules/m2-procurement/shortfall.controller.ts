import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { ShortfallService } from './shortfall.service.js';
import { CreateBackupPODto, UpdateShortfallStatusDto } from './dto/shortfall.dto.js';

@ApiTags('Procurement - Shortfalls & Backup POs')
@ApiBearerAuth()
@Controller('procurement/shortfalls')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ShortfallController {
  constructor(private readonly shortfallService: ShortfallService) {}

  @Get('po/:poId')
  @RequirePermission('grn.read')
  @ApiOperation({ summary: 'Get shortfalls for a PO' })
  @ApiResponse({ status: 200, description: 'PO shortfalls' })
  async getShortfallsForPO(@Param('poId') poId: string) {
    return this.shortfallService.getShortfallsForPO(poId);
  }

  @Get('supplier/:supplierId/coverable')
  @RequirePermission('po.create')
  @ApiOperation({ summary: 'Get shortfalls that can be covered by a supplier' })
  @ApiResponse({ status: 200, description: 'Coverable shortfalls for supplier' })
  async getCoverableShortfallsForSupplier(@Param('supplierId') supplierId: string) {
    return this.shortfallService.getCoverableShortfallsForSupplier(supplierId);
  }

  @Get('all/open')
  @RequirePermission('grn.read')
  @ApiOperation({ summary: 'Get all open shortfalls' })
  @ApiResponse({ status: 200, description: 'All open shortfalls' })
  async getAllOpenShortfalls(@Query('siteId') siteId?: string) {
    return this.shortfallService.getAllOpenShortfalls(siteId);
  }

  @Get('item/:itemId/ranked-backups')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Get ranked backup suppliers for an item' })
  @ApiResponse({ status: 200, description: 'Ranked backup suppliers' })
  async getRankedBackups(
    @Param('itemId') itemId: string,
    @Query('referencePrice') referencePrice: string,
    @Query('excludeSupplierId') excludeSupplierId?: string,
  ) {
    return this.shortfallService.getRankedBackups(itemId, referencePrice, excludeSupplierId);
  }

  @Post('create-backup-po')
  @RequirePermission('po.create')
  @ApiOperation({ summary: 'Create a backup PO for a shortfall' })
  @ApiResponse({ status: 201, description: 'Backup PO created' })
  async createBackupPO(@Body() dto: CreateBackupPODto, @Query('userId') userId: string, @Query('originalPoId') originalPoId: string) {
    return this.shortfallService.createBackupPO({
      originalPoId,
      shortfallId: dto.shortfallId,
      backupSupplierId: dto.backupSupplierId,
      userId,
    });
  }

  @Post('auto-resolve/:poId')
  @RequirePermission('po.create')
  @ApiOperation({ summary: 'Auto-resolve all open shortfalls for a PO using ranked backups' })
  @ApiResponse({ status: 200, description: 'Auto-resolution result' })
  async autoResolveShortfalls(@Param('poId') poId: string, @Query('userId') userId: string) {
    return this.shortfallService.autoResolveShortfalls(poId, userId);
  }

  @Put(':id/status')
  @RequirePermission('grn.update')
  @ApiOperation({ summary: 'Update shortfall status' })
  @ApiResponse({ status: 200, description: 'Shortfall status updated' })
  async updateStatus(
    @Param('id') shortfallId: string,
    @Body() dto: UpdateShortfallStatusDto,
    @Query('userId') userId: string,
  ) {
    return this.shortfallService.updateShortfallStatus(shortfallId, dto.status, userId);
  }
}