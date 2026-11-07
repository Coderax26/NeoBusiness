import type { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';

export interface RequisitionHeaderRow {
  id: string;
  req_no: string;
  site_id: string;
  requested_by: string;
  required_by_date: string;
  status: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface RequisitionLineRow {
  id: string;
  requisition_id: string;
  item_id: string;
  required_qty: string;
  uom: string;
  bom_header_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequisitionLineWithItem extends RequisitionLineRow {
  item_name: string;
  item_sku_code: string;
  item_category: string;
  item_primary_uom: string;
}

export class RequisitionRepository {
  constructor(private readonly knex: Knex) {}

  async createHeader(
    data: Omit<RequisitionHeaderRow, 'id' | 'created_at' | 'updated_at'> & {
      id?: string;
    },
  ): Promise<RequisitionHeaderRow> {
    const id = data.id ?? uuidv7();
    const [row] = await this.knex('production_requisitions')
      .insert({ ...data, id })
      .returning('*');
    return row;
  }

  async createLines(
    lines: Array<
      Omit<RequisitionLineRow, 'id' | 'created_at' | 'updated_at'> & {
        id?: string;
      }
    >,
  ): Promise<RequisitionLineRow[]> {
    if (lines.length === 0) return [];
    const rows = await this.knex('production_requisition_lines')
      .insert(lines.map((l) => ({ ...l, id: l.id ?? uuidv7() })))
      .returning('*');
    return rows;
  }

  async getHeaderById(id: string): Promise<RequisitionHeaderRow | null> {
    return this.knex('production_requisitions')
      .where('id', id)
      .first<RequisitionHeaderRow>();
  }

  async getHeaderByNo(
    reqNo: string,
    siteId: string,
  ): Promise<RequisitionHeaderRow | null> {
    return this.knex('production_requisitions')
      .where('req_no', reqNo)
      .andWhere('site_id', siteId)
      .first<RequisitionHeaderRow>();
  }

  async getHeaders(
    siteId: string,
    status?: string,
  ): Promise<RequisitionHeaderRow[]> {
    let query = this.knex('production_requisitions').where('site_id', siteId);
    if (status) {
      query = query.andWhere('status', status);
    }
    return query.orderBy('created_at', 'desc').select('*');
  }

  async getLines(requisitionId: string): Promise<RequisitionLineRow[]> {
    return this.knex('production_requisition_lines')
      .where('requisition_id', requisitionId)
      .orderBy('created_at', 'asc')
      .select('*');
  }

  async getLinesWithItems(
    requisitionId: string,
  ): Promise<RequisitionLineWithItem[]> {
    return this.knex('production_requisition_lines as rl')
      .join('items as i', 'rl.item_id', 'i.id')
      .where('rl.requisition_id', requisitionId)
      .orderBy('rl.created_at', 'asc')
      .select(
        'rl.*',
        'i.name as item_name',
        'i.sku_code as item_sku_code',
        'i.item_category',
        'i.primary_uom as item_primary_uom',
      );
  }

  async updateHeader(
    id: string,
    data: Partial<RequisitionHeaderRow>,
  ): Promise<RequisitionHeaderRow | null> {
    const [row] = await this.knex('production_requisitions')
      .where('id', id)
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row;
  }

  async deleteLines(requisitionId: string): Promise<void> {
    await this.knex('production_requisition_lines')
      .where('requisition_id', requisitionId)
      .del();
  }

  async deleteHeader(id: string): Promise<void> {
    await this.knex('production_requisitions').where('id', id).del();
  }

  async headerExists(reqNo: string, siteId: string): Promise<boolean> {
    const row = await this.knex('production_requisitions')
      .where('req_no', reqNo)
      .andWhere('site_id', siteId)
      .first('id');
    return !!row;
  }
}
