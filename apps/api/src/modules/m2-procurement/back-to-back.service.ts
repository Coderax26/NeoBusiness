import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../shared/utils/money.util.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { ExceptionService } from '../m7a-exceptions/exception.service.js';
import { SupplierService } from './supplier.service.js';
import { POService } from './po.service.js';

export interface BackToBackPOInput {
  salesOrderId: string;
  salesOrderLineId: string;
  supplierId: string;
  userId: string;
}

export interface BackToBackResult {
  poId: string;
  poNo: string;
  spread: string;
  spreadPct: number;
}

/**
 * BackToBackService - Back-to-back trading POs from sales orders
 *
 * Handles:
 * - One-click PO creation from sales_order_line
 * - Spread calculation (sales price - purchase price)
 * - Links PO to sales order via linked_sales_order_id
 * - Uses parent_po_id for chaining if needed
 */
@Injectable()
export class BackToBackService {
  private readonly logger = new Logger(BackToBackService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly outbox: OutboxService,
    private readonly exceptionService: ExceptionService,
    private readonly supplierService: SupplierService,
    private readonly poService: POService,
  ) {}

  /**
   * Create a back-to-back PO from a sales order line
   * Calculates spread = sales_price - purchase_price
   */
  async createBackToBackPO(
    input: BackToBackPOInput,
  ): Promise<BackToBackResult> {
    // Get sales order line details
    const soLine = await this.knex('sales_order_lines')
      .join('sales_orders', 'sales_orders.id', 'sales_order_lines.order_id')
      .join('items', 'items.id', 'sales_order_lines.item_id')
      .join('customers', 'customers.id', 'sales_orders.customer_id')
      .where('sales_order_lines.id', input.salesOrderLineId)
      .where('sales_order_lines.order_id', input.salesOrderId)
      .select(
        'sales_order_lines.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'items.primary_uom',
        'items.item_category',
        'sales_orders.fulfillment_site_id',
        'customers.id as customer_id',
        'customers.business_name as customer_name',
      )
      .first();

    if (!soLine) {
      throw new NotFoundException(
        `Sales order line ${input.salesOrderLineId} not found`,
      );
    }

    // Check if back-to-back PO already exists for this line
    const existing = await this.knex('purchase_orders')
      .where('linked_sales_order_id', input.salesOrderId)
      .whereRaw(
        'EXISTS (SELECT 1 FROM purchase_order_lines WHERE po_id = purchase_orders.id AND item_id = ?)',
        [soLine.item_id],
      )
      .first();

    if (existing) {
      throw new BadRequestException(
        `Back-to-back PO already exists for this sales order line`,
      );
    }

    // Get supplier details
    const supplier = await this.supplierService.getById(input.supplierId);

    // Get latest rate from supplier for this item
    const supplierRate = await this.supplierService.getLatestRate(
      input.supplierId,
      soLine.item_id,
    );

    if (!supplierRate) {
      throw new BadRequestException(
        `No rate quote available from supplier ${supplier.company_name} for item ${soLine.item_sku}`,
      );
    }

    // Calculate spread: sales unit_price - purchase unit_price
    // sales_order_lines uses quoted_unit_price column
    const salesPriceMoney = Money.of(soLine.quoted_unit_price);
    const purchasePriceMoney = Money.of(supplierRate);
    const spread = salesPriceMoney.sub(purchasePriceMoney);
    // spreadPct = (salesPrice - purchasePrice) / salesPrice = marginPct
    const spreadPct = salesPriceMoney.isZero()
      ? 0
      : (Money.marginPct(salesPriceMoney, purchasePriceMoney)?.toNumber() ?? 0);

    // Create PO linked to sales order
    const result = await this.poService.create({
      supplierId: input.supplierId,
      receivingSiteId: soLine.fulfillment_site_id,
      lines: [
        {
          itemId: soLine.item_id,
          orderedQty: soLine.ordered_qty,
          unitPrice: supplierRate,
          userId: input.userId,
        },
      ],
      linkedSalesOrderId: input.salesOrderId,
      userId: input.userId,
    });

    // Emit back-to-back event
    await this.knex.transaction(async (trx) => {
      await this.outbox.raise(
        trx,
        'po.back_to_back_created',
        result.id,
        {
          poId: result.id,
          poNo: result.poNo,
          salesOrderId: input.salesOrderId,
          salesOrderLineId: input.salesOrderLineId,
          supplierId: input.supplierId,
          salesPrice: soLine.unit_price,
          purchasePrice: supplierRate,
          spread: spread.toStorageString(),
          spreadPct,
          itemId: soLine.item_id,
          orderedQty: soLine.ordered_qty,
        },
        'm2-procurement',
      );
    });

    this.logger.log(
      `Created back-to-back PO ${result.poNo} for SO line ${input.salesOrderLineId}, spread: ${spread.toStorageString()} (${(spreadPct * 100).toFixed(2)}%)`,
    );

    return {
      poId: result.id,
      poNo: result.poNo,
      spread: spread.toStorageString(),
      spreadPct,
    };
  }

