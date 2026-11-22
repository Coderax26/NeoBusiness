import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../shared/utils/money.util.js';
import { Qty } from '../../shared/utils/qty.util.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { ExceptionService } from '../m7a-exceptions/exception.service.js';
import { SupplierService } from './supplier.service.js';
import { POService } from './po.service.js';

export interface GRNCreateInput {
  poId?: string;
  siteId: string;
  locationId?: string;
  receivedBy: string;
  receivedAt?: Date;
  lines: {
    itemId: string;
    receivedQty: string;
    receivedQtySecondary?: string;
    batchLotNo?: string;
    mfgDate?: Date;
    expiryDate?: Date;
    conditionNote?: string;
  }[];
  gpsLat?: number;
  gpsLng?: number;
  userId: string;
}

export interface GRNSummary {
  id: string;
  grnNo: string;
  poId: string | null;
  poNo: string | null;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  siteId: string;
  locationId: string | null;
  receivedAt: string;
  receivedBy: string;
  createdAt: string;
}

export interface GRNLineSummary {
  id: string;
  grnId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  receivedQty: string;
  receivedQtySecondary: string;
  batchLotNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  conditionNote: string | null;
}

export interface BlindReceiveLineInput {
  itemId: string;
  receivedQty: string;
  receivedQtySecondary?: string;
  batchLotNo?: string;
  mfgDate?: Date;
  expiryDate?: Date;
  conditionNote?: string;
}

/**
 * GRNService - Blind Goods Receipt Note receiving with BR-05 shortfall detection
 *
 * Handles:
 * - Blind GRN creation (storekeeper sees item name + qty box only)
 * - BR-05: Shortfall detection (received < confirmed - 2%)
 * - Auto-create po_shortfalls records
 * - GRN posting emits grn.posted event for M3 inventory
 * - Stock ledger integration
 */
@Injectable()
export class GRNService {
  private readonly logger = new Logger(GRNService.name);

