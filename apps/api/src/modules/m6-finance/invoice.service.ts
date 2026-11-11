import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { NOTIFY_PORT } from '../../shared/ports/ports.interface.js';
import { PdfGeneratorService } from '../../shared/services/pdf-generator.service.js';

/**
 * InvoiceService — Tax invoice generation at dispatch
 *
 * BR: Generate tax invoice at dispatch (Mark Dispatched / trip.dispatched)
 * OD-003: Mixed taxable/exempt lines on one invoice; never edit posted invoice
 * GST split: CGST+SGST (intra-state) vs IGST (inter-state)
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly config: ConfigService,
    @Inject(NOTIFY_PORT) private readonly notify: any,
    @Optional() private readonly pdfGenerator?: PdfGeneratorService,
  ) {}

  /**
   * Generate invoice at dispatch for a sales order
   * Convenience wrapper around generateFromOrder with default options (no trip)
   */
  async generateAtDispatch(
    salesOrderId: string,
    siteId: string,
    userId: string,
  ) {
    return this.generateFromOrder(salesOrderId, siteId, userId, {});
  }
  async generateFromOrder(
    orderId: string,
    siteId: string,
    userId: string,
    options?: {
      tripId?: string;
      placeOfSupplyStateCode?: string;
      isCOD?: boolean;
    },
  ) {
    return this.knex.transaction(async (trx) => {
      const order = await trx('sales_orders').where('id', orderId).first('*');
      if (!order) throw new NotFoundException(`Order ${orderId} not found`);

      if (
        order.order_status !== 'CONFIRMED' &&
        order.order_status !== 'DISPATCHED'
      ) {
        throw new BadRequestException(
          `Order must be CONFIRMED or DISPATCHED to invoice`,
        );
      }

      // Check if already invoiced
      const existing = await trx('invoices')
        .where('sales_order_id', orderId)
        .first('id');
      if (existing)
        throw new BadRequestException(`Order ${orderId} already invoiced`);

      const lines = await trx('sales_order_lines')
        .where('order_id', orderId)
        .join('items', 'sales_order_lines.item_id', 'items.id')
        .select(
          'sales_order_lines.id as lineId',
          'sales_order_lines.item_id',
          'sales_order_lines.ordered_qty',
          'sales_order_lines.quoted_unit_price',
          'items.hsn_code',
          'items.tax_rate_pct',
          'items.tax_treatment',
          'items.name as itemName',
        );

      if (lines.length === 0)
        throw new BadRequestException('Order has no lines');

      const customer = await trx('customers')
        .where('id', order.customer_id)
        .first('*');
      if (!customer) throw new NotFoundException('Customer not found');

      // Get site for GST determination
      const site = await trx('sites').where('id', siteId).first('site_type');
      const supplierStateCode = site?.site_type ?? '00';
      const placeOfSupply =
        options?.placeOfSupplyStateCode ??
        customer.state_code ??
        supplierStateCode;
      const isInterState = supplierStateCode !== placeOfSupply;

      // Generate invoice number
      const invoiceNo = await this.docNumber.next('INVOICE', siteId, null, trx);

      // Calculate totals
      let totalTaxable = Money.zero();
      let totalCGST = Money.zero();
      let totalSGST = Money.zero();
      let totalIGST = Money.zero();
      let totalAmount = Money.zero();

      const invoiceLines = [];

      for (const line of lines) {
        const qty = Number(line.ordered_qty);
        const unitPrice = Money.of(line.quoted_unit_price);
        const lineTotal = unitPrice.mul(qty);
        totalAmount = totalAmount.add(lineTotal);

        const taxTreatment = line.tax_treatment ?? 'TAXABLE';
        const taxRate = Money.of(line.tax_rate_pct ?? '0').toNumber() / 100;

        let lineTaxAmount = Money.zero();
        let lineCGST = Money.zero();
        let lineSGST = Money.zero();
        let lineIGST = Money.zero();

        if (taxTreatment === 'TAXABLE' && taxRate > 0) {
          lineTaxAmount = lineTotal.mul(taxRate);
          totalTaxable = totalTaxable.add(lineTotal);

          if (isInterState) {
            lineIGST = lineTaxAmount;
            totalIGST = totalIGST.add(lineIGST);
          } else {
            lineCGST = lineTaxAmount.div(2);
            lineSGST = lineTaxAmount.div(2);
            totalCGST = totalCGST.add(lineCGST);
            totalSGST = totalSGST.add(lineSGST);
          }
        } else {
          // EXEMPT, NIL_RATED, NON_GST: tax_amount = 0
          totalTaxable = totalTaxable.add(Money.zero());
        }

        invoiceLines.push({
          item_id: line.item_id,
          qty: line.ordered_qty,
          unit_price: line.quoted_unit_price,
          line_total: lineTotal.toStorageString(),
          hsn_code: line.hsn_code,
          tax_rate_pct: line.tax_rate_pct ?? '0.00',
          tax_amount: lineTaxAmount.toStorageString(),
          tax_treatment: taxTreatment,
        });
      }

      // Due date: invoice_date + credit_days
      const creditDays = Number(customer.credit_days ?? 30);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + creditDays);

      // Insert invoice
      const [invoice] = await trx('invoices')
        .insert({
          site_id: siteId,
          customer_id: order.customer_id,
          sales_order_id: orderId,
          invoice_no: invoiceNo,
          invoice_date: new Date(),
          due_date: dueDate,
          total_amount: totalAmount.toStorageString(),
          paid_amount: '0.00',
          balance_due: totalAmount.toStorageString(),
          taxable_amount: totalTaxable.toStorageString(),
          cgst: totalCGST.toStorageString(),
          sgst: totalSGST.toStorageString(),
          igst: totalIGST.toStorageString(),
          status: 'UNPAID',
          is_cod: false,
          place_of_supply_state_code: placeOfSupply,
          created_by: userId,
          updated_by: userId,
        })
        .returning('*');

      const invoiceId = String(invoice.id);

      // Insert invoice lines
      for (const line of invoiceLines) {
        await trx('invoice_lines').insert({
          invoice_id: invoiceId,
          ...line,
        });
      }

      // Post customer ledger entry (INVOICE = DEBIT)
      const prevBal = await this.getCustomerBalance(order.customer_id, trx);
      const newBal = prevBal.add(totalAmount);
      await trx('customer_ledger_entries').insert({
        site_id: siteId,
        customer_id: order.customer_id,
        entry_type: 'INVOICE',
        debit: totalAmount.toStorageString(),
        ref_id: invoiceId,
        ref_no: invoiceNo,
        running_balance: newBal.toStorageString(),
        note: `Invoice ${invoiceNo}`,
      });

      // Update customer cached balance
      await trx('customers').where('id', order.customer_id).update({
        current_ar_balance: newBal.toStorageString(),
      });

      // Update order status
      await trx('sales_orders').where('id', orderId).update({
        order_status: 'DISPATCHED',
        updated_at: new Date(),
      });

      this.logger.log(
        `Invoice generated: ${invoiceNo} (${totalAmount.toStorageString()}) for order ${orderId}`,
      );

      // Emit domain event via outbox (to be implemented)
      // await this.knex('outbox_events').insert({...})

      return {
        invoiceId,
        invoiceNo,
        totalAmount: totalAmount.toStorageString(),
        balanceDue: totalAmount.toStorageString(),
        lines: invoiceLines,
        status: 'UNPAID',
      };
    });
  }

  /**
   * Get invoice detail with lines
   */
  async getInvoice(invoiceId: string) {
    const invoice = await this.knex('invoices')
      .where('id', invoiceId)
      .first('*');
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

    const lines = await this.knex('invoice_lines').where(
      'invoice_id',
      invoice.id,
    );
    // Return with camelCase property names for API consistency
    return {
      ...invoice,
      balanceDue: invoice.balance_due,
      totalAmount: invoice.total_amount,
      paidAmount: invoice.paid_amount,
      invoiceNo: invoice.invoice_no,
      status: invoice.status,
      lines,
    };
  }

  /**
   * List invoices for customer
   */
  async getCustomerInvoices(
    customerId: string,
    siteId: string,
    status?: string,
  ) {
    let query = this.knex('invoices')
      .where('customer_id', customerId)
      .andWhere('site_id', siteId)
      .orderBy('invoice_date', 'desc');

    if (status) query = query.andWhere('status', status);

    return query.select('*');
  }

  /**
   * List invoices with filters and pagination
   */
  async listInvoices(options: {
    siteId?: string;
    customerId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = this.knex('invoices');
    if (options.siteId) query = query.where('site_id', options.siteId);
    if (options.customerId) query = query.where('customer_id', options.customerId);
    if (options.status) query = query.where('status', options.status);
    if (options.fromDate) query = query.where('invoice_date', '>=', options.fromDate);
    if (options.toDate) query = query.where('invoice_date', '<=', options.toDate);

    const countRow = await query.clone().count<{ count: string }>('id as count').first();
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const items = await query
      .orderBy('invoice_date', 'desc')
      .limit(limit)
      .offset(offset)
      .select('*');

    return {
      items,
      total: Number(countRow?.count ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Generate Invoice PDF
   */
  async getInvoicePdf(invoiceId: string): Promise<Buffer> {
    const inv = await this.getInvoice(invoiceId);
    const customer = await this.knex('customers').where('id', inv.customer_id).first('*');
    const site = await this.knex('sites').where('id', inv.site_id).first('*');

    const pdfGen = this.pdfGenerator ?? new PdfGeneratorService();
    return pdfGen.generateInvoice({
      invoiceNo: inv.invoice_no,
      invoiceDate: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
      dueDate: new Date(inv.due_date).toLocaleDateString('en-IN'),
      customerName: customer?.name || customer?.business_name || 'Customer',
      customerAddress: customer?.billing_address,
      customerGstin: customer?.gstin,
      customerStateCode: customer?.state_code,
      placeOfSupplyStateCode: inv.place_of_supply_state_code,
      siteName: site?.name || 'NeoBus Depot',
      siteAddress: site?.address,
      siteGstin: site?.gstin,
      siteStateCode: site?.site_type,
      lines: (inv.lines || []).map((l: any) => ({
        itemName: l.itemName || l.item_id,
        hsnCode: l.hsn_code,
        qty: String(l.qty),
        unitPrice: String(l.unit_price),
        lineTotal: String(l.line_total),
        taxRatePct: String(l.tax_rate_pct || '0'),
        taxAmount: String(l.tax_amount || '0'),
      })),
      taxableAmount: String(inv.taxable_amount || inv.total_amount),
      cgst: String(inv.cgst || '0.00'),
      sgst: String(inv.sgst || '0.00'),
      igst: String(inv.igst || '0.00'),
      totalAmount: String(inv.total_amount),
      isCOD: Boolean(inv.is_cod),
    });
  }

  /**
   * Get current AR balance for customer
   */
  async getCustomerBalance(
    customerId: string,
    trx?: Knex.Transaction,
  ): Promise<Money> {
    const query = (trx ?? this.knex)('customer_ledger_entries')
      .where('customer_id', customerId)
      .orderBy('posted_at', 'desc')
      .first('running_balance');
    const row = await query;
    return row ? Money.of(row.running_balance) : Money.zero();
  }

  /**
   * Public method to send invoice notification
   * Extracted from private to allow M5 TripListenerService reuse
   */
  public async sendInvoiceNotification(
    customerId: string,
    invoiceNo: string,
    amount: string,
  ): Promise<void> {
    const customer = await this.knex('customers')
      .where('id', customerId)
      .first('business_name', 'phone', 'whatsapp_opt_in');
    if (!customer) return;

    const payload = {
      customerName: customer.business_name,
      invoiceNo,
      amount,
      date: new Date().toLocaleDateString('en-IN'),
    };

    if (customer.whatsapp_opt_in) {
      await this.notify.send(
        'WHATSAPP',
        'invoice_issued',
        customer.phone,
        payload,
      );
    } else {
      await this.notify.send('SMS', 'invoice_issued', customer.phone, payload);
    }
  }

  /**
   * Cancel invoice (owner approval required — exception in Sprint 2)
   * Posts reversal ledger entry
   */
  async cancelInvoice(invoiceId: string, userId: string, reason: string) {
    return this.knex.transaction(async (trx) => {
      const invoice = await trx('invoices').where('id', invoiceId).first('*');
      if (!invoice)
        throw new NotFoundException(`Invoice ${invoiceId} not found`);

      if (invoice.status === 'CANCELLED')
        throw new BadRequestException('Already cancelled');
      if (!Money.of(invoice.paid_amount).isZero()) {
        throw new BadRequestException(
          'Cannot cancel partially paid invoice — issue credit note instead',
        );
      }

      // Reverse ledger
      const prevBal = await this.getCustomerBalance(invoice.customer_id, trx);
      const newBal = prevBal.sub(Money.of(invoice.total_amount));
      await trx('customer_ledger_entries').insert({
        site_id: invoice.site_id,
        customer_id: invoice.customer_id,
        entry_type: 'ADJUSTMENT',
        credit: invoice.total_amount,
        ref_id: invoiceId,
        ref_no: invoice.invoice_no,
        running_balance: newBal.toStorageString(),
        note: `Cancelled: ${reason}`,
      });

      await trx('invoices').where('id', invoiceId).update({
        status: 'CANCELLED',
        updated_at: new Date(),
        updated_by: userId,
      });

      await trx('customers').where('id', invoice.customer_id).update({
        current_ar_balance: newBal.toStorageString(),
      });

      return { success: true };
    });
  }
}
