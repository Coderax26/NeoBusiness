import { Injectable } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

export interface WastageRecordRow {
  id: string;
  work_order_id: string;
  item_id: string;
  batch_id: string | null;
  qty: string;
  uom: string;
  reason_type: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
}

export interface WastageRecordWithItems extends WastageRecordRow {
  item_name: string;
  item_sku_code: string;
  batch_number: string | null;
}

@Injectable()
export class WastageRepository {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async create(
    data: Omit<WastageRecordRow, 'created_at'>,
  ): Promise<WastageRecordRow> {
    const [row] = await this.knex('wastage_records')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
      })
      .returning('*');
    return row;
  }

  async getById(id: string): Promise<WastageRecordRow | null> {
    return this.knex('wastage_records').where('id', id).first();
  }

  async getByWorkOrderId(
    workOrderId: string,
  ): Promise<WastageRecordWithItems[]> {
    return this.knex('wastage_records as wr')
      .join('items as i', 'wr.item_id', 'i.id')
      .leftJoin('inventory_batches as ib', 'wr.batch_id', 'ib.id')
      .where('wr.work_order_id', workOrderId)
      .select(
        'wr.*',
        'i.name as item_name',
        'i.sku_code as item_sku_code',
        'ib.batch_number as batch_number',
      )
      .orderBy('wr.created_at', 'desc');
  }

  async list(
    siteId: string,
    status?: string,
  ): Promise<WastageRecordWithItems[]> {
    let query = this.knex('wastage_records as wr')
      .join('items as i', 'wr.item_id', 'i.id')
      .leftJoin('inventory_batches as ib', 'wr.batch_id', 'ib.id')
      .join('production_work_orders as wo', 'wr.work_order_id', 'wo.id')
      .where('wo.site_id', siteId)
      .select(
        'wr.*',
        'i.name as item_name',
        'i.sku_code as item_sku_code',
        'ib.batch_number as batch_number',
      )
      .orderBy('wr.created_at', 'desc');

    if (status) {
      query = query.where('wr.status', status);
    }

    return query;
  }

  async update(
    id: string,
    data: Partial<WastageRecordRow>,
  ): Promise<WastageRecordRow> {
    const [row] = await this.knex('wastage_records')
      .where('id', id)
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .returning('*');
    return row;
  }

  async approve(id: string, approvedBy: string): Promise<WastageRecordRow> {
    return this.update(id, {
      status: 'APPROVED',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    });
  }

  async writeOff(id: string, writtenOffBy: string): Promise<WastageRecordRow> {
    return this.update(id, {
      status: 'WRITTEN_OFF',
      approved_by: writtenOffBy,
      approved_at: new Date().toISOString(),
    });
  }
}
