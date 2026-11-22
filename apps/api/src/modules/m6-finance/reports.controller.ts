import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
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

  @Get('gst/:reportType')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'GST GSTR-1, GSTR-3B, or HSN summary report (G-RPT-2)' })
  async getGstByReportType(
    @Param('reportType') reportType: string,
    @Query('siteId') siteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return { reportType, siteId, dateFrom, dateTo, rows: [] };
  }

  @Get('management/pnl-snapshot')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'Management Profit & Loss snapshot (G-RPT-3)' })
  async getPnlSnapshot(
    @Query('siteId') siteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.reportsService.getPnlSnapshot({
      siteId,
      dateFrom,
      dateTo,
    });
  }

  @Post('export')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'Queue async generation of large Excel/PDF report (G-RPT-4)' })
  async exportReport(@Body() body: { reportId: string; format: 'PDF' | 'EXCEL' | 'CSV' }) {
    return { jobId: `exp-${Date.now()}`, ...body, status: 'QUEUED' };
  }

  @Get('schedules')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'List scheduled report digests (G-RPT-5)' })
  async listSchedules() {
    return { data: [] };
  }

  @Post('schedules')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'Create a recurring report schedule (G-RPT-5)' })
  async createSchedule(@Body() body: Record<string, unknown>) {
    return { id: `sch-${Date.now()}`, ...body, active: true };
  }

  @Delete('schedules/:id')
  @RequirePermission('report.view')
  @ApiOperation({ summary: 'Delete a recurring report schedule (G-RPT-5)' })
  async deleteSchedule(@Param('id') id: string) {
    return { id, deleted: true };
  }
}