  /**
   * Get back-to-back POs for a sales order
   */
  async getBackToBackPOs(salesOrderId: string): Promise<any[]> {
    const pos = await this.knex('purchase_orders')
      .where('linked_sales_order_id', salesOrderId)
      .join('suppliers', 'suppliers.id', 'purchase_orders.supplier_id')
      .select(
        'purchase_orders.*',
        'suppliers.supplier_code',
        'suppliers.company_name as supplier_name',
      );

    const results = [];
    for (const po of pos) {
      const lines = await this.knex('purchase_order_lines')
        .where('po_id', po.id)
        .join('items', 'items.id', 'purchase_order_lines.item_id')
        .select(
          'purchase_order_lines.*',
          'items.sku_code as item_sku',
          'items.name as item_name',
        );

      // Get corresponding sales order lines for spread calculation
      for (const line of lines) {
        const soLine = await this.knex('sales_order_lines')
          .where('order_id', salesOrderId)
          .where('item_id', line.item_id)
          .first('unit_price as sales_price', 'ordered_qty');

        if (soLine) {
          const salesPrice = Money.of(soLine.sales_price);
          const purchasePrice = Money.of(line.unit_price);
          const spread = salesPrice.sub(purchasePrice);
          line.spread = spread.toString();
          line.spreadPct = salesPrice.isZero()
            ? 0
            : (Money.marginPct(salesPrice, purchasePrice)?.toNumber() ?? 0);
        }
      }

      results.push({
        ...po,
        lines,
      });
    }

    return results;
  }

