import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
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
import { POStateMachine } from './state-machines/po.state-machine.js';
import { SupplierService } from './supplier.service.js';

export interface POCreateInput {
  supplierId: string;
  receivingSiteId: string;
  lines: {
    itemId: string;
    orderedQty: string;
    unitPrice: string;
    userId: string;
  }[];
  expectedDelivery?: Date;
  linkedSalesOrderId?: string;
  userId: string;
}

export interface POConfirmQuantitiesInput {
  poId: string;
  confirmations: {
    lineId: string;
    confirmedQty: string;
    unitPrice: string;
    userId: string;
  }[];
}

export interface POIssueInput {
  poId: string;
  userId: string;
}

export interface POSummary {
  id: string;
  poNo: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  receivingSiteId: string;
  poStatus: string;
  totalAmount: string;
  expectedDelivery: string | null;
  linkedSalesOrderId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface POLineSummary {
  id: string;
  poId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  orderedQty: string;
  confirmedQty: string;
  receivedQty: string;
  unitPrice: string;
  lastPurchasePriceSnapshot: string;
  priceVariancePct: string;
}

/**
 * POService - Purchase Order lifecycle with BR-03 price spike detection
 *
 * Handles:
 * - PO creation from requisitions or manual
 * - Quantity confirmation with BR-03 price variance check (2% threshold)
 * - PO approval workflow (DRAFT -> PENDING_APPROVAL -> ISSUED)
 * - PO state machine transitions
 * - Domain event emission (po.issued, po.confirmed)
 */
@Injectable()
export class POService implements OnModuleInit {
  private readonly logger = new Logger(POService.name);
  private readonly stateMachine = new POStateMachine();

  // BR-03: Price spike threshold (2%)
  private readonly PRICE_SPIKE_THRESHOLD_PCT = 0.02;

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly exceptionService: ExceptionService,
    private readonly supplierService: SupplierService,
  ) {}

  onModuleInit(): void {
    // Register exception resolution handler for price spikes
    this.exceptionService.onResolved(
      'SUPPLIER_PRICE_SPIKE',
      async (exceptionId, action, remarks, counterJson) => {
        // Find and update the PO
        const exception = await this.knex('exception_approvals')
          .where('id', exceptionId)
          .first();

        if (!exception) return;

        const poLineId = exception.reference_id;

        // Check if this refers to a PO line
        const poLine = await this.knex('purchase_order_lines')
          .where('id', poLineId)
          .first('po_id');

        if (!poLine) return;

        if (action === 'APPROVED') {
          // Update the PO line first
          await this.knex('purchase_order_lines')
            .where('id', poLineId)
            .update({
              updated_by: exception.requested_by ?? null,
              updated_at: new Date(),
            });

          // Then update the PO status to ISSUED
          await this.knex('purchase_orders')
            .where('id', poLine.po_id)
            .update({
              po_status: 'ISSUED',
              updated_by: exception.requested_by ?? null,
              updated_at: new Date(),
            });
        } else if (action === 'REJECTED') {
          // Update the PO status to CANCELLED
          await this.knex('purchase_orders')
            .where('id', poLine.po_id)
            .update({
              po_status: 'CANCELLED',
              updated_by: exception.requested_by ?? null,
              updated_at: new Date(),
            });
        }
      },
    );

    this.logger.log('POService initialized with exception handlers');
  }

