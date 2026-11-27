import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { StockAlertsService } from './stock-alerts.service.js';
import {
  StockAlertResponseDto,
  StockAlertType,
} from './dto/stock-alerts.dto.js';

@ApiTags('M7b Stock Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('stock-alerts')
export class StockAlertsController {
  constructor(private readonly stockAlerts: StockAlertsService) {}

  @Get()
  @RequirePermission('stock.read_alerts')
  @ApiOperation({
    summary:
      'Get all stock alerts (LOW_STOCK, EXPIRING_SOON, OVERCOMMITTED, OUT_OF_STOCK)',
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  async getAlerts(
    @Query('siteId') siteId: string,
  ): Promise<StockAlertResponseDto[]> {
    const alerts = await this.stockAlerts.getAlerts(siteId);
    return alerts;
  }

  @Get('counts')
  @RequirePermission('stock.read_alerts')
  @ApiOperation({ summary: 'Get alert counts by type for dashboard badges' })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  async getAlertCounts(@Query('siteId') siteId: string): Promise<{
    outOfStock: number;
    lowStock: number;
    expiringSoon: number;
    overcommitted: number;
    total: number;
  }> {
    return this.stockAlerts.getAlertCounts(siteId);
  }

  @Get('by-type')
  @RequirePermission('stock.read_alerts')
  @ApiOperation({ summary: 'Get stock alerts filtered by type' })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  @ApiQuery({
    name: 'type',
    required: true,
    enum: StockAlertType,
    description: 'Alert type',
  })
  async getAlertsByType(
    @Query('siteId') siteId: string,
    @Query('type') type: StockAlertType,
  ): Promise<StockAlertResponseDto[]> {
    const alerts = await this.stockAlerts.getAlertsByType(siteId, type);
    return alerts;
  }
}