  // BR-05: Shortfall tolerance (2%)
  private readonly SHORTFALL_TOLERANCE_PCT = 0.02;

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly exceptionService: ExceptionService,
    private readonly supplierService: SupplierService,
    private readonly poService: POService,
  ) {}

  /**
   * Create a blind GRN - storekeeper only sees item name + qty box
   * Does NOT show expected qty or price
   */
  async createBlindGRN(
    input: GRNCreateInput,
  ): Promise<{ id: string; grnNo: string; shortfalls: any[] }> {
    // Get PO details if linked
    let po = null;
    let supplierId = null;
    let poLines: Map<string, any> = new Map();

    if (input.poId) {
      po = await this.poService.getById(input.poId);
      supplierId = po.supplier_id;
      const lines = await this.poService.getLines(input.poId);
      for (const line of lines) {
        poLines.set(line.itemId, line);
      }
    } else {
      // Direct GRN without PO - need supplier from first line's supplier_items
      const firstLine = input.lines[0];
      const suppliers = await this.supplierService.getApprovedSuppliersForItem(
        firstLine.itemId,
      );
      if (suppliers.length === 0) {
        throw new BadRequestException(
          `No approved supplier found for item ${firstLine.itemId}`,
        );
      }
      supplierId = suppliers[0].id;
    }

    const grnNo = await this.docNumber.next('GRN', input.siteId, input.userId);

    const shortfalls: any[] = [];
    let grnId = '';

    await this.knex.transaction(async (trx) => {
      const [grn] = await trx('goods_receipts')
        .insert({
          id: uuidv4(),
          grn_no: grnNo,
          po_id: input.poId,
          supplier_id: supplierId,
          site_id: input.siteId,
          location_id: input.locationId,
          received_by: input.receivedBy,
          received_at: input.receivedAt ?? new Date(),
          gps_lat: input.gpsLat,
          gps_lng: input.gpsLng,
          created_by: input.userId,
          updated_by: input.userId,
        })
        .returning(['id', 'grn_no']);
      grnId = String(grn.id);

      // Process each line - blind receive
      for (const line of input.lines) {
        const poLine = poLines.get(line.itemId);
        if (!poLine && input.poId) {
          // Debug: poLine might be undefined due to type mismatch, try direct lookup
          const lineInfo = await trx('purchase_order_lines')
            .where('po_id', input.poId)
            .where('item_id', line.itemId)
            .first();
          if (lineInfo) {
            const itemInfo = await trx('items')
              .where('id', line.itemId)
              .first('sku_code', 'name');
            poLines.set(line.itemId, {
              id: String(lineInfo.id),
              itemId: String(lineInfo.item_id),
              confirmedQty: String(lineInfo.confirmed_qty),
              itemSku: itemInfo?.sku_code,
              itemName: itemInfo?.name,
            });
          }
        }

        // Get item UoM for Qty operations
        const item = await trx('items')
          .where('id', line.itemId)
          .first('primary_uom');
        const uom = item?.primary_uom ?? 'EA';

        await trx('goods_receipt_lines').insert({
          id: uuidv4(),
          grn_id: grn.id,
          item_id: line.itemId,
          received_qty: line.receivedQty,
          received_qty_secondary: line.receivedQtySecondary ?? '0.000',
          batch_lot_no: line.batchLotNo,
          mfg_date: line.mfgDate,
          expiry_date: line.expiryDate,
          condition_note: line.conditionNote,
          created_by: input.userId,
          updated_by: input.userId,
        });

        // BR-05: Shortfall detection (only for PO-linked GRNs)
        const effectivePoLine = poLines.get(line.itemId);
        if (effectivePoLine) {
          const confirmedQty = Qty.of(effectivePoLine.confirmedQty, uom);
          const receivedQty = Qty.of(line.receivedQty, uom);

          // Shortfall if received < confirmed * (1 - tolerance)
          const thresholdFactor = 1 - this.SHORTFALL_TOLERANCE_PCT;
          const thresholdQty = confirmedQty.mul(thresholdFactor);

          if (receivedQty.isLessThan(thresholdQty)) {
            // Calculate deficit
            const deficitQty = confirmedQty.sub(receivedQty);
            const deficitQtyStr = deficitQty.toStorageString();

            // Create shortfall record
            const [shortfall] = await trx('po_shortfalls')
              .insert({
                id: uuidv4(),
                po_line_id: effectivePoLine.id,
                deficit_qty: deficitQtyStr,
                status: 'OPEN',
                created_by: input.userId,
                updated_by: input.userId,
              })
              .returning(['id', 'deficit_qty', 'status']);

            shortfalls.push({
              id: String(shortfall.id),
              itemId: line.itemId,
              itemSku: effectivePoLine.itemSku,
              itemName: effectivePoLine.itemName,
              confirmedQty: effectivePoLine.confirmedQty,
              receivedQty: line.receivedQty,
              deficitQty: deficitQtyStr,
              status: 'OPEN',
            });

            this.logger.warn(
              `BR-05: Shortfall detected on GRN ${grnNo}, item ${effectivePoLine.itemSku}: received ${receivedQty.toStorageString()} < confirmed ${confirmedQty.toStorageString()} * (1 - ${this.SHORTFALL_TOLERANCE_PCT * 100}%)`,
            );

            // Raise SUPPLIER_SHORTFALL exception (closest matching type)
            // Reference the PO line so backup PO creation can update it
            await this.exceptionService.raise(
              'SUPPLIER_SHORTFALL',
              'purchase_order_lines',
              effectivePoLine.id,
              input.userId,
              {
                title: `Shortfall on GRN ${grnNo}`,
                summary: `Received quantity below confirmed - 2% threshold`,
                facts: [
                  { label: 'Item', value: effectivePoLine.itemSku },
                  {
                    label: 'Confirmed Qty',
                    value: effectivePoLine.confirmedQty,
                  },
                  { label: 'Received Qty', value: line.receivedQty },
                  { label: 'Deficit Qty', value: deficitQtyStr },
                ],
                impact: `Supplier ${supplierId} delivered less than confirmed quantity`,
                actions: [
                  { code: 'APPROVE', label: 'Accept Shortfall' },
                  { code: 'REJECT', label: 'Request Replacement' },
                ],
                deepLink: `/procurement/grns/${grn.id}`,
                valueAtRisk: deficitQtyStr,
              },
              input.siteId,
            );
          }
        }
      }

      // Update PO status if fully received
      if (input.poId) {
        await this.updatePOStatusFromGRN(trx, input.poId);
      }

      // Emit grn.posted event for M3 inventory
      await this.outbox.raise(
        trx,
        'grn.posted',
        String(grn.id),
        {
          grnId: String(grn.id),
          grnNo: grnNo,
          poId: input.poId,
          supplierId: supplierId,
          siteId: input.siteId,
          lines: input.lines.map((l) => ({
            itemId: l.itemId,
            receivedQty: l.receivedQty,
            receivedQtySecondary: l.receivedQtySecondary ?? '0.000',
            batchLotNo: l.batchLotNo,
            mfgDate: l.mfgDate,
            expiryDate: l.expiryDate,
          })),
        },
        'm2-procurement',
      );
    });

    this.logger.log(
      `Created blind GRN: ${grnNo} (${input.lines.length} lines, ${shortfalls.length} shortfalls)`,
    );
    return { id: grnId, grnNo, shortfalls };
  }

  /**
   * Update PO status based on GRN receipts
   */
  private async updatePOStatusFromGRN(trx: Knex, poId: string): Promise<void> {
    const poLines = await trx('purchase_order_lines')
      .where('po_id', poId)
      .select('id', 'item_id', 'confirmed_qty', 'received_qty');

    const grnLines = await trx('goods_receipt_lines')
      .join('goods_receipts', 'goods_receipts.id', 'goods_receipt_lines.grn_id')
      .where('goods_receipts.po_id', poId)
      .select(
        'goods_receipt_lines.item_id',
        'goods_receipt_lines.received_qty',
      );

    // Aggregate received qty by item
    const receivedMap = new Map<string, string>();
    for (const line of grnLines) {
      const existing = receivedMap.get(String(line.item_id)) ?? '0.000';
      const item = await trx('items')
        .where('id', line.item_id)
        .first('primary_uom');
      const uom = item?.primary_uom ?? 'EA';
      const existingQty = Qty.of(existing, uom);
      const receivedQty = Qty.of(String(line.received_qty), uom);
      receivedMap.set(
        String(line.item_id),
        existingQty.add(receivedQty).toStorageString(),
      );
    }

    let allFullyReceived = true;
    let anyReceived = false;

    for (const poLine of poLines) {
      const received = receivedMap.get(String(poLine.item_id)) ?? '0.000';
      const item = await trx('items')
        .where('id', poLine.item_id)
        .first('primary_uom');
      const uom = item?.primary_uom ?? 'EA';
      const confirmed = Qty.of(String(poLine.confirmed_qty), uom);
      const receivedQty = Qty.of(received, uom);

      if (receivedQty.isGreaterThan(Qty.zero(uom))) {
        anyReceived = true;
      }

      if (receivedQty.isLessThan(confirmed)) {
        allFullyReceived = false;
      }

      // Update received_qty on PO line
      await trx('purchase_order_lines')
        .where('id', poLine.id)
        .update({ received_qty: received });
    }

    let newStatus: string;
    if (!anyReceived) {
      newStatus = 'ISSUED';
    } else if (allFullyReceived) {
      newStatus = 'CLOSED';
    } else {
      newStatus = 'PARTIALLY_RECEIVED';
    }

    await trx('purchase_orders')
      .where('id', poId)
      .update({ po_status: newStatus });
  }

  /**
   * Get GRN by ID
   */
  async getById(grnId: string): Promise<any> {
    const grn = await this.knex('goods_receipts')
      .join('suppliers', 'suppliers.id', 'goods_receipts.supplier_id')
      .join('purchase_orders', 'purchase_orders.id', 'goods_receipts.po_id')
      .where('goods_receipts.id', grnId)
      .select(
        'goods_receipts.*',
        'suppliers.supplier_code',
        'suppliers.company_name as supplier_name',
        'purchase_orders.po_no',
      )
      .first();

    if (!grn) {
      throw new NotFoundException(`GRN ${grnId} not found`);
    }
    return grn;
  }

  /**
   * Get GRN lines (blind view - no expected qty or price)
   */
  async getLines(grnId: string): Promise<GRNLineSummary[]> {
    const lines = await this.knex('goods_receipt_lines')
      .where('grn_id', grnId)
      .join('items', 'items.id', 'goods_receipt_lines.item_id')
      .select(
        'goods_receipt_lines.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'items.primary_uom',
        'items.secondary_uom',
      )
      .orderBy('goods_receipt_lines.created_at');

    return lines.map((line) => ({
      id: String(line.id),
      grnId: String(line.grn_id),
      itemId: String(line.item_id),
      itemSku: line.item_sku,
      itemName: line.item_name,
      receivedQty: String(line.received_qty),
      receivedQtySecondary: String(line.received_qty_secondary),
      batchLotNo: line.batch_lot_no,
      mfgDate: line.mfg_date?.toISOString().split('T')[0] ?? null,
      expiryDate: line.expiry_date?.toISOString().split('T')[0] ?? null,
      conditionNote: line.condition_note,
    }));
  }

  /**
   * Get blind receive view - only item name and qty input (no expected, no price)
   * Used by storekeeper mobile app
   */
  async getBlindReceiveView(poId: string): Promise<{
    poId: string;
    poNo: string;
    supplierName: string;
    lines: {
      itemId: string;
      itemSku: string;
      itemName: string;
      primaryUom: string;
      secondaryUom: string | null;
    }[];
  }> {
    const po = await this.poService.getById(poId);
    const supplier = await this.supplierService.getById(po.supplier_id);
    const poLines = await this.poService.getLines(poId);

    return {
      poId: po.id,
      poNo: po.po_no,
      supplierName: supplier.company_name,
      lines: poLines.map((line) => ({
        itemId: line.itemId,
        itemSku: line.itemSku,
        itemName: line.itemName,
        primaryUom: '', // Would need to fetch from items table
        secondaryUom: null,
      })),
    };
  }

  /**
   * List GRNs with filters
   */
  async list(
    filters: {
      poId?: string;
      supplierId?: string;
      siteId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<GRNSummary[]> {
    let query = this.knex('goods_receipts')
      .join('suppliers', 'suppliers.id', 'goods_receipts.supplier_id')
      .leftJoin('purchase_orders', 'purchase_orders.id', 'goods_receipts.po_id')
      .select(
        'goods_receipts.*',
        'suppliers.supplier_code',
        'suppliers.company_name as supplier_name',
        'purchase_orders.po_no',
      );

    if (filters.poId) {
      query = query.where('goods_receipts.po_id', filters.poId);
    }
    if (filters.supplierId) {
      query = query.where('goods_receipts.supplier_id', filters.supplierId);
    }
    if (
      filters.siteId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        filters.siteId,
      )
    ) {
      query = query.where('goods_receipts.site_id', filters.siteId);
    }
    if (filters.dateFrom) {
      query = query.where('goods_receipts.received_at', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('goods_receipts.received_at', '<=', filters.dateTo);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const grns = await query.orderBy('goods_receipts.received_at', 'desc');

    return grns.map((grn) => ({
      id: String(grn.id),
      grnNo: grn.grn_no,
      poId: grn.po_id ? String(grn.po_id) : null,
      poNo: grn.po_no ?? null,
      supplierId: String(grn.supplier_id),
      supplierCode: grn.supplier_code,
      supplierName: grn.supplier_name,
      siteId: String(grn.site_id),
      locationId: grn.location_id ? String(grn.location_id) : null,
      receivedAt: grn.received_at.toISOString(),
      receivedBy: String(grn.received_by),
      createdAt: grn.created_at.toISOString(),
    }));
  }

  /**
   * Get shortfalls for a PO
   */
  async getShortfallsForPO(poId: string): Promise<any[]> {
    return this.knex('po_shortfalls')
      .join(
        'purchase_order_lines',
        'purchase_order_lines.id',
        'po_shortfalls.po_line_id',
      )
      .join('items', 'items.id', 'purchase_order_lines.item_id')
      .where('purchase_order_lines.po_id', poId)
      .select(
        'po_shortfalls.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'purchase_order_lines.confirmed_qty',
        'purchase_order_lines.item_id',
      )
      .orderBy('po_shortfalls.created_at');
  }

  /**
   * Get open shortfalls for a supplier (for backup PO creation)
   */
  async getOpenShortfallsForSupplier(supplierId: string): Promise<any[]> {
    return this.knex('po_shortfalls')
      .join(
        'purchase_order_lines',
        'purchase_order_lines.id',
        'po_shortfalls.po_line_id',
      )
      .join(
        'purchase_orders',
        'purchase_orders.id',
        'purchase_order_lines.po_id',
      )
      .join('items', 'items.id', 'purchase_order_lines.item_id')
      .where('purchase_orders.supplier_id', supplierId)
      .where('po_shortfalls.status', 'OPEN')
      .select(
        'po_shortfalls.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'purchase_order_lines.confirmed_qty',
        'purchase_order_lines.received_qty',
        'purchase_orders.po_no',
        'purchase_orders.id as po_id',
      )
      .orderBy('po_shortfalls.created_at');
  }
}