  /**
   * Create a new purchase order (DRAFT state)
   */
  async create(input: POCreateInput): Promise<{ id: string; poNo: string }> {
    const poNo = await this.docNumber.next(
      'PO',
      input.receivingSiteId,
      input.userId,
    );

    // Calculate total amount using Money utilities
    const totalAmount = input.lines.reduce((sum, line) => {
      const unitPrice = Money.of(line.unitPrice);
      const orderedQty = Qty.of(line.orderedQty, 'EA');
      const lineTotal = unitPrice.mul(orderedQty.toNumber());
      return sum.add(lineTotal);
    }, Money.zero());

    const [po] = await this.knex.transaction(async (trx) => {
      const [newPo] = await trx('purchase_orders')
        .insert({
          id: uuidv4(),
          po_no: poNo,
          supplier_id: input.supplierId,
          receiving_site_id: input.receivingSiteId,
          po_status: 'DRAFT',
          total_amount: totalAmount.toStorageString(),
          expected_delivery: input.expectedDelivery,
          linked_sales_order_id: input.linkedSalesOrderId,
          created_by: input.userId,
          updated_by: input.userId,
        })
        .returning(['id', 'po_no']);

      // Insert PO lines with price variance snapshot
      for (const line of input.lines) {
        // Get item UoM
        const item = await trx('items')
          .where('id', line.itemId)
          .first('primary_uom');
        const uom = item?.primary_uom ?? 'EA';

        // Get last purchase price for this item from this supplier
        const lastPrice = await this.getLastPurchasePrice(
          trx,
          input.supplierId,
          line.itemId,
        );

        await trx('purchase_order_lines').insert({
          id: uuidv4(),
          po_id: newPo.id,
          item_id: line.itemId,
          ordered_qty: line.orderedQty,
          confirmed_qty: '0.000',
          received_qty: '0.000',
          unit_price: line.unitPrice,
          last_purchase_price_snapshot: lastPrice,
          price_variance_pct: '0.0000',
          created_by: input.userId,
          updated_by: input.userId,
        });
      }

      return [newPo];
    });

    this.logger.log(`Created PO: ${poNo} (${input.lines.length} lines)`);
    return { id: String(po.id), poNo: String(po.po_no) };
  }

