import { Injectable } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';

export interface WorkOrderHeaderRow {
  id: string;
  wo_no: string;
  site_id: string;
  bom_header_id: string;
  planned_qty: string;
  uom: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  started_by: string | null;
  completed_by: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderMaterialRow {
  id: string;
  work_order_id: string;
  item_id: string;
  batch_id: string | null;
  planned_qty: string;
  actual_qty: string;
  uom: string;
  variance_pct: string;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderOutputRow {
  id: string;
  work_order_id: string;
  item_id: string;
  batch_id: string | null;
  planned_qty: string;
  actual_qty: string;
  uom: string;
  yield_pct: string;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderMaterialWithItem extends WorkOrderMaterialRow {
  item_name: string;
  item_sku_code: string;
  batch_number: string | null;
}

export interface WorkOrderOutputWithItem extends WorkOrderOutputRow {
  item_name: string;
  item_sku_code: string;
  batch_number: string | null;
}

@Injectable()
export class WorkOrderRepository {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async createHeader(
    data: Omit<WorkOrderHeaderRow, 'id' | 'created_at' | 'updated_at'> & {
      id?: string;
    },
  ): Promise<WorkOrderHeaderRow> {
    const id = data.id ?? uuidv7();
    const [row] = await this.knex('production_work_orders')
      .insert({ ...data, id })
      .returning('*');
    return row;
  }

  async getHeaderById(id: string): Promise<WorkOrderHeaderRow | null> {
    return this.knex('production_work_orders')
      .where('id', id)
      .first<WorkOrderHeaderRow>();
  }

  async getHeaderByNo(
    woNo: string,
    siteId: string,
  ): Promise<WorkOrderHeaderRow | null> {
    return this.knex('production_work_orders')
      .where('wo_no', woNo)
      .andWhere('site_id', siteId)
      .first<WorkOrderHeaderRow>();
  }

  async getHeaders(
    siteId?: string,
    status?: string,
  ): Promise<WorkOrderHeaderRow[]> {
    let query = this.knex('production_work_orders');
    if (
      siteId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        siteId,
      )
    ) {
      query = query.where('site_id', siteId);
    }
    if (status) {
      query = query.andWhere('status', status);
    }
    return query.orderBy('created_at', 'desc').select('*');
  }

  async getHeadersByBom(bomHeaderId: string): Promise<WorkOrderHeaderRow[]> {
    return this.knex('production_work_orders')
      .where('bom_header_id', bomHeaderId)
      .orderBy('created_at', 'desc')
      .select('*');
  }

  async updateHeader(
    id: string,
    data: Partial<WorkOrderHeaderRow>,
  ): Promise<WorkOrderHeaderRow | null> {
    const [row] = await this.knex('production_work_orders')
      .where('id', id)
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row;
  }

  async createMaterials(
    materials: Array<
      Omit<
        WorkOrderMaterialRow,
        'id' | 'created_at' | 'updated_at' | 'variance_pct'
      > & {
        id?: string;
      }
    >,
  ): Promise<WorkOrderMaterialRow[]> {
    if (materials.length === 0) return [];
    const rows = await this.knex('work_order_materials')
      .insert(materials.map((m) => ({ ...m, id: m.id ?? uuidv7() })))
      .returning('*');
    return rows;
  }

  async createOutputs(
    outputs: Array<
      Omit<
        WorkOrderOutputRow,
        'id' | 'created_at' | 'updated_at' | 'yield_pct'
      > & {
        id?: string;
      }
    >,
  ): Promise<WorkOrderOutputRow[]> {
    if (outputs.length === 0) return [];
    const rows = await this.knex('work_order_outputs')
      .insert(outputs.map((o) => ({ ...o, id: o.id ?? uuidv7() })))
      .returning('*');
    return rows;
  }

  async getMaterials(workOrderId: string): Promise<WorkOrderMaterialRow[]> {
    return this.knex('work_order_materials')
      .where('work_order_id', workOrderId)
      .orderBy('created_at', 'asc')
      .select('*');
  }

  async getMaterialsWithItems(
    workOrderId: string,
  ): Promise<WorkOrderMaterialWithItem[]> {
    return this.knex('work_order_materials as wom')
      .join('items as i', 'wom.item_id', 'i.id')
      .leftJoin('inventory_batches as ib', 'wom.batch_id', 'ib.id')
      .where('wom.work_order_id', workOrderId)
      .orderBy('wom.created_at', 'asc')
      .select(
        'wom.*',
        'i.name as item_name',
        'i.sku_code as item_sku_code',
        'ib.batch_number as batch_number',
      );
  }

  async getOutputs(workOrderId: string): Promise<WorkOrderOutputRow[]> {
    return this.knex('work_order_outputs')
      .where('work_order_id', workOrderId)
      .orderBy('created_at', 'asc')
      .select('*');
  }

  async getOutputsWithItems(
    workOrderId: string,
  ): Promise<WorkOrderOutputWithItem[]> {
    return this.knex('work_order_outputs as woo')
      .join('items as i', 'woo.item_id', 'i.id')
      .leftJoin('inventory_batches as ib', 'woo.batch_id', 'ib.id')
      .where('woo.work_order_id', workOrderId)
      .orderBy('woo.created_at', 'asc')
      .select(
        'woo.*',
        'i.name as item_name',
        'i.sku_code as item_sku_code',
        'ib.batch_number as batch_number',
      );
  }

  async updateMaterial(
    id: string,
    data: Partial<WorkOrderMaterialRow>,
  ): Promise<WorkOrderMaterialRow | null> {
    const [row] = await this.knex('work_order_materials')
      .where('id', id)
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row;
  }

  async updateOutput(
    id: string,
    data: Partial<WorkOrderOutputRow>,
  ): Promise<WorkOrderOutputRow | null> {
    const [row] = await this.knex('work_order_outputs')
      .where('id', id)
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row;
  }

  async deleteMaterials(workOrderId: string): Promise<void> {
    await this.knex('work_order_materials')
      .where('work_order_id', workOrderId)
      .del();
  }

  async deleteOutputs(workOrderId: string): Promise<void> {
    await this.knex('work_order_outputs')
      .where('work_order_id', workOrderId)
      .del();
  }

  async headerExists(woNo: string, siteId: string): Promise<boolean> {
    const row = await this.knex('production_work_orders')
      .where('wo_no', woNo)
      .andWhere('site_id', siteId)
      .first('id');
    return !!row;
  }

  async getMaterialById(id: string): Promise<WorkOrderMaterialRow | null> {
    return this.knex('work_order_materials')
      .where('id', id)
      .first<WorkOrderMaterialRow>();
  }

  async getOutputById(id: string): Promise<WorkOrderOutputRow | null> {
    return this.knex('work_order_outputs')
      .where('id', id)
      .first<WorkOrderOutputRow>();
  }
}
