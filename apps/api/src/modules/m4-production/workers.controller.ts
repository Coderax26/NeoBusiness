import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';
import { AttendanceService } from './attendance.service.js';

@ApiTags('M4 Production - Workers')
@Controller('production/workers')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WorkersController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @RequirePermission('production.attendance.read')
  @ApiOperation({ summary: 'List active floor workers with today attendance' })
  @ApiQuery({ name: 'siteId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Worker directory with today hours' })
  async listWorkers(@Req() req: any, @Query('siteId') siteId?: string) {
    const resolvedSiteId = resolveUserSiteId(req.user, siteId);
    return this.attendanceService.listWorkers(resolvedSiteId);
  }
}