  /**
   * Confirm quantities and prices - applies BR-03 price spike detection
   * This is the critical business rule: if confirmed price > last purchase price + 2%
   * -> PENDING_APPROVAL + SUPPLIER_PRICE_SPIKE exception
   */
  async confirmQuantities(
    input: POConfirmQuantitiesInput,
  ): Promise<{ poStatus: string; exceptionsRaised: string[] }> {
    const po = await this.getById(input.poId);

    if (po.po_status !== 'DRAFT') {
      throw new BadRequestException(
        `Can only confirm quantities for DRAFT POs. Current: ${po.po_status}`,
      );
    }

    const exceptionsRaised: string[] = [];
    let hasPriceSpike = false;

    await this.knex.transaction(async (trx) => {
      for (const confirmation of input.confirmations) {
        const line = await trx('purchase_order_lines')
          .where('id', confirmation.lineId)
          .where('po_id', input.poId)
          .first();

        if (!line) {
          throw new NotFoundException(
            `PO line ${confirmation.lineId} not found`,
          );
        }

        // Get item UoM
        const item = await trx('items')
          .where('id', line.item_id)
          .first('primary_uom');
        const uom = item?.primary_uom ?? 'EA';

        const confirmedQty = Qty.of(confirmation.confirmedQty, uom);
        const orderedQty = Qty.of(line.ordered_qty, uom);

        if (confirmedQty.isGreaterThan(orderedQty)) {
          throw new BadRequestException(
            `Confirmed qty ${confirmedQty.toStorageString()} exceeds ordered qty ${orderedQty.toStorageString()}`,
          );
        }

        // BR-03: Price spike detection
        // Compare confirmed unitPrice against last_purchase_price_snapshot
        const lastPrice = Money.of(line.last_purchase_price_snapshot);
        const newPrice = Money.of(confirmation.unitPrice);

        let priceVariancePct = '0.0000';
        let lineHasSpike = false;

        if (lastPrice.isGreaterThanOrEqual(Money.zero())) {
          const variance = Money.marginPct(newPrice, lastPrice);
          if (variance !== null) {
            priceVariancePct = variance.toFixed(4);

            // Check if variance exceeds 2%
            if (variance.toNumber() > this.PRICE_SPIKE_THRESHOLD_PCT) {
              lineHasSpike = true;
              hasPriceSpike = true;

              // Raise SUPPLIER_PRICE_SPIKE exception
              const exceptionId = await this.exceptionService.raise(
                'SUPPLIER_PRICE_SPIKE',
                'purchase_order_lines',
                confirmation.lineId,
                confirmation.userId,
                {
                  title: `Price spike on PO ${po.po_no}`,
                  summary: `Confirmed price exceeds last purchase price by more than 2%`,
                  facts: [
                    { label: 'Last Price', value: lastPrice.toStorageString() },
                    { label: 'New Price', value: newPrice.toStorageString() },
                    {
                      label: 'Variance',
                      value: `${(variance.toNumber() * 100).toFixed(2)}%`,
                    },
                    {
                      label: 'Threshold',
                      value: `${(this.PRICE_SPIKE_THRESHOLD_PCT * 100).toFixed(2)}%`,
                    },
                  ],
                  impact:
                    'Price increase requires approval before PO can be issued',
                  actions: [
                    { code: 'APPROVE', label: 'Approve Price' },
                    { code: 'REJECT', label: 'Revert Price' },
                  ],
                  deepLink: `/procurement/purchase-orders/${input.poId}`,
                  valueAtRisk: newPrice.sub(lastPrice).toStorageString(),
                },
              );

              exceptionsRaised.push(exceptionId);
              this.logger.warn(
                `BR-03: Price spike detected on PO ${input.poId}, line ${confirmation.lineId}: ${variance.toNumber() * 100}% > ${this.PRICE_SPIKE_THRESHOLD_PCT * 100}%`,
              );
            }
          }
        }

        await trx('purchase_order_lines')
          .where('id', confirmation.lineId)
          .update({
            confirmed_qty: confirmation.confirmedQty,
            unit_price: confirmation.unitPrice,
            price_variance_pct: priceVariancePct,
            updated_by: confirmation.userId,
          });
      }

      // Determine new PO status
      const newStatus = hasPriceSpike ? 'PENDING_APPROVAL' : 'DRAFT';

      await trx('purchase_orders').where('id', input.poId).update({
        po_status: newStatus,
        updated_by: input.confirmations[0].userId,
      });

      // Emit po.confirmed event
      await this.outbox.raise(
        trx,
        'po.confirmed',
        input.poId,
        {
          poId: input.poId,
          poNo: po.po_no,
          supplierId: po.supplier_id,
          status: newStatus,
          exceptionsRaised,
        },
        'm2-procurement',
      );
    });

    return {
      poStatus: hasPriceSpike ? 'PENDING_APPROVAL' : 'DRAFT',
      exceptionsRaised,
    };
  }

