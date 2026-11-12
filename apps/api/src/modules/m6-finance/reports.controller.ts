import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { ReportsService } from './reports.service.js';

@ApiTags('M6 Finance — Statutory & Management Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /reports/sales-register - Sales register report (G-RPT-1)
   */
  @Get('sales-register')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'Aggregated sales register with tax breakdown (G-RPT-1)' })
  async getSalesRegister(
    @Query('siteId') siteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.reportsService.getSalesRegister({
      siteId,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
  }

  /**
   * GET /reports/purchase-register - Purchase register report (G-RPT-1)
   */
  @Get('purchase-register')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'Aggregated purchase register with tax breakdown (G-RPT-1)' })
  async getPurchaseRegister(
    @Query('siteId') siteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.reportsService.getPurchaseRegister({
      siteId,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
  }

  /**
   * GET /reports/gst/summary - GST return summary GSTR-1/3B (G-RPT-2)
   */
  @Get('gst/summary')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'GST return summary with B2B/B2C and ITC totals (G-RPT-2)' })
  async getGstSummary(
    @Query('siteId') siteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.reportsService.getGstSummary({
      siteId,
      dateFrom,
      dateTo,
    });
  }
}

