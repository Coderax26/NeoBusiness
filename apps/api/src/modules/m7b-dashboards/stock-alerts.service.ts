import { Injectable } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { StockAlertType } from './dto/stock-alerts.dto.js';

/**
 * StockAlertsService — Stock alert queries (low stock, expiring, committed vs available)
 *
 * Reads from mv_inventory_alerts materialized view (refreshed every 5 min).
 * Provides granular alert types: OUT_OF_STOCK, LOW_STOCK, EXPIRING_SOON, OVERCOMMITTED.
 */

@Injectable()
export class StockAlertsService {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  private isUuid(v?: string): boolean {
    return Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
  }

  /**
   * AC7: Stock Alerts
   * Returns alerts for low stock, expiring soon, and overcommitted batches
   * Cached via mv_inventory_alerts (refreshed every 5 min)
   */
  async getAlerts(siteId: string): Promise<
    Array<{
      siteId: string;
      itemId: string;
      skuCode: string;
      name: string;
      batchNumber: string;
      expiryDate: string | null;
      qtyOnHand: string;
      qtyAvailable: string;
      qtyCommitted: string;
      minQtyThreshold: string;
      alertType: StockAlertType;
    }>
  > {
    let query = this.knex('mv_inventory_alerts');
    if (this.isUuid(siteId)) {
      query = query.where('site_id', siteId);
    }
    const alerts = await query
      .select(
        'site_id',
        'item_id',
        'sku_code',
        'name',
        'batch_number',
        'expiry_date',
        'qty_on_hand',
        'qty_available',
        'qty_committed',
        'min_qty_threshold',
        'alert_type',
      )
      .orderBy('alert_type', 'asc')
      .orderBy('expiry_date', 'asc');

    return alerts.map((row) => ({
      siteId: String(row.site_id),
      itemId: String(row.item_id),
      skuCode: row.sku_code,
      name: row.name,
      batchNumber: row.batch_number,
      expiryDate: row.expiry_date ? String(row.expiry_date) : null,
      qtyOnHand: String(row.qty_on_hand),
      qtyAvailable: String(row.qty_available),
      qtyCommitted: String(row.qty_committed),
      minQtyThreshold: String(row.min_qty_threshold),
      alertType: row.alert_type as StockAlertType,
    }));
  }

  /**
   * Get alerts by type
   */
  async getAlertsByType(
    siteId: string,
    alertType: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'EXPIRING_SOON' | 'OVERCOMMITTED',
  ): Promise<
    Array<{
      siteId: string;
      itemId: string;
      skuCode: string;
      name: string;
      batchNumber: string;
      expiryDate: string | null;
      qtyOnHand: string;
      qtyAvailable: string;
      qtyCommitted: string;
      minQtyThreshold: string;
      alertType: StockAlertType;
    }>
  > {
    let query = this.knex('mv_inventory_alerts').andWhere('alert_type', alertType);
    if (this.isUuid(siteId)) {
      query = query.where('site_id', siteId);
    }
    const alerts = await query
      .select(
        'site_id',
        'item_id',
        'sku_code',
        'name',
        'batch_number',
        'expiry_date',
        'qty_on_hand',
        'qty_available',
        'qty_committed',
        'min_qty_threshold',
        'alert_type',
      )
      .orderBy('expiry_date', 'asc');

    return alerts.map((row) => ({
      siteId: String(row.site_id),
      itemId: String(row.item_id),
      skuCode: row.sku_code,
      name: row.name,
      batchNumber: row.batch_number,
      expiryDate: row.expiry_date ? String(row.expiry_date) : null,
      qtyOnHand: String(row.qty_on_hand),
      qtyAvailable: String(row.qty_available),
      qtyCommitted: String(row.qty_committed),
      minQtyThreshold: String(row.min_qty_threshold),
      alertType: row.alert_type as StockAlertType,
    }));
  }

  /**
   * Get count of alerts by type for dashboard badges
   */
  async getAlertCounts(siteId: string): Promise<{
    outOfStock: number;
    lowStock: number;
    expiringSoon: number;
    overcommitted: number;
    total: number;
  }> {
    let query = this.knex('mv_inventory_alerts');
    if (this.isUuid(siteId)) {
      query = query.where('site_id', siteId);
    }
    const counts = await query
      .count('* as total')
      .count("* filter (where alert_type = 'OUT_OF_STOCK') as out_of_stock")
      .count("* filter (where alert_type = 'LOW_STOCK') as low_stock")
      .count("* filter (where alert_type = 'EXPIRING_SOON') as expiring_soon")
      .count("* filter (where alert_type = 'OVERCOMMITTED') as overcommitted")
      .first();

    return {
      outOfStock: Number(counts?.out_of_stock ?? 0),
      lowStock: Number(counts?.low_stock ?? 0),
      expiringSoon: Number(counts?.expiring_soon ?? 0),
      overcommitted: Number(counts?.overcommitted ?? 0),
      total: Number(counts?.total ?? 0),
    };
  }
}