  /**
   * Issue PO (DRAFT/PENDING_APPROVAL -> ISSUED)
   * Requires OWNER or OPS_COORD permission
   * Performs BR-03 price spike validation
   */
  async issuePO(
    input: POIssueInput,
  ): Promise<{ poId: string; poNo: string; status: string }> {
    const po = await this.getById(input.poId);

    let newState = 'ISSUED';

    // BR-03: Check for price spike on any PO line
    const lines = await this.knex('purchase_order_lines')
      .where('po_id', input.poId)
      .select('id', 'item_id', 'unit_price', 'last_purchase_price_snapshot');

    let hasSpike = false;
    const spikeLineIds: string[] = [];

    for (const line of lines) {
      const lastPrice = Money.of(line.last_purchase_price_snapshot);
      const newPrice = Money.of(line.unit_price);

      if (!lastPrice.isGreaterThanOrEqual(Money.zero())) continue;

      const variance = Money.marginPct(newPrice, lastPrice);
      if (
        variance !== null &&
        variance.toNumber() > this.PRICE_SPIKE_THRESHOLD_PCT
      ) {
        hasSpike = true;
        spikeLineIds.push(line.id);
        this.logger.warn(
          `BR-03: Price spike detected on PO line ${line.id}: ${variance.toNumber() * 100}%`,
        );
      }
    }

    newState = hasSpike ? 'PENDING_APPROVAL' : 'ISSUED';

    await this.knex.transaction(async (trx) => {
      // If there's a spike, raise exception inside transaction
      if (hasSpike) {
        for (const lineId of spikeLineIds) {
          const line = lines.find((l) => l.id === lineId);
          if (!line) continue;

          const lastPrice = Money.of(line.last_purchase_price_snapshot);
          const newPrice = Money.of(line.unit_price);
          const variance = Money.marginPct(newPrice, lastPrice);

          const varianceForException = Money.marginPct(newPrice, lastPrice);
          await this.exceptionService.raise(
            'SUPPLIER_PRICE_SPIKE',
            'purchase_order_lines',
            lineId,
            input.userId,
            {
              title: `Price spike on PO ${po.po_no}`,
              summary: `Confirmed price exceeds last purchase price by more than 2%`,
              facts: [
                { label: 'Last Price', value: lastPrice.toStorageString() },
                { label: 'New Price', value: newPrice.toStorageString() },
                {
                  label: 'Variance',
                  value: `${varianceForException!.toNumber() * 100}%`,
                },
              ],
              impact:
                'Price increase requires approval before PO can be issued',
              actions: [
                { code: 'APPROVE', label: 'Approve Price' },
                { code: 'REJECT', label: 'Revert Price' },
              ],
              deepLink: `/procurement/purchase-orders/${input.poId}`,
              valueAtRisk: newPrice.sub(lastPrice).toStorageString(),
            },
            po.receiving_site_id,
          );
        }
      }

      await trx('purchase_orders')
        .where('id', input.poId)
        .update({
          po_status: newState,
          approved_by: hasSpike ? null : input.userId,
          updated_by: input.userId,
        });

      // Emit po.issued event for M1 integration
      await this.outbox.raise(
        trx,
        'po.issued',
        input.poId,
        {
          poId: input.poId,
          poNo: po.po_no,
          supplierId: po.supplier_id,
          receivingSiteId: po.receiving_site_id,
          totalAmount: po.total_amount,
          expectedDelivery: po.expected_delivery,
          status: newState,
        },
        'm2-procurement',
      );
    });

    this.logger.log(`PO ${po.po_no} issued with status: ${newState}`);
    return { poId: input.poId, poNo: po.po_no, status: newState };
  }

  /**
   * Cancel PO (from any non-terminal state)
   */
  async cancelPO(poId: string, userId: string, reason?: string): Promise<void> {
    const po = await this.getById(poId);

    if (!this.stateMachine.canCancel(po.po_status)) {
      throw new BadRequestException(
        `Cannot cancel PO in status: ${po.po_status}`,
      );
    }

    await this.knex('purchase_orders').where('id', poId).update({
      po_status: 'CANCELLED',
      updated_by: userId,
    });

    this.logger.log(`PO cancelled: ${po.po_no} (reason: ${reason ?? 'none'})`);
  }

  /**
   * Get PO by ID with lines
   */
  async getById(poId: string): Promise<any> {
    const po = await this.knex('purchase_orders').where('id', poId).first();
    if (!po) {
      throw new NotFoundException(`PO ${poId} not found`);
    }
    return po;
  }

  /**
   * Get PO lines
   */
  async getLines(poId: string): Promise<POLineSummary[]> {
    const lines = await this.knex('purchase_order_lines')
      .where('po_id', poId)
      .join('items', 'items.id', 'purchase_order_lines.item_id')
      .select(
        'purchase_order_lines.*',
        'items.sku_code as item_sku',
        'items.name as item_name',
        'items.primary_uom',
      )
      .orderBy('purchase_order_lines.created_at');

    return lines.map((line) => ({
      id: String(line.id),
      poId: String(line.po_id),
      itemId: String(line.item_id),
      itemSku: line.item_sku,
      itemName: line.item_name,
      orderedQty: String(line.ordered_qty),
      confirmedQty: String(line.confirmed_qty),
      receivedQty: String(line.received_qty),
      unitPrice: String(line.unit_price),
      lastPurchasePriceSnapshot: String(line.last_purchase_price_snapshot),
      priceVariancePct: String(line.price_variance_pct),
    }));
  }

