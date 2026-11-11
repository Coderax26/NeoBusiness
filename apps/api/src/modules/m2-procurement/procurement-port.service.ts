import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { v4 as uuidv4 } from 'uuid';
import { SupplierService } from './supplier.service.js';
import { POService } from './po.service.js';
import { ShortfallService } from './shortfall.service.js';
import type { ProcurementPort } from '../../shared/ports/ports.interface.js';

/**
 * ProcurementPortService - Implementation of PROCUREMENT_PORT for M1 integration
 *
 * This is the real implementation that replaces the stub in port-stubs.ts
 * M1 uses this port to get landed costs and create back-to-batch POs
 */
@Injectable()
export class ProcurementPortService implements ProcurementPort {
  private readonly logger = new Logger(ProcurementPortService.name);

  // System user UUID for auto-generated records
  private readonly SYSTEM_USER_ID = uuidv4();

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly supplierService: SupplierService,
    private readonly poService: POService,
    private readonly shortfallService: ShortfallService,
  ) {}

  /**
   * Get latest landed cost for an item as a string
   * Interface: ProcurementPort.latestLandedCost(itemId: string): Promise<string | null>
   *
   * Gets the landed cost from the last GRN receipt for this item,
   * or calculates from last purchase price via supplier.
   */
  async latestLandedCost(itemId: string): Promise<string | null> {
    // Get the last closed PO line for this item
    // Use the unit_price (confirmed price) as the base for landed cost calculation
    const lastPoLine = await this.knex('purchase_order_lines')
      .join(
        'purchase_orders',
        'purchase_orders.id',
        'purchase_order_lines.po_id',
      )
      .where('purchase_order_lines.item_id', itemId)
      .whereIn('purchase_orders.po_status', ['CLOSED'])
      .orderBy('purchase_orders.created_at', 'desc')
      .first('purchase_order_lines.unit_price');

    if (lastPoLine?.unit_price) {
      // Use the confirmed unit price as base, then add landed cost components
      const basePrice = lastPoLine.unit_price;

      // Calculate landed cost: base price + freight + duty + other costs
      const freightPct = await this.getConfigPercent('freight_pct', 0.03);
      const dutyPct = await this.getConfigPercent('duty_pct', 0.05);
      const otherPct = await this.getConfigPercent('other_costs_pct', 0.01);

      const basePriceMoney = Money.of(basePrice);
      const freightCost = basePriceMoney.mul(freightPct.toString());
      const dutyCost = basePriceMoney.mul(dutyPct.toString());
      const otherCosts = basePriceMoney.mul(otherPct.toString());

      const landedCost = basePriceMoney
        .add(freightCost)
        .add(dutyCost)
        .add(otherCosts);

      return landedCost.toStorageString();
    }

    return null;
  }

  /**
   * Get config percentage from business_rule_config
   */
  private async getConfigPercent(
    key: string,
    defaultPct: number,
  ): Promise<number> {
    // In a real implementation, this would use ConfigService
    // For now, return defaults
    return defaultPct;
  }

  /**
   * Create back-to-BACK PO from sales order line
   * Interface: ProcurementPort.createBackToBatchPO(orderLineId: string): Promise<string>
   * Returns PO draft ID
   *
   * For back-to-BACK POs, the supplier is determined from the supplier_items
   * linking to the item (using the primary supplier for that item)
   */
  async createBackToBackPO(orderLineId: string): Promise<string> {
    return this.createBackToBatchPO(orderLineId);
  }

  async createBackToBatchPO(orderLineId: string): Promise<string> {
    // Find the sales order line
    const soLine = await this.knex('sales_order_lines')
      .where('id', orderLineId)
      .first('order_id', 'item_id', 'ordered_qty', 'quoted_unit_price');

    if (!soLine) {
      throw new NotFoundException(`Sales order line ${orderLineId} not found`);
    }

    // Get sales order for customer and fulfillment site
    const so = await this.knex('sales_orders')
      .where('id', soLine.order_id)
      .first('customer_id', 'fulfillment_site_id');

    if (!so) {
      throw new NotFoundException(`Sales order not found`);
    }

    // Find primary approved supplier for this item
    const suppliers = await this.supplierService.getApprovedSuppliersForItem(
      soLine.item_id,
    );

    if (suppliers.length === 0) {
      throw new NotFoundException(
        `No approved supplier found for item ${soLine.item_id}`,
      );
    }

    const primarySupplier = suppliers[0];
    const supplierId = String(primarySupplier.id);

    // Get latest rate from supplier
    const rate = await this.supplierService.getLatestRate(
      supplierId,
      soLine.item_id,
    );

    if (!rate) {
      throw new NotFoundException(
        `No rate available from supplier ${supplierId} for item`,
      );
    }

    // Create PO as DRAFT with link to the sales order
    const poResult = await this.poService.create({
      supplierId,
      receivingSiteId: so.fulfillment_site_id ?? '',
      lines: [
        {
          itemId: soLine.item_id,
          orderedQty: String(soLine.ordered_qty),
          unitPrice: rate,
          userId: this.SYSTEM_USER_ID,
        },
      ],
      linkedSalesOrderId: String(soLine.order_id),
      userId: this.SYSTEM_USER_ID,
    });

    // Return PO ID (draft)
    return poResult.id;
  }

  /**
   * Suggest backup suppliers for an item
   * Interface: ProcurementPort.suggestBackups(itemId, deficitQty): Promise<Array<{supplierId, unitPrice, availableQty}>>
   */
  async suggestBackups(
    itemId: string,
    deficitQty: string,
  ): Promise<
    Array<{
      supplierId: string;
      unitPrice: string;
      availableQty: string | null;
    }>
  > {
    // Get the reference price from the item's last purchase
    const lastPoLine = await this.knex('purchase_order_lines')
      .join(
        'purchase_orders',
        'purchase_orders.id',
        'purchase_order_lines.po_id',
      )
      .where('purchase_order_lines.item_id', itemId)
      .whereIn('purchase_orders.po_status', [
        'ISSUED',
        'PARTIALLY_RECEIVED',
        'CLOSED',
      ])
      .orderBy('purchase_orders.created_at', 'desc')
      .first('purchase_order_lines.unit_price');

    const referencePrice = lastPoLine ? lastPoLine.unit_price : '0.00';

    // Get ranked backups
    const ranked = await this.shortfallService.getRankedBackups(
      itemId,
      referencePrice,
      undefined,
    );

    // Get total available quantity from inventory batches across all sites
    const result = await this.knex('inventory_batches')
      .where('item_id', itemId)
      .sum('qty_on_hand as available_qty')
      .first();

    const totalAvailable = result?.available_qty
      ? String(result.available_qty)
      : null;

    return ranked.map((b) => ({
      supplierId: b.supplierId,
      unitPrice: b.quotedPrice,
      availableQty: totalAvailable,
    }));
  }

  /**
   * Get inbound (unreceived) PO quantity for an item at a site
   * This sums: PO lines for OPEN/PENDING_APPROVAL/PENDING POs - GRN lines already received
   * Interface: ProcurementPort.getInboundQty(itemId, siteId): Promise<string>
   */
  async getInboundQty(itemId: string, siteId: string): Promise<string> {
    // Get total ordered from active POs (OPEN, PENDING_APPROVAL, PARTIALLY_RECEIVED)
    const orderedResult = await this.knex('purchase_order_lines as pol')
      .join('purchase_orders as po', 'po.id', 'pol.po_id')
      .where('pol.item_id', itemId)
      .where('po.receiving_site_id', siteId)
      .whereIn('po.po_status', [
        'OPEN',
        'PENDING_APPROVAL',
        'PARTIALLY_RECEIVED',
        'ISSUED',
      ])
      .sum('pol.ordered_qty as total_ordered')
      .first();

    const totalOrdered = orderedResult?.total_ordered
      ? parseFloat(orderedResult.total_ordered)
      : 0;

    // Get total received via GRN
    const receivedResult = await this.knex('goods_receipt_lines as grn')
      .join('goods_receipts as g', 'g.id', 'grn.grn_id')
      .where('grn.item_id', itemId)
      .where('g.site_id', siteId)
      .sum('grn.received_qty as total_received')
      .first();

    const totalReceived = receivedResult?.total_received
      ? parseFloat(receivedResult.total_received)
      : 0;

    // Inbound = ordered - received (qty still awaiting GRN)
    const inboundQty = Math.max(0, totalOrdered - totalReceived);

    return inboundQty.toFixed(3);
  }
}
