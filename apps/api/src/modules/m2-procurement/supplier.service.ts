import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../shared/utils/money.util.js';
import { Qty } from '../../shared/utils/qty.util.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { ExceptionService } from '../m7a-exceptions/exception.service.js';

export interface SupplierCreateInput {
  companyName: string;
  phone: string;
  whatsappNo?: string;
  paymentTermsDays?: number;
  gstin?: string;
  reliabilityScorePct?: number;
  leadTimeDaysAvg?: number;
  isApproved?: boolean;
  userId: string;
}

export interface SupplierUpdateInput {
  companyName?: string;
  phone?: string;
  whatsappNo?: string;
  paymentTermsDays?: number;
  gstin?: string;
  reliabilityScorePct?: number;
  leadTimeDaysAvg?: number;
  isApproved?: boolean;
  isActive?: boolean;
  userId: string;
}

export interface SupplierRateQuoteInput {
  supplierId: string;
  itemId: string;
  quotedPrice: string;
  validUntil?: Date;
  source: 'CALL' | 'WHATSAPP' | 'PO';
  userId: string;
}

export interface RateHistoryEntry {
  id: string;
  quotedPrice: string;
  quotedAt: string;
  validUntil: string | null;
  source: string;
}

export interface SupplierPerformance {
  supplierId: string;
  supplierName: string;
  fillRate: number; // 0-1
  totalConfirmedQty: string;
  totalReceivedQty: string;
  avgLeadTimeDays: number;
  priceInflation30d: number;
  priceInflation90d: number;
  reliabilityScorePct: number;
}

export interface PriceInflation {
  period30d: number;
  period90d: number;
}

/**
 * SupplierService - Supplier master data, rate tracking, and performance analytics
 *
 * Handles:
 * - Supplier CRUD operations
 * - Supplier-item relationships
 * - Rate quote history & volatility tracking
 * - Supplier performance (fill rate, lead time, price inflation)
 * - Reliability score calculation
 */