  /**
   * List POs with filters
   */
  async list(
    filters: {
      status?: string;
      supplierId?: string;
      siteId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<POSummary[]> {
    let query = this.knex('purchase_orders')
      .join('suppliers', 'suppliers.id', 'purchase_orders.supplier_id')
      .select(
        'purchase_orders.*',
        'suppliers.supplier_code',
        'suppliers.company_name as supplier_name',
      );

    if (filters.status) {
      query = query.where('purchase_orders.po_status', filters.status);
    }
    if (filters.supplierId) {
      query = query.where('purchase_orders.supplier_id', filters.supplierId);
    }
    const isUuid =
      !!filters.siteId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        filters.siteId,
      );
    if (isUuid) {
      query = query.where('purchase_orders.receiving_site_id', filters.siteId);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const pos = await query.orderBy('purchase_orders.created_at', 'desc');

    return pos.map((po) => ({
      id: String(po.id),
      poNo: po.po_no,
      supplierId: String(po.supplier_id),
      supplierCode: po.supplier_code,
      supplierName: po.supplier_name,
      receivingSiteId: String(po.receiving_site_id),
      poStatus: po.po_status,
      totalAmount: String(po.total_amount),
      expectedDelivery:
        po.expected_delivery?.toISOString().split('T')[0] ?? null,
      linkedSalesOrderId: po.linked_sales_order_id
        ? String(po.linked_sales_order_id)
        : null,
      createdAt: po.created_at.toISOString(),
      createdBy: String(po.created_by),
    }));
  }

  /**
   * Get last purchase price for supplier-item combination
   */
  private async getLastPurchasePrice(
    trx: Knex,
    supplierId: string,
    itemId: string,
  ): Promise<string> {
    // Get from most recent confirmed PO line
    const lastLine = await trx('purchase_order_lines')
      .join(
        'purchase_orders',
        'purchase_orders.id',
        'purchase_order_lines.po_id',
      )
      .where('purchase_orders.supplier_id', supplierId)
      .where('purchase_order_lines.item_id', itemId)
      .whereIn('purchase_orders.po_status', [
        'ISSUED',
        'PARTIALLY_RECEIVED',
        'CLOSED',
      ])
      .orderBy('purchase_orders.created_at', 'desc')
      .first('purchase_order_lines.unit_price');

    if (lastLine) {
      return String(lastLine.unit_price);
    }

    // Fallback: get from supplier_rate_quotes
    const lastQuote = await trx('supplier_rate_quotes')
      .where('supplier_id', supplierId)
      .where('item_id', itemId)
      .orderBy('quoted_at', 'desc')
      .first('quoted_price');

    if (lastQuote) {
      return String(lastQuote.quoted_price);
    }

    // Fallback: get from rate_contracts
    const contract = await trx('rate_contracts')
      .where('supplier_id', supplierId)
      .where('item_id', itemId)
      .where('valid_from', '<=', new Date())
      .where('valid_to', '>=', new Date())
      .orderBy('valid_from', 'desc')
      .first('agreed_price');

    if (contract) {
      return String(contract.agreed_price);
    }

    return '0.00';
  }

  /**
   * Get PO summary for a sales order (for back-to-back)
   */
  async getPOsForSalesOrder(salesOrderId: string): Promise<POSummary[]> {
    return this.list({ limit: 100 }).then((pos) =>
      pos.filter((p) => p.linkedSalesOrderId === salesOrderId),
    );
  }

  /**
   * Get total confirmed amount for a PO
   */
  async getTotalConfirmedAmount(poId: string): Promise<string> {
    const result = await this.knex('purchase_order_lines')
      .where('po_id', poId)
      .sum('confirmed_qty * unit_price as total')
      .first();

    return result?.total ?? '0.00';
  }

  /**
   * Check if PO can receive GRN
   */
  canReceive(poId: string): Promise<boolean> {
    return this.getById(poId).then((po) =>
      this.stateMachine.canReceive(po.po_status),
    );
  }
}
