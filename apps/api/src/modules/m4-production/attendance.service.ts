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
    if (!dto.siteId) {
      throw new BadRequestException('siteId is required to log attendance');
    }
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

  async listWorkers(siteId?: string): Promise<
    Array<{
      id: string;
      code: string;
      name: string;
      fullName: string;
      role: string;
      station: string;
      shift: string;
      status: 'IN' | 'OUT';
      lastPunch: string;
      hoursToday: number;
      monthlyHours: number;
    }>
  > {
    const today = Clock.todayKolkata();
    const monthStart = `${today.slice(0, 7)}-01`;

    let usersQuery = this.knex('users as u')
      .leftJoin('user_site_access as usa', 'u.id', 'usa.user_id')
      .where('u.is_active', true);

    if (
      siteId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        siteId,
      )
    ) {
      usersQuery = usersQuery.andWhere('usa.site_id', siteId);
    }

    const users = await usersQuery
      .distinct('u.id', 'u.full_name', 'u.role_code', 'u.phone')
      .orderBy('u.full_name', 'asc');

    const logs = await this.attendanceRepo.list(siteId, today);
    const monthLogs = await this.knex('labour_attendance_logs')
      .where('date', '>=', monthStart)
      .modify((q) => {
        if (
          siteId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            siteId,
          )
        ) {
          q.where('site_id', siteId);
        }
      })
      .select('worker_id', 'hours_worked', 'overtime_hours');

    const todayByWorker = new Map<string, AttendanceLogWithDetails[]>();
    for (const log of logs) {
      const k = String(log.worker_id);
      if (!todayByWorker.has(k)) todayByWorker.set(k, []);
      todayByWorker.get(k)!.push(log);
    }

    const monthHoursByWorker = new Map<string, number>();
    for (const log of monthLogs as any[]) {
      const k = String(log.worker_id);
      const hrs =
        (parseFloat(log.hours_worked) || 0) +
        (parseFloat(log.overtime_hours) || 0);
      monthHoursByWorker.set(k, (monthHoursByWorker.get(k) ?? 0) + hrs);
    }

    return (users as any[]).map((u, idx) => {
      const todayEntries = todayByWorker.get(String(u.id)) ?? [];
      const latest = todayEntries[0];
      const hoursToday = todayEntries.reduce(
        (s, e) => s + (parseFloat(e.hours_worked) || 0),
        0,
      );
      const punchedIn =
        latest !== undefined && parseFloat(latest.hours_worked) === 0;
      const roleStr = String(u.role_code || 'FLOOR_SUPERVISOR');
      return {
        id: String(u.id),
        code: `WRK-${String(idx + 1).padStart(2, '0')}`,
        name: String(u.full_name || 'Floor Worker'),
        fullName: String(u.full_name || 'Floor Worker'),
        role: roleStr,
        station: roleStr.replace(/_/g, ' '),
        shift: latest?.shift ?? 'MORNING',
        status: punchedIn ? 'IN' : 'OUT',
        lastPunch: latest?.created_at
          ? new Date(latest.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '--:--',
        hoursToday: Number(hoursToday.toFixed(1)),
        monthlyHours: Number(
          (monthHoursByWorker.get(String(u.id)) ?? hoursToday).toFixed(1),
        ),
      };
    });
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