@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly exceptionService: ExceptionService,
  ) {}

  /**
   * Create a new supplier
   */
  async create(input: SupplierCreateInput): Promise<{ id: string; supplierCode: string }> {
    const supplierCode = await this.docNumber.next('SUP', null, input.userId);

    const [supplier] = await this.knex('suppliers')
      .insert({
        id: uuidv4(),
        supplier_code: supplierCode,
        company_name: input.companyName,
        phone: input.phone,
        whatsapp_no: input.whatsappNo,
        payment_terms_days: input.paymentTermsDays ?? 30,
        gstin: input.gstin,
        reliability_score_pct: input.reliabilityScorePct ?? 0,
        lead_time_days_avg: input.leadTimeDaysAvg ?? 7,
        current_ap_balance: '0.00',
        is_approved: input.isApproved ?? false,
        is_active: true,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .returning(['id', 'supplier_code']);

    this.logger.log(`Created supplier: ${supplierCode} (${input.companyName})`);
    return { id: String(supplier.id), supplierCode: String(supplier.supplier_code) };
  }

  /**
   * Get supplier by ID
   */
  async getById(id: string): Promise<any> {
    const supplier = await this.knex('suppliers').where('id', id).first();
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
    return supplier;
  }

  /**
   * Get supplier by code
   */
  async getByCode(code: string): Promise<any> {
    return this.knex('suppliers').where('supplier_code', code).first();
  }

  /**
   * List suppliers with filters
   */
  async list(filters: {
    isActive?: boolean;
    isApproved?: boolean;
    siteId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    let query = this.knex('suppliers').select('*');

    if (filters.isActive !== undefined) {
      query = query.where('is_active', filters.isActive);
    }
    if (filters.isApproved !== undefined) {
      query = query.where('is_approved', filters.isApproved);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    return query.orderBy('company_name');
  }

  /**
   * Update supplier
   */
  async update(id: string, input: SupplierUpdateInput): Promise<void> {
    const { userId, ...data } = input;
    await this.knex('suppliers')
      .where('id', id)
      .update({
        ...data,
        updated_by: userId,
        updated_at: new Date(),
      });

    this.logger.log(`Updated supplier: ${id}`);
  }

  /**
   * Link supplier to item
   */
  async linkItem(
    supplierId: string,
    itemId: string,
    input: {
      isPrimary?: boolean;
      packSize?: string;
      minOrderQty?: string;
      userId: string;
    },
  ): Promise<void> {
    // If setting as primary, unset other primary for this item
    if (input.isPrimary) {
      await this.knex('supplier_items')
        .where('item_id', itemId)
        .where('is_primary', true)
        .update({ is_primary: false, updated_by: input.userId });
    }

    await this.knex('supplier_items')
      .insert({
        supplier_id: supplierId,
        item_id: itemId,
        is_primary: input.isPrimary ?? false,
        pack_size: input.packSize ?? '1.000',
        min_order_qty: input.minOrderQty ?? '1.000',
        created_by: input.userId,
        updated_by: input.userId,
      })
      .onConflict(['supplier_id', 'item_id'])
      .merge({
        is_primary: input.isPrimary ?? false,
        pack_size: input.packSize ?? '1.000',
        min_order_qty: input.minOrderQty ?? '1.000',
        updated_by: input.userId,
        updated_at: new Date(),
      });
  }

  /**
   * Get supplier items
   */
  async getSupplierItems(supplierId: string): Promise<any[]> {
    return this.knex('supplier_items')
      .where('supplier_id', supplierId)
      .join('items', 'items.id', 'supplier_items.item_id')
      .select(
        'supplier_items.*',
        'items.sku_code',
        'items.name',
        'items.item_category',
        'items.primary_uom',
      )
      .orderBy('supplier_items.is_primary', 'desc');
  }

  /**
   * Get approved suppliers for an item
   */
  async getApprovedSuppliersForItem(itemId: string): Promise<any[]> {
    return this.knex('supplier_items')
      .where('item_id', itemId)
      .where('is_primary', true)
      .join('suppliers', 'suppliers.id', 'supplier_items.supplier_id')
      .where('suppliers.is_approved', true)
      .where('suppliers.is_active', true)
      .select(
        'suppliers.*',
        'supplier_items.pack_size',
        'supplier_items.min_order_qty',
      )
      .orderBy('suppliers.reliability_score_pct', 'desc');
  }

  /**
   * Add a rate quote for supplier-item
   */
  async addRateQuote(input: SupplierRateQuoteInput): Promise<{ id: string }> {
    const id = uuidv4();
    await this.knex('supplier_rate_quotes').insert({
      id,
      supplier_id: input.supplierId,
      item_id: input.itemId,
      quoted_price: input.quotedPrice,
      quoted_at: new Date(),
      valid_until: input.validUntil,
      source: input.source,
      created_by: input.userId,
      updated_by: input.userId,
    });

    this.logger.debug(`Added rate quote for supplier ${input.supplierId}, item ${input.itemId}: ${input.quotedPrice}`);
    return { id };
  }

  /**
   * Get rate history for supplier-item
   */
  async getRateHistory(supplierId: string, itemId: string, limit = 50): Promise<RateHistoryEntry[]> {
    const quotes = await this.knex('supplier_rate_quotes')
      .where('supplier_id', supplierId)
      .where('item_id', itemId)
      .orderBy('quoted_at', 'desc')
      .limit(limit)
      .select('id', 'quoted_price', 'quoted_at', 'valid_until', 'source');

    return quotes.map(q => ({
      id: String(q.id),
      quotedPrice: String(q.quoted_price),
      quotedAt: q.quoted_at.toISOString(),
      validUntil: q.valid_until ? q.valid_until.toISOString() : null,
      source: q.source,
    }));
  }

  /**
   * Get latest rate quote for supplier-item
   */
  async getLatestRate(supplierId: string, itemId: string): Promise<string | null> {
    const quote = await this.knex('supplier_rate_quotes')
      .where('supplier_id', supplierId)
      .where('item_id', itemId)
      .where((builder) => {
        builder.whereNull('valid_until').orWhere('valid_until', '>=', new Date());
      })
      .orderBy('quoted_at', 'desc')
      .first('quoted_price');

    return quote ? String(quote.quoted_price) : null;
  }

  /**
   * Calculate price inflation (30/90 day delta)
   */
  async getPriceInflation(supplierId: string, itemId: string): Promise<PriceInflation> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get price 30 days ago
    const price30d = await this.knex('supplier_rate_quotes')
      .where('supplier_id', supplierId)
      .where('item_id', itemId)
      .where('quoted_at', '<=', thirtyDaysAgo)
      .orderBy('quoted_at', 'desc')
      .first('quoted_price');

    // Get price 90 days ago
    const price90d = await this.knex('supplier_rate_quotes')
      .where('supplier_id', supplierId)
      .where('item_id', itemId)
      .where('quoted_at', '<=', ninetyDaysAgo)
      .orderBy('quoted_at', 'desc')
      .first('quoted_price');

    // Get latest price
    const latestPrice = await this.getLatestRate(supplierId, itemId);

    const calcInflation = (oldPrice: string | null, newPrice: string | null): number => {
      if (!oldPrice || !newPrice) return 0;
      const oldVal = parseFloat(oldPrice);
      const newVal = parseFloat(newPrice);
      if (oldVal === 0) return 0;
      return (newVal - oldVal) / oldVal;
    };

    return {
      period30d: calcInflation(price30d?.quoted_price ?? null, latestPrice),
      period90d: calcInflation(price90d?.quoted_price ?? null, latestPrice),
    };
  }

  /**
   * Get supplier performance metrics
   */
  async getPerformance(supplierId: string): Promise<SupplierPerformance> {
    const supplier = await this.getById(supplierId);

    // Get confirmed quantities from PO lines
    const confirmedResult = await this.knex('purchase_order_lines')
      .join('purchase_orders', 'purchase_orders.id', 'purchase_order_lines.po_id')
      .where('purchase_orders.supplier_id', supplierId)
      .whereIn('purchase_orders.po_status', ['ISSUED', 'PARTIALLY_RECEIVED', 'CLOSED'])
      .sum('purchase_order_lines.confirmed_qty as total_confirmed')
      .first();

    // Get received quantities from GRN lines
    const receivedResult = await this.knex('goods_receipt_lines')
      .join('goods_receipts', 'goods_receipts.id', 'goods_receipt_lines.grn_id')
      .where('goods_receipts.supplier_id', supplierId)
      .sum('goods_receipt_lines.received_qty as total_received')
      .first();

    // Calculate average lead time (from PO expected_delivery to GRN received_at)
    const leadTimeResult = await this.knex('goods_receipts')
      .join('purchase_orders', 'purchase_orders.id', 'goods_receipts.po_id')
      .where('goods_receipts.supplier_id', supplierId)
      .whereNotNull('goods_receipts.po_id')
      .whereNotNull('purchase_orders.expected_delivery')
      .select(
        this.knex.raw(`AVG(EXTRACT(EPOCH FROM (goods_receipts.received_at - purchase_orders.expected_delivery)) / 86400) as avg_lead_time`)
      )
      .first();

    const totalConfirmed = confirmedResult?.total_confirmed ?? '0';
    const totalReceived = receivedResult?.total_received ?? '0';
    const fillRate = parseFloat(totalConfirmed) > 0
      ? parseFloat(totalReceived) / parseFloat(totalConfirmed)
      : 0;

    const priceInflation = await this.getPriceInflationForAllItems(supplierId);

    return {
      supplierId,
      supplierName: supplier.company_name,
      fillRate,
      totalConfirmedQty: totalConfirmed,
      totalReceivedQty: totalReceived,
      avgLeadTimeDays: parseFloat(String(leadTimeResult?.avg_lead_time ?? 0)),
      priceInflation30d: priceInflation.period30d,
      priceInflation90d: priceInflation.period90d,
      reliabilityScorePct: supplier.reliability_score_pct,
    };
  }

  /**
   * Calculate aggregate price inflation across all items for a supplier
   */
  private async getPriceInflationForAllItems(supplierId: string): Promise<PriceInflation> {
    const items = await this.knex('supplier_items')
      .where('supplier_id', supplierId)
      .select('item_id');

    if (items.length === 0) {
      return { period30d: 0, period90d: 0 };
    }

    const inflations = await Promise.all(
      items.map(item => this.getPriceInflation(supplierId, String(item.item_id)))
    );

    const avg30d = inflations.reduce((sum, i) => sum + i.period30d, 0) / inflations.length;
    const avg90d = inflations.reduce((sum, i) => sum + i.period90d, 0) / inflations.length;

    return { period30d: avg30d, period90d: avg90d };
  }

  /**
   * Update supplier reliability score based on performance
   */
  async updateReliabilityScore(supplierId: string, userId: string): Promise<void> {
    const performance = await this.getPerformance(supplierId);

    // Reliability score = weighted average of fill rate (60%) and on-time delivery (40%)
    // For now, simplified: just fill rate * 100
    const reliabilityScore = Math.round(performance.fillRate * 100);

    await this.knex('suppliers')
      .where('id', supplierId)
      .update({
        reliability_score_pct: reliabilityScore,
        updated_by: userId,
      });

    this.logger.log(`Updated reliability score for supplier ${supplierId}: ${reliabilityScore}%`);
  }

  /**
   * Get suppliers missing rate quotes (stale rate alert)
   */
  async getSuppliersMissingRates(itemCategory?: string, daysThreshold = 30): Promise<any[]> {
    const cutoff = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

    let query = this.knex('supplier_items')
      .join('suppliers', 'suppliers.id', 'supplier_items.supplier_id')
      .join('items', 'items.id', 'supplier_items.item_id')
      .where('suppliers.is_approved', true)
      .where('suppliers.is_active', true)
      .whereNotExists(
        this.knex('supplier_rate_quotes')
          .whereRaw('supplier_rate_quotes.supplier_id = supplier_items.supplier_id')
          .whereRaw('supplier_rate_quotes.item_id = supplier_items.item_id')
          .where('quoted_at', '>=', cutoff)
      )
      .select(
        'suppliers.id as supplier_id',
        'suppliers.supplier_code',
        'suppliers.company_name',
        'items.id as item_id',
        'items.sku_code',
        'items.name as item_name',
      );

    if (itemCategory) {
      query = query.where('items.item_category', itemCategory);
    }

    return query;
  }
}