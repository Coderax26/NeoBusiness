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

      // Note: after-commit notification handled by transactional outbox pattern
      // For now, we'll emit domain event via outbox which M7a will relay
      // TODO: Add outbox event emission here

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
      .select('id', 'name');

    const customerMap = new Map(customers.map((c) => [c.id, c.name]));

    return receipts.map((r) => ({
      ...r,
      customerName: customerMap.get(r.customer_id) || 'Unknown',
    }));
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
        'customers.name as customerName',
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
}
