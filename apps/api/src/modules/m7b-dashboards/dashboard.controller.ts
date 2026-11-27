import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';
import { DashboardService } from './dashboard.service.js';
import {
  PulseResponseDto,
  StatusMatrixResponseDto,
  EODViewResponseDto,
  KPIResponseDto,
  DashboardQueryDto,
  EODQueryDto,
  KPIQueryDto,
} from './dto/dashboard.dto.js';

@ApiTags('M7b Dashboards — Owner Pulse & Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('pulse')
  @RequirePermission('dashboard.read_pulse')
  @ApiOperation({
    summary: "Get Owner Pulse Header (today's sales, margin, cash, exceptions)",
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  async getPulse(
    @Query('siteId') siteId: string,
    @Req() req: any,
  ): Promise<PulseResponseDto> {
    const role = req.user?.role;
    const pulse = await this.dashboard.getPulse(siteId, { role });
    return pulse;
  }

  @Get('status-matrix')
  @RequirePermission('dashboard.read_status')
  @ApiOperation({
    summary:
      'Get Operational Status Matrix (orders, batches, trucks, shortfalls)',
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  async getStatusMatrix(
    @Query('siteId') siteId: string,
    @Req() req: any,
  ): Promise<StatusMatrixResponseDto> {
    const role = req.user?.role;
    const matrix = await this.dashboard.getStatusMatrix(siteId, { role });
    return matrix;
  }

  @Get('eod')
  @RequirePermission('dashboard.read_eod')
  @ApiOperation({
    summary: 'Get EOD Dashboard (wallets, handovers, deposit slip, sign-off)',
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'EOD date (YYYY-MM-DD)',
  })
  async getEODView(
    @Query('siteId') siteId: string,
    @Query('date') date: string,
  ): Promise<EODViewResponseDto> {
    const eod = await this.dashboard.getEODView(siteId, date);
    return eod;
  }

  @Get('kpis')
  @RequirePermission('dashboard.read_kpis')
  @ApiOperation({
    summary:
      'Get KPI Queries (owner call volume, EOD time, missed entries, margin erosion, ePOD, order confirmation)',
  })
  @ApiQuery({ name: 'siteId', required: true, description: 'Site UUID' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'KPI date (YYYY-MM-DD)',
  })
  async getKPIs(
    @Query('siteId') siteId: string,
    @Query('date') date: string,
  ): Promise<KPIResponseDto> {
    const kpis = await this.dashboard.getKPIs(siteId, date);
    return kpis;
  }

  @Get('home-summary')
  @RequirePermission('orders.read')
  @ApiOperation({
    summary: 'Get live role-aware summary for /home (KPIs, ops matrix, AR aging, todo counts)',
  })
  @ApiQuery({ name: 'siteId', required: false, description: 'Optional site UUID filter' })
  async getHomeSummary(
    @Query('siteId') querySiteId: string | undefined,
    @Req() req: any,
  ) {
    const siteId =
      querySiteId ||
      (req.user?.role === 'OWNER' ? undefined : resolveUserSiteId(req.user));
    return this.dashboard.getHomeSummary(req.user?.role, siteId);
  }
}
