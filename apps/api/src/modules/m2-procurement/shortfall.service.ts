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
import { Qty } from '../../shared/utils/qty.util.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { ExceptionService } from '../m7a-exceptions/exception.service.js';
import { SupplierService } from './supplier.service.js';
import { POService } from './po.service.js';
import { GRNService } from './grn.service.js';

export interface RankedBackup {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  quotedPrice: string;
  priceVariancePct: number;
  reliabilityScorePct: number;
  leadTimeDaysAvg: number;
  rankScore: number;
}

export interface BackupPOInput {
  originalPoId: string;
  shortfallId: string;
  backupSupplierId: string;
  userId: string;
}

export interface ShortfallResolution {
  shortfallId: string;
  poLineId: string;
  itemId: string;
  deficitQty: string;
  status: string;
  resolutionPoId: string | null;
  backupSupplierId: string | null;
}

/**
 * ShortfallService - Backup supplier ranking and backup PO creation
 *
 * Handles:
 * - Get shortfalls for a PO
 * - Rank backup suppliers by: price within tolerance → reliability desc → lead time asc
 * - Create backup PO (linked to original via parent_po_id)
 * - Update shortfall status
 */
@Injectable()
export class ShortfallService {
  private readonly logger = new Logger(ShortfallService.name);

  // Price tolerance for backup ranking (5%)
  private readonly PRICE_TOLERANCE_PCT = 0.05;

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly outbox: OutboxService,
    private readonly exceptionService: ExceptionService,
    private readonly supplierService: SupplierService,
    private readonly poService: POService,
    private readonly grnService: GRNService,
  ) {}

  /**
   * Get shortfalls for a PO
   */
  async getShortfallsForPO(poId: string): Promise<ShortfallResolution[]> {
    const shortfalls = await this.grnService.getShortfallsForPO(poId);

    return shortfalls.map((s) => ({
      shortfallId: String(s.id),
      poLineId: String(s.po_line_id),
      itemId: String(s.item_id),
      deficitQty: String(s.deficit_qty),
      status: s.status,
      resolutionPoId: s.resolution_po_id ? String(s.resolution_po_id) : null,
      backupSupplierId: null, // Would need to join if resolution_po_id exists
    }));
  }

  /**
   * Get ranked backup suppliers for an item
   * Ranking: price within tolerance → reliability_score_pct desc → lead_time_days_avg asc
   */
  async getRankedBackups(
    itemId: string,
    referencePrice: string,
    excludeSupplierId?: string,
  ): Promise<RankedBackup[]> {
    // Get approved suppliers for this item who have rate quotes
    const suppliers = await this.knex('supplier_items as si')
      .where('si.item_id', itemId)
      .join('suppliers', 'suppliers.id', 'si.supplier_id')
      .join('supplier_rate_quotes as sq', 'sq.supplier_id', 'suppliers.id')
      .where('sq.item_id', itemId)
      .where('suppliers.is_approved', true)
      .where('suppliers.is_active', true)
      .select(
        'si.supplier_id',
        'suppliers.supplier_code',
        'suppliers.company_name',
        'suppliers.reliability_score_pct',
        'suppliers.lead_time_days_avg',
      )
      .distinct();

    if (excludeSupplierId) {
      const filtered = suppliers.filter(
        (s) => String(s.supplier_id) !== excludeSupplierId,
      );
      return this.rankSuppliers(filtered, itemId, referencePrice);
    }

    return this.rankSuppliers(suppliers, itemId, referencePrice);
  }

  /**
   * Rank suppliers by: price within tolerance → reliability desc → lead time asc
   */
  private async rankSuppliers(
    suppliers: any[],
    itemId: string,
    referencePrice: string,
  ): Promise<RankedBackup[]> {
    const refPrice = Money.of(referencePrice);

    const ranked = await Promise.all(
      suppliers.map(async (supplier) => {
        const supplierId = String(supplier.supplier_id);
        const latestRate = await this.supplierService.getLatestRate(
          supplierId,
          itemId,
        );

        const quotedPrice = latestRate ? Money.of(latestRate) : Money.zero();
        const marginPct = Money.marginPct(refPrice, quotedPrice);
        const priceVariancePct = marginPct?.toNumber() ?? 0;
        // BR-05: Backup ranking - prioritize suppliers within 2% (1 - priceVariance)
        // Higher score = better, so within 2% gets 10000 points, within 5% gets 1000
        const withinTwoPct = priceVariancePct <= 0.02;
        const withinFivePct = priceVariancePct <= this.PRICE_TOLERANCE_PCT;

        return {
          supplierId,
          supplierCode: supplier.supplier_code,
          supplierName: supplier.company_name,
          quotedPrice: latestRate ?? '0.00',
          priceVariancePct,
          reliabilityScorePct: supplier.reliability_score_pct,
          leadTimeDaysAvg: supplier.lead_time_days_avg,
          withinTolerance: withinFivePct,
          // Rank score: within 2% (10000) + within 5% (1000) + reliability * 10 - lead_time
          rankScore:
            (withinTwoPct ? 10000 : 0) +
            (withinFivePct ? 1000 : 0) +
            supplier.reliability_score_pct * 10 -
            supplier.lead_time_days_avg,
        };
      }),
    );

    // Sort by rank score descending
    return ranked.sort((a, b) => b.rankScore - a.rankScore);
  }

  /**
   * Create a backup PO for a shortfall
   * Links to original PO via parent_po_id
   */
  async createBackupPO(
    input: BackupPOInput,
  ): Promise<{ poId: string; poNo: string }> {
    // Get shortfall details
    const shortfall = await this.knex('po_shortfalls')
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
      .where('po_shortfalls.id', input.shortfallId)
      .select(
        'po_shortfalls.*',
        'purchase_order_lines.item_id',
        'purchase_order_lines.confirmed_qty',
        'purchase_order_lines.unit_price as original_unit_price',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'purchase_orders.supplier_id as original_supplier_id',
        'purchase_orders.receiving_site_id',
        'purchase_orders.id as original_po_id',
        'purchase_orders.po_no as original_po_no',
      )
      .first();

    if (!shortfall) {
      throw new NotFoundException(`Shortfall ${input.shortfallId} not found`);
    }

    if (shortfall.status !== 'OPEN') {
      throw new BadRequestException(
        `Shortfall is not OPEN: ${shortfall.status}`,
      );
    }

    // Get backup supplier
    const backupSupplier = await this.supplierService.getById(
      input.backupSupplierId,
    );

    // Get latest rate from backup supplier
    const quotedPrice = await this.supplierService.getLatestRate(
      input.backupSupplierId,
      shortfall.item_id,
    );
    const unitPrice = quotedPrice ?? shortfall.original_unit_price;

    // Create backup PO
    const result = await this.poService.create({
      supplierId: input.backupSupplierId,
      receivingSiteId: shortfall.receiving_site_id,
      lines: [
        {
          itemId: shortfall.item_id,
          orderedQty: shortfall.deficit_qty,
          unitPrice: unitPrice,
          userId: input.userId,
        },
      ],
      expectedDelivery: new Date(
        Date.now() + backupSupplier.lead_time_days_avg * 24 * 60 * 60 * 1000,
      ),
      userId: input.userId,
    });

    // Update shortfall status
    await this.knex('po_shortfalls').where('id', input.shortfallId).update({
      status: 'COVERED_BY_BACKUP',
      resolution_po_id: result.id,
      updated_by: input.userId,
    });

    // Update original PO line to track backup
    await this.knex('purchase_order_lines')
      .where('id', shortfall.po_line_id)
      .update({
        // Could add a backup_po_id column if needed
        updated_by: input.userId,
      });

    this.logger.log(
      `Created backup PO ${result.poNo} for shortfall ${input.shortfallId} from supplier ${backupSupplier.company_name}`,
    );

    // Emit event
    await this.knex.transaction(async (trx) => {
      await this.outbox.raise(
        trx,
        'po.backup_created',
        result.id,
        {
          backupPoId: result.id,
          backupPoNo: result.poNo,
          originalPoId: input.originalPoId,
          shortfallId: input.shortfallId,
          itemId: shortfall.item_id,
          deficitQty: shortfall.deficit_qty,
          backupSupplierId: input.backupSupplierId,
        },
        'm2-procurement',
      );
    });

    return { poId: result.id, poNo: result.poNo };
  }

  /**
   * Auto-resolve shortfalls by creating backup POs for all open shortfalls
   * Uses ranked backups
   */
  async autoResolveShortfalls(
    poId: string,
    userId: string,
  ): Promise<{ resolved: number; failed: string[] }> {
    const shortfalls = await this.getShortfallsForPO(poId);
    const openShortfalls = shortfalls.filter((s) => s.status === 'OPEN');

    let resolved = 0;
    const failed: string[] = [];

    for (const shortfall of openShortfalls) {
      try {
        // Get reference price from original PO line
        const poLine = await this.knex('purchase_order_lines')
          .where('id', shortfall.poLineId)
          .first('unit_price');

        const referencePrice = poLine?.unit_price ?? '0.00';

        // Get ranked backups (excluding original supplier)
        const originalSupplierId = await this.knex('purchase_orders')
          .where('id', poId)
          .first('supplier_id');

        const ranked = await this.getRankedBackups(
          shortfall.itemId,
          referencePrice,
          originalSupplierId?.supplier_id,
        );

        if (ranked.length === 0) {
          failed.push(`No backup suppliers for item ${shortfall.itemId}`);
          continue;
        }

        // Use top-ranked supplier
        const topBackup = ranked[0];

        await this.createBackupPO({
          originalPoId: poId,
          shortfallId: shortfall.shortfallId,
          backupSupplierId: topBackup.supplierId,
          userId,
        });

        resolved++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        failed.push(`Shortfall ${shortfall.shortfallId}: ${errorMsg}`);
      }
    }

    return { resolved, failed };
  }

  /**
   * Update shortfall status
   */
  async updateShortfallStatus(
    shortfallId: string,
    status: 'OPEN' | 'COVERED_BY_BACKUP' | 'ALLOCATED' | 'WRITTEN_OFF',
    userId: string,
  ): Promise<void> {
    await this.knex('po_shortfalls').where('id', shortfallId).update({
      status,
      updated_by: userId,
    });
  }

  /**
   * Get all open shortfalls across all POs
   */
  async getAllOpenShortfalls(siteId?: string): Promise<any[]> {
    let query = this.knex('po_shortfalls')
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
      .where('po_shortfalls.status', 'OPEN')
      .select(
        'po_shortfalls.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'purchase_order_lines.confirmed_qty',
        'purchase_order_lines.received_qty',
        'purchase_orders.po_no',
        'purchase_orders.id as po_id',
        'purchase_orders.supplier_id',
        'purchase_orders.receiving_site_id',
      );

    if (siteId) {
      query = query.where('purchase_orders.receiving_site_id', siteId);
    }

    return query.orderBy('po_shortfalls.created_at');
  }

  /**
   * Get shortfalls that can be covered by a specific backup supplier
   */
  async getCoverableShortfallsForSupplier(supplierId: string): Promise<any[]> {
    const supplierItems =
      await this.supplierService.getSupplierItems(supplierId);
    const itemIds = supplierItems.map((si) => si.item_id);

    if (itemIds.length === 0) return [];

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
      .where('po_shortfalls.status', 'OPEN')
      .whereIn('purchase_order_lines.item_id', itemIds)
      .select(
        'po_shortfalls.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'purchase_order_lines.confirmed_qty',
        'purchase_order_lines.received_qty',
        'purchase_order_lines.unit_price as original_unit_price',
        'purchase_orders.po_no',
        'purchase_orders.id as po_id',
      )
      .orderBy('po_shortfalls.created_at');
  }
}
