import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AttendanceService } from './attendance.service.js';
import {
  CreateAttendanceDto,
  AttendanceResponseDto,
} from './dto/attendance.dto.js';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { RbacGuard } from '../m0-platform/rbac.service.js';

@ApiTags('M4 Production - Attendance')
@Controller('production/attendance')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  @RequirePermission('production.attendance.create')
  @ApiOperation({ summary: 'Log worker attendance' })
  @ApiResponse({
    status: 201,
    description: 'Attendance logged',
    type: AttendanceResponseDto,
  })
  async logAttendance(
    @Body() dto: CreateAttendanceDto,
    @Req() req: any,
  ): Promise<AttendanceResponseDto> {
    return this.attendanceService.logAttendance(dto, req.user.sub);
  }

  @Get()
  @RequirePermission('production.attendance.read')
  @ApiOperation({ summary: 'List attendance records for a site' })
  @ApiQuery({ name: 'siteId', required: true, type: String })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of attendance records',
    type: [AttendanceResponseDto],
  })
  async listAttendance(
    @Query('siteId') siteId?: string,
    @Query('date') date?: string,
  ): Promise<AttendanceResponseDto[]> {
    return this.attendanceService.listAttendance(siteId, date);
  }

  @Get('worker/:workerId')
  @RequirePermission('production.attendance.read')
  @ApiOperation({ summary: 'Get attendance records for a worker' })
  @ApiParam({ name: 'workerId', type: String })
  @ApiQuery({ name: 'siteId', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Attendance records for worker',
    type: [AttendanceResponseDto],
  })
  async getAttendanceByWorker(
    @Param('workerId') workerId: string,
    @Query('siteId') siteId?: string,
  ): Promise<AttendanceResponseDto[]> {
    return this.attendanceService.getAttendanceByWorker(workerId, siteId);
  }

  @Get('work-order/:woId')
  @RequirePermission('production.attendance.read')
  @ApiOperation({ summary: 'Get attendance records for a work order' })
  @ApiParam({ name: 'woId', type: String })
  @ApiResponse({
    status: 200,
    description: 'Attendance records for work order',
    type: [AttendanceResponseDto],
  })
  async getAttendanceByWo(
    @Param('woId') woId: string,
  ): Promise<AttendanceResponseDto[]> {
    return this.attendanceService.getAttendanceByWo(woId);
  }
}
