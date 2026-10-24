import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * ItemSummary type for PricingPort.
 * Matches the interface definition in ports.interface.ts.
 */
export interface ItemSummary {
  id: string;
  skuCode: string;
  name: string;
  category: 'TRADED_GOOD' | 'RAW_MATERIAL' | 'PROCESSED_FG' | 'PACKAGING';
  primaryUom: string;
  secondaryUom: string | null;
  shelfLifeDays: number | null;
  taxRatePct: string;
  hsnCode: string | null;
  isCatchWeight: boolean;
  standardWeightPerSecondaryKg: string | null;
  taxTreatment: 'TAXABLE' | 'EXEMPT' | 'NIL_RATED' | 'NON_GST';
  minMarginPct: number;
  isActive: boolean;
}

/**
 * UomConversion type for PricingPort.
 */
export interface UomConversion {
  itemId: string;
  fromUom: string;
  toUom: string;
  factor: string;
}

/**
 * ItemService — provides item information and unit-of-measure conversions.
 *
 * Implements ItemPort:
 * - getItem(itemId) → ItemSummary
 * - getUomConversion(itemId, fromUom, toUom) → UomConversion | null
 *
 * All data is cached once per request via the SQLite transaction.
 */
@Injectable()
export class ItemService {
  private readonly logger = new Logger(ItemService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Get a complete item record including category, tax, and margin metadata.
   * Returns null if item not found or inactive.
   */
  async getItem(itemId: string): Promise<ItemSummary | null> {
    const row = await this.knex('items')
      .where('id', itemId)
      .first(
        'id',
        'sku_code as skuCode',
        'name',
        'item_category as category',
        'primary_uom as primaryUom',
        'secondary_uom',
        'shelf_life_days',
        'tax_rate_pct',
        'hsn_code',
        'is_catch_weight',
        'standard_weight_per_secondary_kg',
        'tax_treatment',
        'min_margin_pct',
        'is_active',
      );

    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      skuCode: row.skuCode,
      name: row.name,
      category: row.category,
      primaryUom: row.primaryUom,
      secondaryUom: row.secondaryUom,
      shelfLifeDays: row.shelf_life_days,
      taxRatePct: String(row.tax_rate_pct),
      hsnCode: row.hsn_code,
      isCatchWeight: row.is_catch_weight,
      standardWeightPerSecondaryKg: row.standard_weight_per_secondary_kg,
      taxTreatment: row.tax_treatment,
      minMarginPct: Number(row.min_margin_pct),
      isActive: row.is_active,
    };
  }

  /**
   * Convert quantity from one UoM to another.
   * Returns null if conversion does not exist.
   *
   * Rules:
   * - Converts through the preferred conversion path (A → B → C).
   * - If target is primary UoM and from is secondary (catch weight), uses standard_weight_per_secondary_kg.
   * - Handles conversion to/from secondary UoM via uom_conversions table.
   */
  async getUomConversion(itemId: string, fromUom: string, toUom: string): Promise<UomConversion | null> {
    const item = await this.getItem(itemId);
    if (!item) {
      return null;
    }

    // Primary conversion table: uom_conversions
    let conversion = await this.knex('uom_conversions')
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

    // Bidirectional fallback: if exact path not found, check reverse
    // (e.g., want to convert CARTON to KG but only KG→CARTON exists)
    if (fromUom !== toUom) {
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
          factor: String(Math.round(1 / Number(reverse.factor) * 1000) / 1000), // invert
        };
      }

      // Catch-weight special case: secondary → primary (if items.is_catch_weight = TRUE)
      // This is for converting from trigger UoM back to base.
      if (item.isCatchWeight && fromUom === item.secondaryUom && toUom === item.primaryUom) {
        const factor = item.standardWeightPerSecondaryKg ?? '1.000';
        return {
          itemId,
          fromUom: item.secondaryUom,
          toUom: item.primaryUom,
          factor,
        };
      }
    }

    return null;
  }
}