import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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

export interface RequisitionCreateInput {
  itemId: string;
  qty: string;
  neededBy: Date;
  source: 'PRODUCTION' | 'SALES_ORDER' | 'MANUAL';
  sourceRefId?: string;
  requestedBy: string;
  userId: string;
}

export interface RequisitionGroupBySupplier {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  requisitions: any[];
  totalQty: string;
  totalLines: number;
}

export interface RequisitionSummary {
  id: string;
  reqNo: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  qty: string;
  neededBy: string;
  source: string;
  sourceRefId: string | null;
  status: string;
  requestedBy: string;
  createdAt: string;
}

/**
 * RequisitionService - Purchase requisitions from production/sales
 *
 * Handles:
 * - Create requisition (from production plan or sales order)
 * - Group requisitions by supplier for PO creation
 * - Convert requisitions to POs
 * - Status tracking (OPEN -> PO_CREATED -> CANCELLED)
 */
@Injectable()
export class RequisitionService {
  private readonly logger = new Logger(RequisitionService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly outbox: OutboxService,
    private readonly exceptionService: ExceptionService,
    private readonly supplierService: SupplierService,
    private readonly poService: POService,
  ) {}

  /**
   * Create a purchase requisition
   */
  async create(input: RequisitionCreateInput): Promise<{ id: string; reqNo: string }> {
    const reqNo = await this.docNumber.next('REQ', null, input.userId);

    const [req] = await this.knex('purchase_requisitions')
      .insert({
        id: uuidv4(),
        req_no: reqNo,
        item_id: input.itemId,
        qty: input.qty,
        needed_by: input.neededBy,
        source: input.source,
        source_ref_id: input.sourceRefId,
        status: 'OPEN',
        requested_by: input.requestedBy,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .returning(['id', 'req_no']);

    this.logger.log(`Created requisition: ${reqNo} for item ${input.itemId}, qty ${input.qty}`);

    // Emit event
    await this.knex.transaction(async (trx) => {
      await this.outbox.raise(trx, 'requisition.created', String(req.id), {
        requisitionId: String(req.id),
        reqNo: reqNo,
        itemId: input.itemId,
        qty: input.qty,
        neededBy: input.neededBy,
        source: input.source,
        sourceRefId: input.sourceRefId,
      }, 'm2-procurement');
    });

    return { id: String(req.id), reqNo: String(req.req_no) };
  }

  /**
   * Get requisition by ID
   */
  async getById(id: string): Promise<any> {
    const req = await this.knex('purchase_requisitions')
      .join('items', 'items.id', 'purchase_requisitions.item_id')
      .where('purchase_requisitions.id', id)
      .select(
        'purchase_requisitions.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'items.primary_uom',
      )
      .first();

    if (!req) {
      throw new NotFoundException(`Requisition ${id} not found`);
    }
    return req;
  }

  /**
   * List requisitions with filters
   */
  async list(filters: {
    status?: string;
    itemId?: string;
    source?: string;
    sourceRefId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<RequisitionSummary[]> {
    let query = this.knex('purchase_requisitions')
      .join('items', 'items.id', 'purchase_requisitions.item_id')
      .select(
        'purchase_requisitions.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
      );

    if (filters.status) {
      query = query.where('purchase_requisitions.status', filters.status);
    }
    if (filters.itemId) {
      query = query.where('purchase_requisitions.item_id', filters.itemId);
    }
    if (filters.source) {
      query = query.where('purchase_requisitions.source', filters.source);
    }
    if (filters.sourceRefId) {
      query = query.where('purchase_requisitions.source_ref_id', filters.sourceRefId);
    }
    if (filters.dateFrom) {
      query = query.where('purchase_requisitions.created_at', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('purchase_requisitions.created_at', '<=', filters.dateTo);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const reqs = await query.orderBy('purchase_requisitions.created_at', 'desc');

    return reqs.map(req => ({
      id: String(req.id),
      reqNo: req.req_no,
      itemId: String(req.item_id),
      itemSku: req.item_sku,
      itemName: req.item_name,
      qty: String(req.qty),
      neededBy: req.needed_by?.toISOString().split('T')[0] ?? null,
      source: req.source,
      sourceRefId: req.source_ref_id ? String(req.source_ref_id) : null,
      status: req.status,
      requestedBy: String(req.requested_by),
      createdAt: req.created_at.toISOString(),
    }));
  }

  /**
   * Group open requisitions by primary supplier
   * Used for PO creation efficiency
   */
  async getGroupedBySupplier(siteId?: string): Promise<RequisitionGroupBySupplier[]> {
    // Get open requisitions
    let reqQuery = this.knex('purchase_requisitions')
      .where('status', 'OPEN')
      .join('items', 'items.id', 'purchase_requisitions.item_id')
      .select(
        'purchase_requisitions.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
      );

    if (siteId) {
      // Filter by site through source_ref_id (production_requisitions or sales_orders)
      reqQuery = reqQuery.whereExists(
        this.knex('production_requisitions')
          .where('production_requisitions.id', 'purchase_requisitions.source_ref_id')
          .where('production_requisitions.site_id', siteId)
          .where('purchase_requisitions.source', 'PRODUCTION')
      ).orWhereExists(
        this.knex('sales_orders')
          .where('sales_orders.id', 'purchase_requisitions.source_ref_id')
          .where('sales_orders.fulfillment_site_id', siteId)
          .where('purchase_requisitions.source', 'SALES_ORDER')
      );
    }

    const requisitions = await reqQuery;

    // For each requisition, find primary supplier
    const grouped = new Map<string, RequisitionGroupBySupplier>();

    for (const req of requisitions) {
      const suppliers = await this.supplierService.getApprovedSuppliersForItem(req.item_id);
      if (suppliers.length === 0) continue;

      const primarySupplier = suppliers[0];
      const supplierId = String(primarySupplier.id);

      if (!grouped.has(supplierId)) {
        grouped.set(supplierId, {
          supplierId,
          supplierCode: primarySupplier.supplier_code,
          supplierName: primarySupplier.company_name,
          requisitions: [],
          totalQty: '0.000',
          totalLines: 0,
        });
      }

      const group = grouped.get(supplierId)!;
      group.requisitions.push(req);
      const item = await this.knex('items').where('id', req.item_id).first('primary_uom');
      const uom = item?.primary_uom ?? 'EA';
      const existingTotal = Qty.of(group.totalQty, uom);
      const addQty = Qty.of(String(req.qty), uom);
      group.totalQty = existingTotal.add(addQty).toStorageString();
      group.totalLines++;
    }

    return Array.from(grouped.values());
  }

  /**
   * Convert requisitions to a PO for a supplier
   */
  async convertToPO(supplierId: string, requisitionIds: string[], userId: string): Promise<{ poId: string; poNo: string }> {
    const requisitions = await this.knex('purchase_requisitions')
      .whereIn('id', requisitionIds)
      .join('items', 'items.id', 'purchase_requisitions.item_id')
      .select(
        'purchase_requisitions.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
      );

    if (requisitions.length === 0) {
      throw new BadRequestException('No requisitions found');
    }

    // Get supplier's latest rates for these items
    const supplier = await this.supplierService.getById(supplierId);
    const lines = [];
    const receivingSiteId = requisitions[0].source === 'PRODUCTION'
      ? await this.getSiteFromProductionReq(requisitionIds[0])
      : await this.getSiteFromSalesOrder(requisitionIds[0]);

    for (const req of requisitions) {
      const rate = await this.supplierService.getLatestRate(supplierId, req.item_id);
      if (!rate) {
        throw new BadRequestException(`No rate available from supplier ${supplier.company_name} for item ${req.item_sku}`);
      }

      lines.push({
        itemId: req.item_id,
        orderedQty: String(req.qty),
        unitPrice: rate,
        userId,
      });
    }

    // Create PO
    const poResult = await this.poService.create({
      supplierId,
      receivingSiteId: receivingSiteId || '',
      lines,
      userId,
    });

    // Update requisitions status
    await this.knex('purchase_requisitions')
      .whereIn('id', requisitionIds)
      .update({
        status: 'PO_CREATED',
        updated_by: userId,
      });

    this.logger.log(`Converted ${requisitions.length} requisitions to PO ${poResult.poNo} for supplier ${supplier.company_name}`);

    return { poId: poResult.id, poNo: poResult.poNo };
  }

  private async getSiteFromProductionReq(reqId: string): Promise<string | null> {
    const req = await this.knex('purchase_requisitions')
      .where('id', reqId)
      .first('source_ref_id');

    if (!req?.source_ref_id) return null;

    const prodReq = await this.knex('production_requisitions')
      .where('id', req.source_ref_id)
      .first('site_id');

    return prodReq?.site_id ? String(prodReq.site_id) : null;
  }

  private async getSiteFromSalesOrder(reqId: string): Promise<string | null> {
    const req = await this.knex('purchase_requisitions')
      .where('id', reqId)
      .first('source_ref_id');

    if (!req?.source_ref_id) return null;

    const so = await this.knex('sales_orders')
      .where('id', req.source_ref_id)
      .first('fulfillment_site_id');

    return so?.fulfillment_site_id ? String(so.fulfillment_site_id) : null;
  }

  /**
   * Cancel requisition
   */
  async cancel(reqId: string, userId: string): Promise<void> {
    await this.knex('purchase_requisitions')
      .where('id', reqId)
      .update({
        status: 'CANCELLED',
        updated_by: userId,
      });
  }

  /**
   * Get requisitions by source (production order or sales order)
   */
  async getBySource(source: 'PRODUCTION' | 'SALES_ORDER', sourceRefId: string): Promise<any[]> {
    return this.knex('purchase_requisitions')
      .where('source', source)
      .where('source_ref_id', sourceRefId)
      .join('items', 'items.id', 'purchase_requisitions.item_id')
      .select(
        'purchase_requisitions.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'items.primary_uom',
      )
      .orderBy('purchase_requisitions.created_at');
  }
}