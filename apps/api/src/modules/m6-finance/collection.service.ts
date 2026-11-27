import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { LedgerService } from './ledger.service.js';
import { PTPService } from './ptp.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { EXCEPTION_PORT } from '../../shared/ports/ports.interface.js';
import type { ExceptionPort } from '../../shared/ports/ports.interface.js';

/**
 * CollectionService — Field collection workflow (BR-07)
 *
 * Handles:
 * - POST /collections (idempotent, offline-capable)
 * - Receipt validation & GPS capture
 * - WhatsApp/SMS receipt notification after commit
 * - PTP (Promise to Pay) workflow
 */
@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly ledger: LedgerService,
    private readonly ptpService: PTPService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    @Inject(EXCEPTION_PORT) private readonly exceptionPort: ExceptionPort,
  ) {}

  /**
   * Log a field collection (mobile endpoint, idempotent)
   * Implements BR-07 atomic transaction
   */
  async logCollection(cmd: {
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
  }) {
    return this.knex.transaction(async (trx) => {
      const result = await this.ledger.logCollection(cmd, trx);

      // Emit collection.logged domain event transactionally (via Outbox)
      await this.outbox.raise(
        trx,
        'collection.logged',
        result.receiptId,
        {
          receiptId: result.receiptId,
          customerId: cmd.customerId,
          collectedByUserId: cmd.collectedByUserId,
          amount: cmd.amount,
          paymentMode: cmd.paymentMode,
        },
        'm6',
      );

      return {
        success: true,
        receiptId: result.receiptId,
        receiptNo: result.receiptNo,
        allocatedAmount: result.allocatedAmount,
        customerBalance: result.customerBalance,
        custodyBalance: result.custodyBalance,
      };
    });
  }

  /**
   * Get collection receipt detail
   */
  async getReceipt(receiptId: string) {
    const receipt = await this.knex('collection_receipts')
      .where('id', receiptId)
      .first('*');
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`);

    const allocations = await this.knex('receipt_allocations')
      .join('invoices', 'receipt_allocations.invoice_id', 'invoices.id')
      .where('receipt_id', receiptId)
      .select(
        'invoices.invoice_no',
        'invoices.id as invoiceId',
        'receipt_allocations.allocated_amount',
      );

    return { ...receipt, allocations };
  }

  /**
   * Get today's collections for a user (My Collections screen)
   */
  async getMyCollections(userId: string, siteId: string, date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const start = `${targetDate} 00:00:00`;
    const end = `${targetDate} 23:59:59`;

    const receipts = await this.knex('collection_receipts')
      .where('collected_by_user_id', userId)
      .andWhere('site_id', siteId)
      .andWhereBetween('collected_at', [start, end])
      .orderBy('collected_at', 'desc')
      .select(
        'id',
        'receipt_no',
        'provisional_receipt_no',
        'amount',
        'payment_mode',
        'reference_no',
        'collected_at',
        'customer_id',
      );

    const customerIds = [...new Set(receipts.map((r) => r.customer_id))];
    const customers = await this.knex('customers')
      .whereIn('id', customerIds)
      .select('id', 'business_name');

    const customerMap = new Map(customers.map((c) => [c.id, c.business_name]));

    return receipts.map((r) => ({
      ...r,
      customerName: customerMap.get(r.customer_id) || 'Unknown',
    }));
  }

  /**
   * List receipts with filters and pagination
   */
  async listReceipts(options: {
    siteId?: string;
    customerId?: string;
    paymentMode?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = this.knex('collection_receipts');
    if (options.siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.siteId)) {
      query = query.where('site_id', options.siteId);
    }
    if (options.customerId) query = query.where('customer_id', options.customerId);
    if (options.paymentMode) query = query.where('payment_mode', options.paymentMode);
    if (options.fromDate) query = query.where('collected_at', '>=', options.fromDate);
    if (options.toDate) query = query.where('collected_at', '<=', options.toDate);

    const countRow = await query.clone().count<{ count: string }>('id as count').first();
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const items = await query
      .orderBy('collected_at', 'desc')
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
   * Get customer ledger (mobile AR view)
   */
  async getCustomerLedger(customerId: string, siteId: string, limit = 50) {
    return this.ledger.getCustomerLedger(customerId, siteId, limit);
  }

  /**
   * Get agent custody wallet (My Wallet screen)
   */
  async getMyWallet(userId: string, siteId: string) {
    const balance = await this.ledger.getCustodyBalance(userId);
    const entries = await this.ledger.getCustodyLedger(userId, siteId, 20);

    return {
      balance: balance.toStorageString(),
      entries,
    };
  }

  /**
   * Log Promise-to-Pay (PTP)
   * Scenario E: Customer promises payment by date with reason
   * Delegates to PTPService for validation and creation
   */
  async logPTP(cmd: {
    siteId: string;
    customerId: string;
    invoiceId?: string;
    promisedDate: Date;
    reasonCode: string;
    note?: string;
    loggedByUserId: string;
  }) {
    return this.ptpService.createPTP(cmd);
  }

  /**
   * Get PTPs due today (for worklist/follow-up)
   */
  async getPTPsDueToday(siteId: string, date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    return this.knex('ptp_followups')
      .where('site_id', siteId)
      .andWhere('promised_date', targetDate)
      .andWhere('status', 'OPEN')
      .join('customers', 'ptp_followups.customer_id', 'customers.id')
      .select(
        'ptp_followups.*',
        'customers.business_name as customerName',
        'customers.phone',
      );
  }

  /**
   * Mark PTP as kept/broken
   */
  async updatePTPStatus(
    ptpId: string,
    status: 'KEPT' | 'BROKEN',
    userId: string,
  ) {
    const [ptp] = await this.knex('ptp_followups')
      .where('id', ptpId)
      .update({ status, updated_by: userId, updated_at: new Date() })
      .returning('*');

    if (!ptp) throw new NotFoundException(`PTP ${ptpId} not found`);

    // If broken, escalate customer priority in next worklist generation
    if (status === 'BROKEN') {
      this.logger.warn(`PTP BROKEN: ${ptpId} for customer ${ptp.customer_id}`);
    }

    return ptp;
  }

  /**
   * Reverse a posted collection receipt via an immutable contra entry.
   */
  async reverseReceipt(receiptId: string, reason: string, userId: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Reversal reason is required');
    }

    return this.knex.transaction(async (trx) => {
      const orig = await trx('collection_receipts')
        .where('id', receiptId)
        .first('*');
      if (!orig) {
        throw new NotFoundException(`Receipt ${receiptId} not found`);
      }
      if (orig.reverses_receipt_id) {
        throw new BadRequestException('Cannot reverse a reversal receipt');
      }

      const alreadyReversed = await trx('collection_receipts')
        .where('reverses_receipt_id', receiptId)
        .first('id', 'receipt_no');
      if (alreadyReversed) {
        return {
          reversed: true,
          reversalReceiptId: alreadyReversed.id,
          reversalReceiptNo: alreadyReversed.receipt_no,
          alreadyReversed: true,
        };
      }

      const origAmt = Money.of(orig.amount);
      const revNo = `REV-${String(orig.receipt_no || String(receiptId).slice(0, 8))}`;

      const [revReceipt] = await trx('collection_receipts')
        .insert({
          site_id: orig.site_id,
          customer_id: orig.customer_id,
          receipt_no: revNo,
          provisional_receipt_no: orig.receipt_no,
          amount: (-Number(origAmt.toStorageString())).toFixed(2),
          on_account_amount: '0.00',
          payment_mode: orig.payment_mode,
          reference_no: `REV: ${reason.trim()}`.slice(0, 100),
          collected_by_user_id: userId || orig.collected_by_user_id,
          idempotency_key: `reversal:${receiptId}`,
          reverses_receipt_id: receiptId,
        })
        .returning('*');

      const allocs = await trx('receipt_allocations').where('receipt_id', receiptId);
      for (const alloc of allocs) {
        const inv = await trx('invoices').where('id', alloc.invoice_id).first('*');
        if (!inv) continue;
        const allocAmt = Money.of(alloc.allocated_amount);
        const curPaid = Money.of(inv.paid_amount);
        const nextPaid = curPaid.isLessThan(allocAmt) ? Money.zero() : curPaid.sub(allocAmt);
        const nextBal = Money.of(inv.total_amount).sub(nextPaid);
        const nextStatus = nextPaid.isZero()
          ? 'UNPAID'
          : nextBal.isZero()
            ? 'PAID'
            : 'PARTIAL';
        await trx('invoices').where('id', inv.id).update({
          paid_amount: nextPaid.toStorageString(),
          balance_due: nextBal.toStorageString(),
          status: nextStatus,
          updated_at: new Date(),
        });
      }

      const prevBal = await this.ledger.getCustomerBalance(String(orig.customer_id), trx);
      const nextBal = prevBal.add(origAmt);
      await trx('customer_ledger_entries').insert({
        site_id: orig.site_id,
        customer_id: orig.customer_id,
        entry_type: 'REVERSAL',
        debit: origAmt.toStorageString(),
        ref_id: revReceipt.id,
        ref_no: revNo,
        running_balance: nextBal.toStorageString(),
        note: `Receipt reversal (${orig.receipt_no}): ${reason.trim()}`,
      });
      await trx('customers').where('id', orig.customer_id).update({
        current_ar_balance: nextBal.toStorageString(),
        updated_at: new Date(),
      });

      if (['CASH', 'CHEQUE'].includes(String(orig.payment_mode))) {
        const prevCustody = await this.ledger.getCustodyBalance(
          String(orig.collected_by_user_id),
          trx,
        );
        const nextCustody = prevCustody.sub(origAmt);
        await trx('custody_ledger').insert({
          user_id: orig.collected_by_user_id,
          site_id: orig.site_id,
          entry_type: 'REVERSAL',
          amount_delta: (-Number(origAmt.toStorageString())).toFixed(2),
          receipt_id: revReceipt.id,
          running_balance: nextCustody.toStorageString(),
        });
      }

      return {
        reversed: true,
        reversalReceiptId: revReceipt.id,
        reversalReceiptNo: revNo,
        customerBalance: nextBal.toStorageString(),
      };
    });
  }
}
