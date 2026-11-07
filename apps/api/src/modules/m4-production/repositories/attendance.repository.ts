import { Injectable } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

export interface AttendanceLogRow {
  id: string;
  site_id: string;
  worker_id: string;
  work_order_id: string | null;
  date: string;
  shift: string;
  hours_worked: string;
  overtime_hours: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceLogWithDetails extends AttendanceLogRow {
  worker_name: string;
  work_order_no: string | null;
}

@Injectable()
export class AttendanceRepository {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async create(
    data: Omit<AttendanceLogRow, 'created_at' | 'updated_at'>,
  ): Promise<AttendanceLogRow> {
    const now = new Date().toISOString();
    const [row] = await this.knex('labour_attendance_logs')
      .insert({
        ...data,
        created_at: now,
        updated_at: now,
      })
      .returning('*');
    return row;
  }

  async getById(id: string): Promise<AttendanceLogRow | null> {
    return this.knex('labour_attendance_logs').where('id', id).first();
  }

  async getByWorker(
    workerId: string,
    siteId: string,
  ): Promise<AttendanceLogWithDetails[]> {
    return this.knex('labour_attendance_logs as la')
      .join('users as u', 'la.worker_id', 'u.id')
      .leftJoin('production_work_orders as wo', 'la.work_order_id', 'wo.id')
      .where('la.worker_id', workerId)
      .andWhere('la.site_id', siteId)
      .select('la.*', 'u.full_name as worker_name', 'wo.wo_no as work_order_no')
      .orderBy('la.date', 'desc')
      .orderBy('la.created_at', 'desc');
  }

  async getByWorkOrder(
    workOrderId: string,
  ): Promise<AttendanceLogWithDetails[]> {
    return this.knex('labour_attendance_logs as la')
      .join('users as u', 'la.worker_id', 'u.id')
      .leftJoin('production_work_orders as wo', 'la.work_order_id', 'wo.id')
      .where('la.work_order_id', workOrderId)
      .select('la.*', 'u.full_name as worker_name', 'wo.wo_no as work_order_no')
      .orderBy('la.date', 'desc');
  }

  async list(
    siteId: string,
    date?: string,
  ): Promise<AttendanceLogWithDetails[]> {
    let query = this.knex('labour_attendance_logs as la')
      .join('users as u', 'la.worker_id', 'u.id')
      .leftJoin('production_work_orders as wo', 'la.work_order_id', 'wo.id')
      .where('la.site_id', siteId)
      .select('la.*', 'u.full_name as worker_name', 'wo.wo_no as work_order_no')
      .orderBy('la.date', 'desc');

    if (date) {
      query = query.where('la.date', date);
    }

    return query;
  }

  async update(
    id: string,
    data: Partial<AttendanceLogRow>,
  ): Promise<AttendanceLogRow> {
    const [row] = await this.knex('labour_attendance_logs')
      .where('id', id)
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .returning('*');
    return row;
  }
}
