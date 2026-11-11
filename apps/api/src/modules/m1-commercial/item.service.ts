import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * ItemService — handles item master CRUD and UoM conversions.
 */
@Injectable()
export class ItemService {
  private readonly logger = new Logger(ItemService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Create a new item.
   */
  async create(data: {
    skuCode: string;
    name: string;
    itemCategory: string;
    primaryUom: string;
    secondaryUom?: string;
    shelfLifeDays?: number;
    taxRatePct: number;
    hsnCode?: string;
    isCatchWeight?: boolean;
    standardWeightPerSecondaryKg?: number;
    minMarginPct?: number;
    taxTreatment: string;
    isActive?: boolean;
    userId: string;
  }) {
    const [item] = await this.knex('items')
      .insert({
        sku_code: data.skuCode,
        name: data.name,
        item_category: data.itemCategory,
        primary_uom: data.primaryUom,
        secondary_uom: data.secondaryUom,
        shelf_life_days: data.shelfLifeDays,
        tax_rate_pct: data.taxRatePct,
        hsn_code: data.hsnCode,
        is_catch_weight: data.isCatchWeight ?? false,
        standard_weight_per_secondary_kg: data.standardWeightPerSecondaryKg,
        min_margin_pct: data.minMarginPct ?? 0.1,
        tax_treatment: data.taxTreatment,
        is_active: data.isActive ?? true,
        created_by: data.userId,
        updated_by: data.userId,
      })
      .returning('*');

    this.logger.log(`Created item ${data.skuCode}: ${data.name}`);
    return item;
  }

  /**
   * List items with filters.
   */
  async findAll(filters: {
    itemCategory?: string;
    isActive?: boolean;
    search?: string;
  }) {
    const query = this.knex('items').select('*');

    if (filters.itemCategory) {
      query.where('item_category', filters.itemCategory);
    }
    if (filters.isActive !== undefined) {
      query.where('is_active', filters.isActive);
    }
    if (filters.search) {
      query.andWhere((qb) => {
        qb.whereILike('name', `%${filters.search}%`)
          .orWhereILike('sku_code', `%${filters.search}%`)
          .orWhereILike('hsn_code', `%${filters.search}%`);
      });
    }

    return query.orderBy('item_category').orderBy('name');
  }

  /**
   * Get item by ID.
   */
  async findById(id: string) {
    const item = await this.knex('items').where('id', id).first();
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  /**
   * Get item by SKU.
   */
  async findBySku(skuCode: string) {
    return this.knex('items').where('sku_code', skuCode).first();
  }

  /**
   * Update item (OWNER).
   */
  async update(
    id: string,
    data: Partial<{
      name: string;
      itemCategory: string;
      primaryUom: string;
      secondaryUom: string;
      shelfLifeDays: number;
      taxRatePct: number;
      hsnCode: string;
      isCatchWeight: boolean;
      standardWeightPerSecondaryKg: number;
      minMarginPct: number;
      taxTreatment: string;
      isActive: boolean;
      userId: string;
    }>,
  ) {
    const updateData: any = { updated_by: data.userId, updated_at: new Date() };

    if (data.name) updateData.name = data.name;
    if (data.itemCategory) updateData.item_category = data.itemCategory;
    if (data.primaryUom) updateData.primary_uom = data.primaryUom;
    if (data.secondaryUom !== undefined)
      updateData.secondary_uom = data.secondaryUom;
    if (data.shelfLifeDays !== undefined)
      updateData.shelf_life_days = data.shelfLifeDays;
    if (data.taxRatePct !== undefined)
      updateData.tax_rate_pct = data.taxRatePct;
    if (data.hsnCode !== undefined) updateData.hsn_code = data.hsnCode;
    if (data.isCatchWeight !== undefined)
      updateData.is_catch_weight = data.isCatchWeight;
    if (data.standardWeightPerSecondaryKg !== undefined)
      updateData.standard_weight_per_secondary_kg =
        data.standardWeightPerSecondaryKg;
    if (data.minMarginPct !== undefined)
      updateData.min_margin_pct = data.minMarginPct;
    if (data.taxTreatment) updateData.tax_treatment = data.taxTreatment;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;

    const [item] = await this.knex('items')
      .where('id', id)
      .update(updateData)
      .returning('*');

    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  /**
   * Add UoM conversion for an item.
   */
  async addUomConversion(data: {
    itemId: string;
    fromUom: string;
    toUom: string;
    factor: number;
    userId: string;
  }) {
    await this.findById(data.itemId);

    const [conversion] = await this.knex('uom_conversions')
      .insert({
        item_id: data.itemId,
        from_uom: data.fromUom,
        to_uom: data.toUom,
        factor: data.factor,
        created_by: data.userId,
        updated_by: data.userId,
      })
      .returning('*');

    return conversion;
  }

  /**
   * Get UoM conversions for an item.
   */
  async getUomConversions(itemId: string) {
    await this.findById(itemId);
    return this.knex('uom_conversions')
      .where('item_id', itemId)
      .where('is_active', true)
      .orderBy('from_uom')
      .orderBy('to_uom');
  }

  /**
   * Get item for ItemPort (public API) - returns full item data.
   */
  async getItem(id: string) {
    const item = await this.knex('items').where('id', id).first();
    if (!item) return null;

    return {
      id: String(item.id),
      skuCode: item.sku_code,
      name: item.name,
      itemCategory: item.item_category,
      primaryUom: item.primary_uom,
      secondaryUom: item.secondary_uom,
      shelfLifeDays: item.shelf_life_days,
      taxRatePct: String(item.tax_rate_pct),
      hsnCode: item.hsn_code,
      isCatchWeight: item.is_catch_weight,
      standardWeightPerSecondaryKg: item.standard_weight_per_secondary_kg
        ? String(item.standard_weight_per_secondary_kg)
        : null,
      taxTreatment: item.tax_treatment,
      minMarginPct: Number(item.min_margin_pct),
      isActive: item.is_active,
    };
  }

  /**
   * Get item summary for PricingPort (public API).
   */
  async getItemSummary(id: string) {
    const row = await this.knex('items')
      .where('id', id)
      .first(
        'id',
        'sku_code as skuCode',
        'name',
        'item_category as category',
        'primary_uom as primaryUom',
        'secondary_uom as secondaryUom',
        'shelf_life_days as shelfLifeDays',
        'tax_rate_pct as taxRatePct',
        'hsn_code as hsnCode',
        'is_catch_weight as isCatchWeight',
        'standard_weight_per_secondary_kg as standardWeightPerSecondaryKg',
        'tax_treatment as taxTreatment',
        'min_margin_pct as minMarginPct',
        'is_active as isActive',
      );

    if (!row) return null;

    return {
      id: String(row.id),
      skuCode: row.skuCode,
      name: row.name,
      category: row.category,
      primaryUom: row.primaryUom,
      secondaryUom: row.secondaryUom,
      shelfLifeDays: row.shelfLifeDays,
      taxRatePct: String(row.taxRatePct),
      hsnCode: row.hsnCode,
      isCatchWeight: row.isCatchWeight,
      standardWeightPerSecondaryKg: row.standardWeightPerSecondaryKg,
      taxTreatment: row.taxTreatment,
      minMarginPct: Number(row.minMarginPct),
      isActive: row.isActive,
    };
  }

  /**
   * Get UoM conversion factor (used by PricingPort/ItemPort).
   */
  async getUomConversion(itemId: string, fromUom: string, toUom: string) {
    if (fromUom === toUom) return { itemId, fromUom, toUom, factor: '1.000' };

    const conversion = await this.knex('uom_conversions')
      .where('item_id', itemId)
      .where('from_uom', fromUom)
      .where('to_uom', toUom)
      .where('is_active', true)
      .first('factor');

    if (conversion) {
      return {
        itemId,
        fromUom,
        toUom,
        factor: conversion.factor,
      };
    }

    // Check reverse
    const reverse = await this.knex('uom_conversions')
      .where('item_id', itemId)
      .where('from_uom', toUom)
      .where('to_uom', fromUom)
      .where('is_active', true)
      .first('factor');

    if (reverse) {
      return {
        itemId,
        fromUom: toUom,
        toUom: fromUom,
        factor: String(Math.round((1 / Number(reverse.factor)) * 1000) / 1000),
      };
    }

    // Catch-weight fallback: secondary -> primary
    const item = await this.findById(itemId);
    if (
      item.is_catch_weight &&
      fromUom === item.secondary_uom &&
      toUom === item.primary_uom
    ) {
      const factor = item.standard_weight_per_secondary_kg ?? '1.000';
      return {
        itemId,
        fromUom: item.secondary_uom,
        toUom: item.primary_uom,
        factor,
      };
    }

    return null;
  }
}
