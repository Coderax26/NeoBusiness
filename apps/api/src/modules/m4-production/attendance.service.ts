import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import { Clock } from '../../shared/utils/clock.util.js';
import {
  AttendanceRepository,
  AttendanceLogWithDetails,
  AttendanceLogRow,
} from './repositories/attendance.repository.js';
import {
  CreateAttendanceDto,
  AttendanceResponseDto,
  AttendanceShift,
} from './dto/attendance.dto.js';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly attendanceRepo: AttendanceRepository,
  ) {}

  async logAttendance(
    dto: CreateAttendanceDto,
    loggedBy: string,
  ): Promise<AttendanceResponseDto> {
    // Validate date is not in the future
    const requestDate = new Date(dto.date);
    const now = new Date();
    if (requestDate > now) {
      throw new BadRequestException('Attendance date cannot be in the future');
    }

    const attendanceDate = dto.date;

    const nowIso = Clock.nowUtc().toISOString();
    const [insertedRow] = await this.knex('labour_attendance_logs')
      .insert({
        id: uuidv7(),
        site_id: dto.siteId,
        worker_id: dto.workerId,
        work_order_id: dto.workOrderId ?? null,
        date: attendanceDate,
        shift: dto.shift,
        hours_worked: dto.hoursWorked.toString(),
        overtime_hours: (dto.overtimeHours ?? 0).toString(),
        created_by: loggedBy,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .returning('*');

    // Fetch the full row with joined details
    const fullRow = await this.attendanceRepo.getById(insertedRow.id);
    return this.toResponseDto(fullRow!, loggedBy);
  }

  async getAttendanceByWorker(
    workerId: string,
    siteId?: string,
  ): Promise<AttendanceResponseDto[]> {
    const rows = await this.attendanceRepo.getByWorker(workerId, siteId);
    return rows.map((r) => this.toResponseDto(r));
  }

  async getAttendanceByWo(woId: string): Promise<AttendanceResponseDto[]> {
    const rows = await this.attendanceRepo.getByWorkOrder(woId);
    return rows.map((r) => this.toResponseDto(r));
  }

  async listAttendance(
    siteId?: string,
    date?: string,
  ): Promise<AttendanceResponseDto[]> {
    const rows = await this.attendanceRepo.list(siteId, date);
    return rows.map((r) => this.toResponseDto(r));
  }

  private toResponseDto(
    row: AttendanceLogWithDetails | AttendanceLogRow,
    loggedBy?: string,
  ): AttendanceResponseDto {
    return {
      id: row.id,
      siteId: row.site_id,
      workerId: row.worker_id,
      workerName: (row as AttendanceLogWithDetails).worker_name ?? '',
      workOrderId: row.work_order_id,
      workOrderNo: (row as AttendanceLogWithDetails).work_order_no,
      date: row.date,
      shift: row.shift as AttendanceShift,
      hoursWorked: parseFloat(row.hours_worked),
      overtimeHours: parseFloat(row.overtime_hours),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
