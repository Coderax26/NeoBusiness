import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import type { LedgerPort } from '../../shared/ports/ports.interface.js';

/**
 * LedgerService — Core financial ledger operations (M6)
 *
 * Implements LedgerPort for cross-module access.
 * Enforces BR-07: Atomic collection logging across 3 ledgers in single transaction.
 *
 * Tables (append-only):
 * - customer_ledger_entries: AR sub-ledger (credit = payment, debit = invoice)
 * - custody_ledger: Agent's virtual wallet (positive = collection, negative = handover)
 * - cashbook_entries: Site-level cash book
 */
@Injectable()
export class LedgerService implements LedgerPort {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
  ) {}

  /**
   * BR-07: logCollection — Single transaction for field collection
   * Atomic operations:
   * 1. Insert collection_receipts (immutable)
   * 2. Allocate to invoices (FIFO) + update invoice paid/balance/status
   * 3. Post customer_ledger_entries CREDIT (reduces AR)
   * 4. Post custody_ledger COLLECTION (+amount) (increases agent wallet)
   * 5. If CHEQUE: insert cheque_register RECEIVED
   */
  async logCollection(
    cmd: {
      siteId: string;
      customerId: string;
      amount: string;
      onAccountAmount?: string;
      paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
      referenceNo?: string;
      collectedByUserId: string;
      gpsLatLng?: { lat: number; lng: number };
      deviceId?: string;
      idempotencyKey: string;
      chequeDetails?: { chequeNo: string; bank: string; chequeDate: Date };
      allocations?: Array<{ invoiceId: string; amount: string }>;
    },
    trx: Knex.Transaction,
  ): Promise<{
    receiptId: string;
    receiptNo: string;
    allocatedAmount: string;
    customerBalance: string;
    custodyBalance: string;
  }> {
    // Check idempotency
    const existing = await trx('collection_receipts')
      .where('idempotency_key', cmd.idempotencyKey)
      .first('id', 'receipt_no', 'amount');
    if (existing) {
      // Verify amount matches - reject if different amount on same idempotency key
      if (
        Money.of(existing.amount).toStorageString() !==
        Money.of(cmd.amount).toStorageString()
      ) {
        throw new BadRequestException(
          `Idempotency key ${cmd.idempotencyKey} already used with different amount: ${existing.amount} vs ${cmd.amount}`,
        );
      }
      this.logger.log(`Idempotent logCollection hit: ${cmd.idempotencyKey}`);
      const bal = await this.getCustomerBalance(cmd.customerId, trx);
      const custody = await this.getCustodyBalance(cmd.collectedByUserId, trx);
      return {
        receiptId: String(existing.id),
        receiptNo: existing.receipt_no,
        allocatedAmount: '0.00',
        customerBalance: bal.toStorageString(),
        custodyBalance: custody.toStorageString(),
      };
    }

    // Get next receipt number
    const receiptNo = await this.docNumber.next(
      'RECEIPT',
      cmd.siteId,
      null,
      trx,
    );
    const provisionalNo = cmd.idempotencyKey.slice(-8).toUpperCase();

    // 1. Insert collection_receipts
    const [receipt] = await trx('collection_receipts')
      .insert({
        site_id: cmd.siteId,
        customer_id: cmd.customerId,
        receipt_no: receiptNo,
        provisional_receipt_no: provisionalNo,
        amount: cmd.amount,
        on_account_amount: cmd.onAccountAmount ?? 0,
        payment_mode: cmd.paymentMode,
        reference_no: cmd.referenceNo,
        collected_by_user_id: cmd.collectedByUserId,
        gps_lat_lng: cmd.gpsLatLng
          ? trx.raw(`POINT(${cmd.gpsLatLng.lng} ${cmd.gpsLatLng.lat})`)
          : null,
        device_id: cmd.deviceId,
        idempotency_key: cmd.idempotencyKey,
      })
      .returning('*');

    const receiptId = String(receipt.id);
    let allocatedAmount = Money.zero();

    // 2. Allocate to invoices (FIFO default) or use provided allocations
    const targetInvoices =
      cmd.allocations ??
      (await this.getOpenInvoicesForAllocation(cmd.customerId, trx));

    for (const alloc of targetInvoices) {
      const inv = await trx('invoices').where('id', alloc.invoiceId).first();
      if (!inv || Money.of(inv.balance_due).isZero()) continue;

      const due = Money.of(inv.balance_due);
      const allocAmt = Money.of(alloc.amount);
      const actualAmt = allocAmt.isLessThan(due) ? allocAmt : due;

      if (actualAmt.isZero()) continue;

      // Create allocation
      await trx('receipt_allocations').insert({
        receipt_id: receiptId,
        invoice_id: alloc.invoiceId,
        allocated_amount: actualAmt.toStorageString(),
      });

      // Update invoice
      const newPaid = Money.of(inv.paid_amount).add(actualAmt);
      const newBalance = Money.of(inv.total_amount).sub(newPaid);
      let newStatus = inv.status;
      if (newBalance.isZero()) newStatus = 'PAID';
      if (!newPaid.isZero()) newStatus = 'PARTIAL';
      else newStatus = 'UNPAID';

      await trx('invoices').where('id', alloc.invoiceId).update({
        paid_amount: newPaid.toStorageString(),
        balance_due: newBalance.toStorageString(),
        status: newStatus,
        updated_at: new Date(),
      });

      allocatedAmount = allocatedAmount.add(actualAmt);
    }

    // 3. Post customer_ledger_entries CREDIT (reduces AR balance)
    const prevCustomerBal = await this.getCustomerBalance(cmd.customerId, trx);
    const newCustomerBal = prevCustomerBal.sub(allocatedAmount);
    await trx('customer_ledger_entries').insert({
      site_id: cmd.siteId,
      customer_id: cmd.customerId,
      entry_type: 'RECEIPT',
      credit: allocatedAmount.toStorageString(),
      ref_id: receiptId,
      ref_no: receiptNo,
      running_balance: newCustomerBal.toStorageString(),
    });

    // 4. Post custody_ledger COLLECTION (+amount) — agent wallet increases
    // Only CASH and CHEQUE go into physical custody wallet
    const custodyAmount = ['CASH', 'CHEQUE'].includes(cmd.paymentMode)
      ? allocatedAmount
      : Money.zero();
    if (!custodyAmount.isZero()) {
      const prevCustodyBal = await this.getCustodyBalance(
        cmd.collectedByUserId,
        trx,
      );
      const newCustodyBal = prevCustodyBal.add(custodyAmount);
      await trx('custody_ledger').insert({
        user_id: cmd.collectedByUserId,
        site_id: cmd.siteId,
        entry_type: 'COLLECTION',
        amount_delta: custodyAmount.toStorageString(),
        receipt_id: receiptId,
        running_balance: newCustodyBal.toStorageString(),
      });
    }

    // 5. If CHEQUE: insert cheque_register
    if (cmd.paymentMode === 'CHEQUE' && cmd.chequeDetails) {
      await trx('cheque_register').insert({
        receipt_id: receiptId,
        cheque_no: cmd.chequeDetails.chequeNo,
        bank: cmd.chequeDetails.bank,
        cheque_date: cmd.chequeDetails.chequeDate,
        amount: cmd.amount,
        status: 'RECEIVED',
      });
    }

    this.logger.log(
      `logCollection: ${receiptNo} for customer ${cmd.customerId}, amount ${allocatedAmount.toStorageString()}`,
    );

    return {
      receiptId,
      receiptNo,
      allocatedAmount: allocatedAmount.toStorageString(),
      customerBalance: newCustomerBal.toStorageString(),
      custodyBalance: (
        await this.getCustodyBalance(cmd.collectedByUserId, trx)
      ).toStorageString(),
    };
  }

  /**
   * Get open invoices for FIFO allocation (oldest due_date first)
   */
  private async getOpenInvoicesForAllocation(
    customerId: string,
    trx: Knex.Transaction,
  ): Promise<Array<{ invoiceId: string; amount: string }>> {
    const invoices = await trx('invoices')
      .where('customer_id', customerId)
      .whereIn('status', ['UNPAID', 'PARTIAL', 'OVERDUE'])
      .where('balance_due', '>', 0)
      .orderBy('due_date', 'asc')
      .orderBy('invoice_date', 'asc')
      .select('id', 'balance_due');

    return invoices.map((inv) => ({
      invoiceId: String(inv.id),
      amount: inv.balance_due,
    }));
  }

  /**
   * Get current AR balance for customer from ledger
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
   * Get current custody wallet balance for user
   */
  async getCustodyBalance(
    userId: string,
    trx?: Knex.Transaction,
  ): Promise<Money> {
    const query = (trx ?? this.knex)('custody_ledger')
      .where('user_id', userId)
      .orderBy('posted_at', 'desc')
      .first('running_balance');
    const row = await query;
    return row ? Money.of(row.running_balance) : Money.zero();
  }

  /**
   * Get customer ledger entries (for mobile/AR dashboard)
   */
  async getCustomerLedger(
    customerId: string,
    siteId: string,
    limit = 50,
  ): Promise<
    Array<{
      date: string;
      type: string;
      debit: string;
      credit: string;
      balance: string;
      refNo: string;
      note?: string;
    }>
  > {
    const rows = await this.knex('customer_ledger_entries')
      .where('customer_id', customerId)
      .andWhere('site_id', siteId)
      .orderBy('posted_at', 'desc')
      .limit(limit)
      .select(
        'posted_at',
        'entry_type',
        'debit',
        'credit',
        'running_balance',
        'ref_no',
        'note',
      );

    return rows.map((r) => ({
      date: r.posted_at.toISOString().split('T')[0],
      type: r.entry_type,
      debit: r.debit,
      credit: r.credit,
      balance: r.running_balance,
      refNo: r.ref_no,
      note: r.note,
    }));
  }

  /**
   * Get custody ledger for agent (My Wallet screen)
   */
  async getCustodyLedger(
    userId: string,
    siteId: string,
    limit = 50,
  ): Promise<
    Array<{
      date: string;
      type: string;
      delta: string;
      balance: string;
      receiptId?: string;
    }>
  > {
    const rows = await this.knex('custody_ledger')
      .where('user_id', userId)
      .andWhere('site_id', siteId)
      .orderBy('posted_at', 'desc')
      .limit(limit)
      .select(
        'posted_at',
        'entry_type',
        'amount_delta',
        'running_balance',
        'receipt_id',
      );

    return rows.map((r) => ({
      date: r.posted_at.toISOString().split('T')[0],
      type: r.entry_type,
      delta: r.amount_delta,
      balance: r.running_balance,
      receiptId: r.receipt_id,
    }));
  }

  /**
   * Get open / unpaid invoices
   */
  async getOpenInvoices(customerId?: string, siteId?: string) {
    let query = this.knex('invoices')
      .whereIn('status', ['UNPAID', 'PARTIAL', 'OVERDUE'])
      .orderBy('due_date', 'asc');

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (customerId && uuidRe.test(customerId)) query = query.where('customer_id', customerId);
    if (siteId && uuidRe.test(siteId)) query = query.where('site_id', siteId);

    return query.select('*');
  }

  /**
   * Get AR aging breakdown (0-7, 8-15, 16-30, 30+ days)
   */
  async getArAging(siteId?: string, asOfDate?: string) {
    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    let query = this.knex('invoices')
      .whereIn('status', ['UNPAID', 'PARTIAL', 'OVERDUE']);

    if (siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
      query = query.where('site_id', siteId);
    }

    const invoices = await query.select(
      'id',
      'customer_id',
      'invoice_no',
      'due_date',
      'balance_due',
    );

    let bucket0to7 = Money.zero();
    let bucket8to15 = Money.zero();
    let bucket16to30 = Money.zero();
    let bucket31plus = Money.zero();
    let totalOutstanding = Money.zero();

    for (const inv of invoices) {
      const balance = Money.of(inv.balance_due);
      if (balance.isZero()) continue;

      totalOutstanding = totalOutstanding.add(balance);
      const dueDate = new Date(inv.due_date);
      const diffMs = asOf.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 7) {
        bucket0to7 = bucket0to7.add(balance);
      } else if (diffDays <= 15) {
        bucket8to15 = bucket8to15.add(balance);
      } else if (diffDays <= 30) {
        bucket16to30 = bucket16to30.add(balance);
      } else {
        bucket31plus = bucket31plus.add(balance);
      }
    }

    return {
      asOfDate: asOf.toISOString().split('T')[0],
      totalOutstanding: totalOutstanding.toStorageString(),
      buckets: {
        '0_to_7_days': bucket0to7.toStorageString(),
        '8_to_15_days': bucket8to15.toStorageString(),
        '16_to_30_days': bucket16to30.toStorageString(),
        '31_plus_days': bucket31plus.toStorageString(),
      },
      invoiceCount: invoices.length,
    };
  }

  /**
   * Allocate an existing collection receipt to specific invoices
   */
  async allocateReceipt(
    receiptId: string,
    allocations: Array<{ invoiceId: string; amount: string }>,
  ) {
    return this.knex.transaction(async (trx) => {
      const receipt = await trx('collection_receipts')
        .where('id', receiptId)
        .first('*');
      if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`);

      const postedAllocations = [];
      for (const alloc of allocations) {
        const inv = await trx('invoices').where('id', alloc.invoiceId).first('*');
        if (!inv) continue;

        const allocAmt = Money.of(alloc.amount);
        if (allocAmt.isZero()) continue;

        await trx('receipt_allocations').insert({
          receipt_id: receiptId,
          invoice_id: alloc.invoiceId,
          allocated_amount: allocAmt.toStorageString(),
        });

        const newPaid = Money.of(inv.paid_amount).add(allocAmt);
        const newBalance = Money.of(inv.total_amount).sub(newPaid);
        let newStatus = inv.status;
        if (newBalance.isZero()) newStatus = 'PAID';
        else if (!newPaid.isZero()) newStatus = 'PARTIAL';

        await trx('invoices').where('id', alloc.invoiceId).update({
          paid_amount: newPaid.toStorageString(),
          balance_due: newBalance.toStorageString(),
          status: newStatus,
          updated_at: new Date(),
        });

        postedAllocations.push({
          invoiceId: alloc.invoiceId,
          invoiceNo: inv.invoice_no,
          allocatedAmount: allocAmt.toStorageString(),
          newBalance: newBalance.toStorageString(),
          status: newStatus,
        });
      }

      return postedAllocations;
    });
  }

  // ─── LedgerPort Implementation ─────────────────────────────────────────────

  async postInvoice(_tripId: string): Promise<string[]> {
    // Implemented in InvoiceService, delegated here for port compliance
    throw new Error(
      'postInvoice not implemented in LedgerService — use InvoiceService',
    );
  }

  async postReceipt(receiptId: string): Promise<void> {
    // Already handled in logCollection; this is a no-op for port compliance
    this.logger.debug(
      `postReceipt port called for ${receiptId} (already posted)`,
    );
  }

  async postCreditNote(creditNoteId: string): Promise<void> {
    return this.knex.transaction(async (trx) => {
      const creditNote = await trx('credit_notes')
        .where('id', creditNoteId)
        .first('*');

      if (!creditNote) {
        this.logger.warn(
          `Credit note ${creditNoteId} not found for ledger posting`,
        );
        return;
      }

      // Only post if status is ISSUED or APPROVED (not DRAFT, REJECTED, CANCELLED)
      if (!['ISSUED', 'APPROVED'].includes(creditNote.status)) {
        this.logger.debug(
          `Credit note ${creditNoteId} not in ISSUED/APPROVED status, skipping ledger post`,
        );
        return;
      }

      const totalDebit = Money.of(creditNote.total_debit);
      const customerId = String(creditNote.customer_id);
      const siteId = String(creditNote.site_id);

      // Get previous customer balance
      const prevBalance = await this.getCustomerBalance(customerId, trx);
      // Credit note reduces AR (credit to customer ledger)
      const newBalance = prevBalance.sub(totalDebit);

      // Post to customer_ledger_entries as ADJUSTMENT with CREDIT
      await trx('customer_ledger_entries').insert({
        site_id: siteId,
        customer_id: customerId,
        entry_type: 'ADJUSTMENT',
        credit: totalDebit.toStorageString(),
        ref_id: creditNoteId,
        ref_no: creditNote.credit_note_no,
        running_balance: newBalance.toStorageString(),
        note: `Credit note ${creditNote.credit_note_no} (${creditNote.reason_type})`,
      });

      // Update customer cached balance
      await trx('customers').where('id', customerId).update({
        current_ar_balance: newBalance.toStorageString(),
      });

      // If credit note is linked to an order, we may want to update invoice allocation
      // But for returned goods, we typically just reduce AR without specific invoice allocation

      this.logger.log(
        `Credit note ${creditNote.credit_note_no} posted to ledger: ${totalDebit.toStorageString()} credit for customer ${customerId}`,
      );
    });
  }

  /**
   * Recompute customer AR balance from ledger (nightly drift job)
   */
  async recomputeCustomerBalance(
    customerId: string,
    siteId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    const rows = await trx('customer_ledger_entries')
      .where('customer_id', customerId)
      .andWhere('site_id', siteId)
      .orderBy('posted_at', 'asc')
      .select('id', 'debit', 'credit', 'running_balance');

    let running = Money.zero();
    for (const row of rows) {
      running = running.add(row.debit).sub(row.credit);
      if (running.toStorageString() !== row.running_balance) {
        await trx('customer_ledger_entries')
          .where('id', row.id)
          .update({ running_balance: running.toStorageString() });
      }
    }

    // Update customer cached balance
    await trx('customers')
      .where('id', customerId)
      .update({ current_ar_balance: running.toStorageString() });
  }

  /**
   * Recompute agent custody balance from ledger (nightly drift job)
   */
  async recomputeCustodyBalance(
    userId: string,
    siteId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    const rows = await trx('custody_ledger')
      .where('user_id', userId)
      .andWhere('site_id', siteId)
      .orderBy('posted_at', 'asc')
      .select('id', 'amount_delta', 'running_balance');

    let running = Money.zero();
    for (const row of rows) {
      running = running.add(row.amount_delta);
      if (running.toStorageString() !== row.running_balance) {
        await trx('custody_ledger')
          .where('id', row.id)
          .update({ running_balance: running.toStorageString() });
      }
    }

    // Update user cached balance
    await trx('users')
      .where('id', userId)
      .update({ cash_custody_balance: running.toStorageString() });
  }
}