  /**
   * Get all back-to-back POs across all sales orders
   */
  async listBackToBackPOs(
    filters: {
      siteId?: string;
      supplierId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<any[]> {
    let query = this.knex('purchase_orders')
      .whereNotNull('linked_sales_order_id')
      .join('suppliers', 'suppliers.id', 'purchase_orders.supplier_id')
      .join(
        'sales_orders',
        'sales_orders.id',
        'purchase_orders.linked_sales_order_id',
      )
      .join('customers', 'customers.id', 'sales_orders.customer_id')
      .select(
        'purchase_orders.*',
        'suppliers.supplier_code',
        'suppliers.company_name as supplier_name',
        'sales_orders.so_no',
        'customers.name as customer_name',
      );

    if (filters.siteId) {
      query = query.where('purchase_orders.receiving_site_id', filters.siteId);
    }
    if (filters.supplierId) {
      query = query.where('purchase_orders.supplier_id', filters.supplierId);
    }
    if (filters.dateFrom) {
      query = query.where('purchase_orders.created_at', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('purchase_orders.created_at', '<=', filters.dateTo);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    return query.orderBy('purchase_orders.created_at', 'desc');
  }

  /**
   * Calculate aggregate spread for a sales order
   */
  async getSalesOrderSpread(salesOrderId: string): Promise<{
    totalSalesValue: string;
    totalPurchaseValue: string;
    totalSpread: string;
    spreadPct: number;
    lines: any[];
  }> {
    const pos = await this.getBackToBackPOs(salesOrderId);

    let totalSalesValue = Money.of('0');
    let totalPurchaseValue = Money.of('0');
    const lines = [];

    for (const po of pos) {
      for (const line of po.lines) {
        const salesPrice = line.spread
          ? Money.of(line.unit_price).add(Money.of(line.spread))
          : Money.of('0');
        const purchasePrice = Money.of(line.unit_price);
        const orderedQty = line.confirmed_qty;

        const lineSalesValue = salesPrice.mul(orderedQty);
        const linePurchaseValue = purchasePrice.mul(orderedQty);
        const lineSpread = lineSalesValue.sub(linePurchaseValue);

        totalSalesValue = totalSalesValue.add(lineSalesValue);
        totalPurchaseValue = totalPurchaseValue.add(linePurchaseValue);

        lines.push({
          itemId: line.item_id,
          itemSku: line.item_sku,
          itemName: line.item_name,
          orderedQty: line.confirmed_qty,
          salesPrice: salesPrice.toString(),
          purchasePrice: purchasePrice.toString(),
          spread: lineSpread.toString(),
          spreadPct: line.spreadPct ?? 0,
        });
      }
    }

    const totalSpread = totalSalesValue.sub(totalPurchaseValue);
    const spreadPct = totalSalesValue.isZero()
      ? 0
      : (Money.marginPct(totalSalesValue, totalPurchaseValue)?.toNumber() ?? 0);

    return {
      totalSalesValue: totalSalesValue.toString(),
      totalPurchaseValue: totalPurchaseValue.toString(),
      totalSpread: totalSpread.toString(),
      spreadPct,
      lines,
    };
  }

  /**
   * Suggest best supplier for back-to-back based on spread optimization
   */
  async suggestBestSupplier(
    salesOrderId: string,
    salesOrderLineId: string,
  ): Promise<
    {
      supplierId: string;
      supplierCode: string;
      supplierName: string;
      purchasePrice: string;
      spread: string;
      spreadPct: number;
      reliabilityScorePct: number;
      leadTimeDaysAvg: number;
    }[]
  > {
    const soLine = await this.knex('sales_order_lines')
      .where('id', salesOrderLineId)
      .where('order_id', salesOrderId)
      .join('items', 'items.id', 'sales_order_lines.item_id')
      .join('sales_orders', 'sales_orders.id', 'sales_order_lines.order_id')
      .select(
        'sales_order_lines.*',
        'items.id as item_id',
        'items.sku_code',
        'items.name',
        'sales_orders.fulfillment_site_id',
      )
      .first();

    if (!soLine) {
      throw new NotFoundException(`Sales order line not found`);
    }

    // Get approved suppliers for this item
    const suppliers = await this.supplierService.getApprovedSuppliersForItem(
      soLine.item_id,
    );

    const salesPrice = Money.of(soLine.unit_price);

    const suggestions = await Promise.all(
      suppliers.map(async (supplier) => {
        const latestRate = await this.supplierService.getLatestRate(
          String(supplier.id),
          soLine.item_id,
        );
        if (!latestRate) return null;

        const purchasePrice = Money.of(latestRate);
        const spread = salesPrice.sub(purchasePrice);
        const spreadPct = salesPrice.isZero()
          ? 0
          : (Money.marginPct(salesPrice, purchasePrice)?.toNumber() ?? 0);

        return {
          supplierId: String(supplier.id),
          supplierCode: supplier.supplier_code,
          supplierName: supplier.company_name,
          purchasePrice: latestRate,
          spread: spread.toString(),
          spreadPct,
          reliabilityScorePct: supplier.reliability_score_pct,
          leadTimeDaysAvg: supplier.lead_time_days_avg,
        };
      }),
    );

    // Filter valid and sort by spread descending (best margin first)
    return suggestions
      .filter((s): s is NonNullable<typeof s> => s !== null && s.spreadPct > 0)
      .sort((a, b) => b.spreadPct - a.spreadPct);
  }
}
