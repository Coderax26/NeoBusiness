import type { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';

export interface BomHeaderRow {
  id: string;
  bom_no: string;
  item_id: string;
  site_id: string;
  version: number;
  status: string;
  effective_from: Date | null;
  effective_to: Date | null;
  yield_pct: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface BomLineRow {
  id: string;
  bom_header_id: string;
  item_id: string;
  qty_per_unit: string;
  uom: string;
  sequence_no: number;
  is_critical: boolean;
  created_at: string;
  updated_at: string;
}

export interface BomLineWithItem extends BomLineRow {
  item_name: string;
  item_sku_code: string;
  item_category: string;
  item_primary_uom: string;
}

export class BomRepository {
  constructor(private readonly knex: Knex) {}

  async createHeader(
    data: Omit<BomHeaderRow, 'id' | 'created_at' | 'updated_at'> & {
      id?: string;
    },
  ): Promise<BomHeaderRow> {
    const id = data.id ?? uuidv7();
    const [row] = await this.knex('bom_headers')
      .insert({ ...data, id })
      .returning('*');
    return row;
  }

  async createLines(
    lines: Array<
      Omit<BomLineRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
    >,
  ): Promise<BomLineRow[]> {
    if (lines.length === 0) return [];
    const rows = await this.knex('bom_lines')
      .insert(lines.map((l) => ({ ...l, id: l.id ?? uuidv7() })))
      .returning('*');
    return rows;
  }

  async getHeaderById(id: string): Promise<BomHeaderRow | null> {
    return this.knex('bom_headers').where('id', id).first<BomHeaderRow>();
  }

  async getHeaderByNo(
    bomNo: string,
    siteId: string,
  ): Promise<BomHeaderRow | null> {
    return this.knex('bom_headers')
      .where('bom_no', bomNo)
      .andWhere('site_id', siteId)
      .first<BomHeaderRow>();
  }

  async getActiveBom(
    itemId: string,
    siteId: string,
  ): Promise<BomHeaderRow | null> {
    return this.knex('bom_headers')
      .where('item_id', itemId)
      .andWhere('site_id', siteId)
      .andWhere('status', 'ACTIVE')
      .first<BomHeaderRow>();
  }

  async getHeadersByItem(
    itemId: string,
    siteId: string,
  ): Promise<BomHeaderRow[]> {
    return this.knex('bom_headers')
      .where('item_id', itemId)
      .andWhere('site_id', siteId)
      .orderBy('version', 'desc')
      .select('*');
  }

  async getLines(bomHeaderId: string): Promise<BomLineRow[]> {
    return this.knex('bom_lines')
      .where('bom_header_id', bomHeaderId)
      .orderBy('sequence_no', 'asc')
      .select('*');
  }

  async getLinesWithItems(bomHeaderId: string): Promise<BomLineWithItem[]> {
    return this.knex('bom_lines as bl')
      .join('items as i', 'bl.item_id', 'i.id')
      .where('bl.bom_header_id', bomHeaderId)
      .orderBy('bl.sequence_no', 'asc')
      .select(
        'bl.*',
        'i.name as item_name',
        'i.sku_code as item_sku_code',
        'i.item_category',
        'i.primary_uom as item_primary_uom',
      );
  }

  async updateHeader(
    id: string,
    data: Partial<BomHeaderRow>,
  ): Promise<BomHeaderRow | null> {
    const [row] = await this.knex('bom_headers')
      .where('id', id)
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row;
  }

  async deactivateOtherVersions(
    bomHeaderId: string,
    itemId: string,
    siteId: string,
  ): Promise<void> {
    await this.knex('bom_headers')
      .where('id', '!=', bomHeaderId)
      .andWhere('item_id', itemId)
      .andWhere('site_id', siteId)
      .andWhere('status', 'ACTIVE')
      .update({ status: 'OBSOLETE', updated_at: new Date() });
  }

  async activateBom(
    bomHeaderId: string,
    itemId: string,
    siteId: string,
    requestedBy: string,
  ): Promise<BomHeaderRow | null> {
    return this.knex.transaction(async (trx: Knex.Transaction) => {
      // Deactivate any other ACTIVE BOM for this item/site
      await trx('bom_headers')
        .where('id', '!=', bomHeaderId)
        .andWhere('item_id', itemId)
        .andWhere('site_id', siteId)
        .andWhere('status', 'ACTIVE')
        .update({
          status: 'OBSOLETE',
          updated_by: requestedBy,
          updated_at: new Date(),
        });

      // Activate the requested BOM
      const [row] = await trx('bom_headers')
        .where('id', bomHeaderId)
        .update({
          status: 'ACTIVE',
          effective_from: new Date(),
          updated_by: requestedBy,
          updated_at: new Date(),
        })
        .returning('*');
      return row;
    });
  }

  async deleteLines(bomHeaderId: string): Promise<void> {
    await this.knex('bom_lines').where('bom_header_id', bomHeaderId).del();
  }

  async deleteHeader(id: string): Promise<void> {
    await this.knex('bom_headers').where('id', id).del();
  }

  async headerExists(bomNo: string, siteId: string): Promise<boolean> {
    const row = await this.knex('bom_headers')
      .where('bom_no', bomNo)
      .andWhere('site_id', siteId)
      .first('id');
    return !!row;
  }
}
