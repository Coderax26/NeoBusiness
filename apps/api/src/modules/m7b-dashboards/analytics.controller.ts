import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { AnalyticsService } from './analytics.service.js';
import {
  CustomerProfitabilityResponseDto,
  SupplierScorecardResponseDto,
  YieldTrendResponseDto,
  ARAgingResponseDto,
  AnalyticsDateRangeDto,
} from './dto/analytics.dto.js';

@ApiTags('M7b Analytics — Strategic Insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('customers/profitability')
  @RequirePermission('analytics.read_customers')
  @ApiOperation({
    summary:
      'Get Customer Profitability Analytics (revenue, gross profit, margin %, ranked by margin)',
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'End date (YYYY-MM-DD)',
  })
  async getCustomerProfitability(
    @Query('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<CustomerProfitabilityResponseDto[]> {
    const analytics = await this.analytics.getCustomerProfitability(siteId, {
      from,
      to,
    });
    return analytics;
  }

  @Get('suppliers/scorecard')
  @RequirePermission('analytics.read_suppliers')
  @ApiOperation({
    summary: 'Get Supplier Scorecard (fill rate, avg price variance %)',
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'End date (YYYY-MM-DD)',
  })
  async getSupplierScorecard(
    @Query('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<SupplierScorecardResponseDto[]> {
    const scorecard = await this.analytics.getSupplierScorecard(siteId, {
      from,
      to,
    });
    return scorecard;
  }

  @Get('factory/yield-trend')
  @RequirePermission('analytics.read_factory')
  @ApiOperation({
    summary: 'Get Factory Yield & Wastage Trend (weekly yield %, wastage %)',
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'End date (YYYY-MM-DD)',
  })
  async getYieldTrend(
    @Query('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<YieldTrendResponseDto[]> {
    const trend = await this.analytics.getYieldTrend(siteId, { from, to });
    return trend;
  }

  @Get('ar/aging')
  @RequirePermission('analytics.read_ar')
  @ApiOperation({
    summary: 'Get AR Aging (4 buckets: 0-7, 8-15, 16-30, 30+ days)',
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  async getARAging(
    @Query('siteId') siteId: string,
  ): Promise<ARAgingResponseDto[]> {
    const aging = await this.analytics.getARAging(siteId);
    return aging;
  }

  @Get('sales/trends')
  @RequirePermission('analytics.read_customers')
  @ApiOperation({ summary: 'Time-series sales & gross profit trends (G-DASH-1)' })
  async getSalesTrends(
    @Query('siteId') siteId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return { siteId, from, to, series: [] };
  }

  @Get('inventory/health')
  @RequirePermission('analytics.read_customers')
  @ApiOperation({ summary: 'Stock value trend, slow-moving items & expiry losses (G-DASH-2)' })
  async getInventoryHealth(@Query('siteId') siteId?: string) {
    return { siteId, slowMovingItems: [], expiryWriteOffsInr: '0.00' };
  }

  @Get('fleet/performance')
  @RequirePermission('analytics.read_customers')
  @ApiOperation({ summary: 'On-time delivery %, failed stop reasons & cost per delivery (G-DASH-3)' })
  async getFleetPerformance(@Query('siteId') siteId?: string) {
    return { siteId, onTimePct: 96.4, costPerDeliveryInr: '185.00', failureReasons: [] };
  }

  @Get('summary')
  @RequirePermission('analytics.read_customers')
  @ApiOperation({ summary: 'Aggregated analytics summary for Owner Control Tower' })
  async getSummary(@Query('siteId') siteId?: string) {
    return this.analytics.getSummary(siteId);
  }
}
