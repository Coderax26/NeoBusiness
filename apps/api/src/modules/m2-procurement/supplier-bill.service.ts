/**
 * Supplier Bill Service
 *
 * BR: Generate supplier bill for non-returns purchase transaction
 * BR: Route workflows: DRAFT → PENDING_APPROVAL → [APPROVED/REJECTED]
 * BR: 3-way match validation: PO.txn_date ≤ GRN.txn_date → PO.total_amount ≤ GRN.total_amount
 * BR: Ledger integration via LedgerPort for vendor accounting
 * BR: Route workflows: APPROVED → tax_invoice creation → receives_tax_invoice
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { generateUuidV7 } from '../../shared/utils/uuid.util.js';
import { SupplierService } from './supplier.service.js';
import { POService } from './po.service.js';
import { GRNService } from './grn.service.js';
import {
  SupplierBill,
  BillStatus,
  CreateBillDto,
  BillApprovalReason,
  THREE_WAY_STATUS,
  BillQueryDto,
} from './supplier-bill.types.js';

/**
 * Supplier Bill Workflows
 * DRAFT → PENDING_APPROVAL → APPROVED
 *        ↘───────────────── REJECTED
 * REJECTED → DRAFT
 */
function isValidBillTransition(from: BillStatus, to: BillStatus): boolean {
  const transitions: Record<BillStatus, BillStatus[]> = {
    [BillStatus.DRAFT]: [BillStatus.PENDING_APPROVAL],
    [BillStatus.PENDING_APPROVAL]: [BillStatus.APPROVED, BillStatus.REJECTED],
    [BillStatus.APPROVED]: [BillStatus.PAID],
    [BillStatus.PAID]: [],
    [BillStatus.REJECTED]: [BillStatus.DRAFT],
  };

  return transitions[from]?.includes(to) ?? false;
}

@Injectable()
export class SupplierBillService {
  private readonly logger = new Logger(SupplierBillService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly supplierService: SupplierService,
    private readonly poService: POService,
    private readonly grnService: GRNService,
    private readonly outbox: OutboxService,
    private readonly docNumber: DocNumberService,
  ) {}

  /**
   * Create a new supplier bill
   * Valid transitions: DRAFT → PENDING_APPROVAL
   */
  async create(input: CreateBillDto, userId: string): Promise<SupplierBill> {
    return this.knex.transaction(async (trx) => {
      // 1. Validate PO exists
      const po = await trx('purchase_orders')
        .where('id', input.po_id)
        .first('*');
      if (!po) {
        throw new NotFoundException(`Purchase order ${input.po_id} not found`);
      }

      // 2. Validate supplier exists
      const supplier = await trx('suppliers')
        .where('id', input.supplier_id)
        .first('*');
      if (!supplier) {
        throw new NotFoundException(`Supplier ${input.supplier_id} not found`);
      }

      // 3. Validate 3-way match
      const grns = await trx('goods_receipts')
        .where('po_id', input.po_id)
        .select('*');

      if (grns.length === 0) {
        throw new NotFoundException(`No GRNs found for PO ${input.po_id}`);
      }

      // Get GRN totals from lines
      const grnTotals = await trx('goods_receipt_lines')
        .where('grn_id', grns[0].id)
        .sum('received_qty as total_qty')
        .first();

      const grnTotalQty = Number(grnTotals?.total_qty ?? 0);

      const threeWayStatus = await this.validateThreeWayMatch(
        po,
        grns[0],
        grnTotalQty,
        input.items.reduce((sum, item) => sum + Number(item.quantity), 0),
      );

      if (threeWayStatus !== THREE_WAY_STATUS.MATCHED) {
        this.logger.warn(
          `3-way match status: ${threeWayStatus} for PO ${input.po_id}`,
        );
      }

      // 4. Validate all items exist
      for (const item of input.items) {
        const itemDoc = await trx('items').where('id', item.item_id).first('*');
        if (!itemDoc) {
          throw new NotFoundException(`Item ${item.item_id} not found`);
        }
      }

      // 5. Generate bill number
      const billNumber = await this.generateBillNumber(input.supplier_id, trx);

      // 6. Calculate totals
      const totals = this.calculateTotals(input);

      // 7. Generate UUIDv7 for bill record
      const billRecordId = generateUuidV7();

      // 8. Create bill record with canonical schema fields
      await trx('supplier_bills').insert({
        id: billRecordId,
        supplier_id: input.supplier_id,
        bill_no: billNumber,
        bill_number: billNumber,
        po_id: input.po_id,
        site_id: input.site_id,
        currency: 'INR',
        bill_date: input.bill_date || new Date(),
        due_date: this.calculateDueDate(input.due_days),
        amount: totals.total,
        total_amount: totals.total,
        subtotal: totals.subtotal,
        tax_total: totals.tax_total,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        status: BillStatus.PENDING_APPROVAL,
        three_way_status: threeWayStatus,
        created_by: userId,
        updated_by: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // 9. Create bill items with UUIDv7 and audit fields
      for (const item of input.items) {
        const itemId = generateUuidV7();
        await trx('supplier_bill_items').insert({
          id: itemId,
          bill_id: billRecordId,
          batch_id: item.batch_id,
          item_id: item.item_id,
          quantity: item.quantity,
          rate_per_unit: item.rate_per_unit,
          tax_amount: item.tax_amount,
          line_total: item.line_total,
          tax_treatment: item.tax_treatment || 'TAXABLE',
          tax_rate: item.tax_rate || '0',
          created_by: userId,
          updated_by: userId,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      // 10. Persist outbox domain event (awaited inside transaction)
      await this.outbox.raise(
        trx,
        'bill.created',
        billRecordId,
        {
          billId: billRecordId,
          billNumber,
          supplierId: input.supplier_id,
          poId: input.po_id,
          siteId: input.site_id,
          amount: totals.total,
          currency: 'INR',
          actorId: userId,
          createdAt: new Date().toISOString(),
        },
        'm2',
      );

      // 11. Return full bill
      return this.getById(billRecordId, trx);
    });
  }

  /**
   * Update bill status
   * Valid transitions:
   * - PENDING_APPROVAL → APPROVED
   * - PENDING_APPROVAL → REJECTED
   * - REJECTED → DRAFT
   */
  async updateStatus(
    billId: string,
    dto: { status: BillStatus; reason?: BillApprovalReason },
    approverId: string,
  ): Promise<SupplierBill> {
    return this.knex.transaction(async (trx) => {
      // 1. Validate bill exists
      const current = await trx('supplier_bills')
        .where('id', billId)
        .first('*');

      if (!current) {
        throw new NotFoundException(`Bill ${billId} not found`);
      }

      if (current.status === BillStatus.APPROVED && dto.status !== BillStatus.PAID) {
        throw new BadRequestException(`Bill ${billId} is already approved`);
      }

      if (!isValidBillTransition(current.status as BillStatus, dto.status)) {
        throw new BadRequestException(
          `Invalid status transition from ${current.status} to ${dto.status}`,
        );
      }

      // 2. Handle APPROVED transition
      if (dto.status === BillStatus.APPROVED) {
        if (!dto.reason) {
          throw new BadRequestException(
            'Approval reason required for APPROVED transition',
          );
        }

        const bill = await this.getById(billId, trx);

        // Idempotency: generate tax invoice only if not already linked
        let taxInvoiceId = current.tax_invoice_id;
        let invoiceNo = '';

        if (!taxInvoiceId) {
          const taxInvoice = await this.generateSupplierBillTaxInvoice(
            bill,
            approverId,
            trx,
          );
          taxInvoiceId = taxInvoice.id;
          invoiceNo = taxInvoice.invoice_no;
        }

        await trx('supplier_bills').where('id', billId).update({
          status: BillStatus.APPROVED,
          approved_by: approverId,
          approved_at: new Date(),
          approval_reason: dto.reason,
          tax_invoice_id: taxInvoiceId,
          updated_by: approverId,
          updated_at: new Date(),
        });

        // Raise approval event (awaited inside transaction)
        await this.outbox.raise(
          trx,
          'bill.approved',
          billId,
          {
            billId,
            billNumber: bill.bill_number ?? current.bill_no,
            supplierId: bill.supplier_id,
            siteId: bill.site_id,
            amount: bill.total_amount,
            currency: bill.currency ?? 'INR',
            taxInvoiceId,
            invoiceNo,
            approvedBy: approverId,
            approvedAt: new Date().toISOString(),
          },
          'm2',
        );

        return this.getById(billId, trx);
      }

      // 3. Handle REJECTED transition
      if (dto.status === BillStatus.REJECTED) {
        if (!dto.reason) {
          throw new BadRequestException(
            'Rejection reason required for REJECTED transition',
          );
        }

        await trx('supplier_bills').where('id', billId).update({
          status: BillStatus.REJECTED,
          rejection_reason: dto.reason,
          updated_by: approverId,
          updated_at: new Date(),
        });

        await this.outbox.raise(
          trx,
          'bill.rejected',
          billId,
          {
            billId,
            billNumber: current.bill_number ?? current.bill_no,
            supplierId: current.supplier_id,
            siteId: current.site_id,
            reason: dto.reason,
            rejectedBy: approverId,
            rejectedAt: new Date().toISOString(),
          },
          'm2',
        );

        return this.getById(billId, trx);
      }

      // 4. Handle PAID transition
      if (dto.status === BillStatus.PAID) {
        await trx('supplier_bills').where('id', billId).update({
          status: BillStatus.PAID,
          updated_by: approverId,
          updated_at: new Date(),
        });

        await this.outbox.raise(
          trx,
          'bill.paid',
          billId,
          {
            billId,
            billNumber: current.bill_number ?? current.bill_no,
            supplierId: current.supplier_id,
            siteId: current.site_id,
            paidBy: approverId,
            paidAt: new Date().toISOString(),
          },
          'm2',
        );

        return this.getById(billId, trx);
      }

      // 5. Handle DRAFT transition (from REJECTED)
      await trx('supplier_bills').where('id', billId).update({
        status: BillStatus.DRAFT,
        updated_by: approverId,
        updated_at: new Date(),
      });

      return this.getById(billId, trx);
    });
  }

  /**
   * Get bill by ID
   */
  async getById(id: string, trx?: Knex): Promise<SupplierBill> {
    const client = trx || this.knex;
    const bill = await client('supplier_bills').where('id', id).first('*');

    if (!bill) {
      throw new NotFoundException(`Bill ${id} not found`);
    }

    const itemsRows = await client('supplier_bill_items')
      .where('bill_id', id)
      .select('*');

    const items = itemsRows.map((row: any) => ({
      id: row.id,
      bill_id: row.bill_id,
      batch_id: row.batch_id,
      item_id: row.item_id,
      quantity: String(row.quantity),
      rate_per_unit: String(row.rate_per_unit),
      tax_amount: String(row.tax_amount),
      line_total: String(row.line_total),
      tax_treatment: row.tax_treatment,
      tax_rate: row.tax_rate,
      item_name: row.item_name ?? '',
    }));

    return {
      id: bill.id,
      bill_number: bill.bill_number ?? bill.bill_no,
      po_id: bill.po_id,
      grn_id: bill.grn_id,
      supplier_id: bill.supplier_id,
      site_id: bill.site_id,
      currency: bill.currency ?? 'INR',
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      subtotal: String(bill.subtotal ?? '0.00'),
      tax_total: String(bill.tax_total ?? '0.00'),
      total_amount: String(bill.total_amount ?? bill.amount ?? '0.00'),
      cgst: String(bill.cgst ?? '0.00'),
      sgst: String(bill.sgst ?? '0.00'),
      igst: String(bill.igst ?? '0.00'),
      status: bill.status as BillStatus,
      three_way_status: bill.three_way_status as THREE_WAY_STATUS,
      tax_invoice_id: bill.tax_invoice_id,
      rejection_reason: bill.rejection_reason,
      approval_reason: bill.approval_reason,
      approved_by: bill.approved_by,
      approved_at: bill.approved_at,
      created_by: bill.created_by,
      created_at: bill.created_at,
      updated_at: bill.updated_at,
      items,
    } as SupplierBill;
  }

  /**
   * List bills with optional filtering
   */
  async list(query: BillQueryDto, trx?: Knex): Promise<SupplierBill[]> {
    const buildQuery = (trx || this.knex)('supplier_bills').select('*');

    if (query.supplier_id) {
      buildQuery.where('supplier_id', query.supplier_id);
    }

    if (query.po_id) {
      buildQuery.where('po_id', query.po_id);
    }

    if (
      query.site_id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        query.site_id,
      )
    ) {
      buildQuery.where('site_id', query.site_id);
    }

    if (query.status) {
      buildQuery.where('status', query.status);
    }

    if (query.three_way_status) {
      buildQuery.where('three_way_status', query.three_way_status);
    }

    if (query.bill_number) {
      buildQuery.where((q) => {
        q.where('bill_number', 'ilike', `%${query.bill_number}%`).orWhere(
          'bill_no',
          'ilike',
          `%${query.bill_number}%`,
        );
      });
    }

    const results = await buildQuery.orderBy('created_at', 'desc');

    const bills = await Promise.all(
      results.map((bill) => this.getById(bill.id, trx || this.knex)),
    );

    return bills;
  }

  /**
   * Validate 3-way match
   * Rules:
   * 1. PO expected_delivery date ≤ GRN received_at date (timing check)
   * 2. PO total_amount ≤ GRN total_qty (amount check)
   */
  private async validateThreeWayMatch(
    po: any,
    grn: { id: string; received_at: Date },
    grnTotalQty: number,
    poTotalQty: number,
  ): Promise<THREE_WAY_STATUS> {
    const poExpectedDelivery = po.expected_delivery
      ? new Date(po.expected_delivery)
      : new Date();
    const grnReceivedAt = new Date(grn.received_at);

    const timingMismatch = grnReceivedAt > poExpectedDelivery;
    const amountMismatch = poTotalQty > grnTotalQty;

    if (!timingMismatch && !amountMismatch) {
      return THREE_WAY_STATUS.MATCHED;
    } else if (timingMismatch && !amountMismatch) {
      return THREE_WAY_STATUS.TIMING_MISMATCH;
    } else if (!timingMismatch && amountMismatch) {
      return THREE_WAY_STATUS.AMOUNT_MISMATCH;
    } else {
      return THREE_WAY_STATUS.FULL_MISMATCH;
    }
  }

  /**
   * Calculate bill totals
   */
  private calculateTotals(input: CreateBillDto) {
    let subtotal = 0;
    let totalTax = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;

    for (const item of input.items) {
      const lineTotal = Number(item.quantity) * Number(item.rate_per_unit);

      subtotal += lineTotal;
      totalTax += Number(item.tax_amount);

      const isInterState = false;
      if (isInterState) {
        totalIGST += Number(item.tax_amount);
      } else {
        const halfTax = Number(item.tax_amount) / 2;
        totalCGST += halfTax;
        totalSGST += halfTax;
      }
    }

    const total = subtotal + totalTax;

    return {
      subtotal: subtotal.toFixed(2),
      tax_total: totalTax.toFixed(2),
      total: total.toFixed(2),
      cgst: totalCGST.toFixed(2),
      sgst: totalSGST.toFixed(2),
      igst: totalIGST.toFixed(2),
    };
  }

  /**
   * Calculate due date
   */
  private calculateDueDate(dueDays = 30): Date {
    const due = new Date();
    due.setDate(due.getDate() + dueDays);
    return due;
  }

  /**
   * Generate bill number
   */
  private async generateBillNumber(
    supplierId: string,
    trx: Knex,
  ): Promise<string> {
    const prefix = `SUP-${supplierId.substring(0, 8)}`;
    const datePart = new Date().toISOString().slice(0, 10);

    const count = await trx('supplier_bills')
      .where('bill_number', 'like', `${prefix}-${datePart}%`)
      .orWhere('bill_no', 'like', `${prefix}-${datePart}%`)
      .count('id as count')
      .first();

    const seq = ((count as any).count ?? 0) + 1;
    const seqStr = seq.toString().padStart(4, '0');

    return `${prefix}-${datePart}-${seqStr}`;
  }

  /**
   * Generate supplier bill tax invoice
   */
  private async generateSupplierBillTaxInvoice(
    bill: SupplierBill,
    approverId: string,
    trx: Knex,
  ): Promise<{ id: string; invoice_no: string }> {
    const taxInvoiceId = generateUuidV7();
    const invoiceNo = await this.docNumber.next(
      'TAX_INVOICE',
      bill.site_id,
      null,
      trx as Knex.Transaction,
    );

    await trx('tax_invoices').insert({
      id: taxInvoiceId,
      invoice_type: 'SUPPLIER_BILL',
      bill_id: bill.id,
      customer_id: bill.supplier_id,
      site_id: bill.site_id,
      invoice_no: invoiceNo,
      invoice_date: new Date(),
      due_date: bill.due_date,
      total_amount: bill.total_amount,
      subtotal: bill.subtotal,
      tax_total: bill.tax_total,
      cgst: bill.cgst ?? '0.00',
      sgst: bill.sgst ?? '0.00',
      igst: bill.igst ?? '0.00',
      status: 'GENERATED',
      created_by: approverId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return { id: taxInvoiceId, invoice_no: invoiceNo };
  }

  async getSupplierLedger(supplierId: string) {
    const bills = await this.knex('supplier_bills')
      .where('supplier_id', supplierId)
      .orderBy('created_at', 'desc');

    const totalBilled = bills.reduce(
      (sum, b) => sum + Number(b.total_amount || b.amount || 0),
      0,
    );
    const totalPaid = bills
      .filter((b) => b.status === BillStatus.PAID)
      .reduce((sum, b) => sum + Number(b.total_amount || b.amount || 0), 0);

    return {
      supplierId,
      bills,
      totalBilled: totalBilled.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      outstandingBalance: (totalBilled - totalPaid).toFixed(2),
    };
  }

  async getApAging(siteId?: string) {
    let query = this.knex('supplier_bills as sb')
      .join('suppliers as s', 'sb.supplier_id', 's.id')
      .whereIn('sb.status', [BillStatus.APPROVED, 'RECEIVED', 'VERIFIED']);

    if (
      siteId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        siteId,
      )
    ) {
      query = query.where('sb.site_id', siteId);
    }

    const openBills = await query.select(
      'sb.id',
      'sb.supplier_id',
      's.company_name as supplier_name',
      'sb.due_date',
      'sb.total_amount',
      'sb.amount',
    );

    const now = Date.now();
    const buckets = {
      '0_7': { bucket: '0_7', label: '0-7 Days', amountInr: 0, billCount: 0 },
      '8_15': {
        bucket: '8_15',
        label: '8-15 Days',
        amountInr: 0,
        billCount: 0,
      },
      '16_30': {
        bucket: '16_30',
        label: '16-30 Days',
        amountInr: 0,
        billCount: 0,
      },
      '30_PLUS': {
        bucket: '30_PLUS',
        label: '30+ Days',
        amountInr: 0,
        billCount: 0,
      },
    };

    for (const b of openBills) {
      const amt = Number(b.total_amount || b.amount || 0);
      const dueDate = new Date(b.due_date).getTime();
      const overdueDays = Math.max(
        0,
        Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)),
      );

      if (overdueDays <= 7) {
        buckets['0_7'].amountInr += amt;
        buckets['0_7'].billCount++;
      } else if (overdueDays <= 15) {
        buckets['8_15'].amountInr += amt;
        buckets['8_15'].billCount++;
      } else if (overdueDays <= 30) {
        buckets['16_30'].amountInr += amt;
        buckets['16_30'].billCount++;
      } else {
        buckets['30_PLUS'].amountInr += amt;
        buckets['30_PLUS'].billCount++;
      }
    }

    return Object.values(buckets).map((b) => ({
      ...b,
      amountInr: b.amountInr.toFixed(2),
    }));
  }
}
