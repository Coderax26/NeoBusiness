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
import { Clock } from '../../shared/utils/clock.util.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { LedgerService } from './ledger.service.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { NOTIFY_PORT } from '../../shared/ports/ports.interface.js';
import type { NotifyPort } from '../../shared/ports/ports.interface.js';

/**
 * ChequeService — Full cheque lifecycle state machine
 *
 * State transitions:
 * RECEIVED → DEPOSITED → CLEARED
 * RECEIVED → DEPOSITED → BOUNCED
 * RECEIVED → RETURNED (if not deposited)
 *
 * Each transition creates audit trail and updates custody wallet.
 */
@Injectable()
export class ChequeService {
  private readonly logger = new Logger(ChequeService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly ledger: LedgerService,
    private readonly docNumber: DocNumberService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(NOTIFY_PORT)
    private readonly notify?: NotifyPort,
  ) {}

  /**
   * Deposit a cheque (RECEIVED → DEPOSITED)
   * Called when driver/collector deposits cheque at bank
   */
  async depositCheque(cmd: {
    chequeId: string;
    depositedBy: string;
    depositSlipNo?: string;
    bankDepositRef?: string;
  }): Promise<{ success: boolean; cheque: any }> {
    return this.knex.transaction(async (trx) => {
      const cheque = await trx('cheque_register')
        .where('id', cmd.chequeId)
        .forUpdate()
        .first('*');

      if (!cheque) {
        throw new NotFoundException(`Cheque ${cmd.chequeId} not found`);
      }

      if (cheque.status !== 'RECEIVED') {
        throw new BadRequestException(
          `Cheque ${cmd.chequeId} cannot be deposited from status ${cheque.status}`,
        );
      }

      const now = Clock.nowUtc();

      await trx('cheque_register')
        .where('id', cmd.chequeId)
        .update({
          status: 'DEPOSITED',
          deposited_at: now,
          deposited_by: cmd.depositedBy,
          deposit_slip_no: cmd.depositSlipNo ?? null,
          bank_deposit_ref: cmd.bankDepositRef ?? null,
          updated_at: now,
          updated_by: cmd.depositedBy,
        });

      this.logger.log(
        `Cheque ${cheque.cheque_no} DEPOSITED by ${cmd.depositedBy} (slip: ${cmd.depositSlipNo})`,
      );

      // Notify relevant parties
      if (this.notify) {
        try {
          await this.notify.send(
            'IN_APP',
            'cheque_deposited',
            String(cheque.receipt_id),
            {
              chequeNo: cheque.cheque_no,
              amount: cheque.amount,
              depositedBy: cmd.depositedBy,
              depositSlipNo: cmd.depositSlipNo,
            },
          );
        } catch (err) {
          this.logger.warn(
            `Failed to send cheque deposited notification: ${(err as Error).message}`,
          );
        }
      }

      const updated = await trx('cheque_register')
        .where('id', cmd.chequeId)
        .first('*');

      return { success: true, cheque: updated };
    });
  }

  /**
   * Clear a cheque (DEPOSITED → CLEARED)
   * Called when bank confirms cheque clearance
   * Updates custody wallet (amount moves from driver to company)
   */
  async clearCheque(cmd: {
    chequeId: string;
    clearedBy: string;
  }): Promise<{ success: boolean; cheque: any }> {
    return this.knex.transaction(async (trx) => {
      const cheque = await trx('cheque_register')
        .where('id', cmd.chequeId)
        .forUpdate()
        .first('*');

      if (!cheque) {
        throw new NotFoundException(`Cheque ${cmd.chequeId} not found`);
      }

      if (cheque.status !== 'DEPOSITED') {
        throw new BadRequestException(
          `Cheque ${cmd.chequeId} cannot be cleared from status ${cheque.status}`,
        );
      }

      const now = Clock.nowUtc();
      const amount = Money.of(cheque.amount);

      // Get the collector who originally collected this cheque
      const receipt = await trx('collection_receipts')
        .where('id', cheque.receipt_id)
        .first('collected_by_user_id', 'site_id');

      if (!receipt) {
        throw new BadRequestException(`Receipt ${cheque.receipt_id} not found`);
      }

      const collectorId = String(receipt.collected_by_user_id);
      const siteId = String(receipt.site_id);

      // Update cheque status
      await trx('cheque_register').where('id', cmd.chequeId).update({
        status: 'CLEARED',
        cleared_at: now,
        cleared_by: cmd.clearedBy,
        updated_at: now,
        updated_by: cmd.clearedBy,
      });

      // Update custody ledger: cheque cleared means cash moves from collector to company
      // This is a HANDOVER entry (negative delta for collector)
      const prevCustodyBal = await this.ledger.getCustodyBalance(
        collectorId,
        trx,
      );
      const newCustodyBal = prevCustodyBal.sub(amount);

      await trx('custody_ledger').insert({
        user_id: collectorId,
        site_id: siteId,
        entry_type: 'HANDOVER',
        amount_delta: newCustodyBal.toStorageString(),
        receipt_id: cheque.receipt_id,
        running_balance: newCustodyBal.toStorageString(),
      });

      this.logger.log(
        `Cheque ${cheque.cheque_no} CLEARED by ${cmd.clearedBy} (amount: ${amount.toStorageString()})`,
      );

      // Notify collector
      if (this.notify) {
        try {
          await this.notify.send('IN_APP', 'cheque_cleared', collectorId, {
            chequeNo: cheque.cheque_no,
            amount: cheque.amount,
            clearedBy: cmd.clearedBy,
          });
        } catch (err) {
          this.logger.warn(
            `Failed to send cheque cleared notification: ${(err as Error).message}`,
          );
        }
      }

      const updated = await trx('cheque_register')
        .where('id', cmd.chequeId)
        .first('*');

      return { success: true, cheque: updated };
    });
  }

  /**
   * Bounce a cheque (DEPOSITED → BOUNCED)
   * Called when bank returns cheque unpaid
   * Reverses the collection ledger entry
   */
  async bounceCheque(cmd: {
    chequeId: string;
    bouncedBy: string;
    bounceReason: string;
  }): Promise<{ success: boolean; cheque: any }> {
    return this.knex.transaction(async (trx) => {
      const cheque = await trx('cheque_register')
        .where('id', cmd.chequeId)
        .forUpdate()
        .first('*');

      if (!cheque) {
        throw new NotFoundException(`Cheque ${cmd.chequeId} not found`);
      }

      if (cheque.status !== 'DEPOSITED') {
        throw new BadRequestException(
          `Cheque ${cmd.chequeId} cannot be bounced from status ${cheque.status}`,
        );
      }

      const now = Clock.nowUtc();
      const amount = Money.of(cheque.amount);

      // Get the original receipt and customer
      const receipt = await trx('collection_receipts')
        .where('id', cheque.receipt_id)
        .first('customer_id', 'collected_by_user_id', 'site_id', 'amount');

      if (!receipt) {
        throw new BadRequestException(`Receipt ${cheque.receipt_id} not found`);
      }

      const customerId = String(receipt.customer_id);
      const collectorId = String(receipt.collected_by_user_id);
      const siteId = String(receipt.site_id);

      // Update cheque status
      await trx('cheque_register').where('id', cmd.chequeId).update({
        status: 'BOUNCED',
        bounce_reason: cmd.bounceReason,
        bounced_at: now,
        updated_at: now,
        updated_by: cmd.bouncedBy,
      });

      // Reverse customer ledger entry (re-add the AR balance)
      const prevCustomerBal = await this.ledger.getCustomerBalance(
        customerId,
        trx,
      );
      const newCustomerBal = prevCustomerBal.add(amount);

      await trx('customer_ledger_entries').insert({
        site_id: siteId,
        customer_id: customerId,
        entry_type: 'ADJUSTMENT',
        debit: amount.toStorageString(),
        ref_id: cheque.receipt_id,
        ref_no: `CHEQUE_BOUNCE_${cheque.cheque_no}`,
        running_balance: newCustomerBal.toStorageString(),
        note: `Cheque ${cheque.cheque_no} bounced: ${cmd.bounceReason}`,
      });

      // Update customer cached balance
      await trx('customers').where('id', customerId).update({
        current_ar_balance: newCustomerBal.toStorageString(),
      });

      // Update custody ledger: remove the collection from collector's wallet
      const prevCustodyBal = await this.ledger.getCustodyBalance(
        collectorId,
        trx,
      );
      const newCustodyBal = prevCustodyBal.sub(amount);

      await trx('custody_ledger').insert({
        user_id: collectorId,
        site_id: siteId,
        entry_type: 'ADJUSTMENT',
        amount_delta: newCustodyBal.toStorageString(),
        receipt_id: cheque.receipt_id,
        running_balance: newCustodyBal.toStorageString(),
      });

      // Update invoice allocation if there was one
      // Re-open the invoice if it was marked PAID due to this cheque
      const allocations = await trx('receipt_allocations')
        .where('receipt_id', cheque.receipt_id)
        .join('invoices', 'receipt_allocations.invoice_id', 'invoices.id')
        .select('invoices.*', 'receipt_allocations.allocated_amount');

      for (const alloc of allocations) {
        const invoicePaid = Money.of(alloc.paid_amount);
        const allocatedAmt = Money.of(alloc.allocated_amount);
        const newPaid = invoicePaid.sub(allocatedAmt);
        const newBalance = Money.of(alloc.total_amount).sub(newPaid);
        let newStatus = 'UNPAID';
        if (newBalance.isZero()) newStatus = 'PAID';
        else if (!newPaid.isZero()) newStatus = 'PARTIAL';

        await trx('invoices').where('id', alloc.id).update({
          paid_amount: newPaid.toStorageString(),
          balance_due: newBalance.toStorageString(),
          status: newStatus,
          updated_at: new Date(),
        });
      }

      this.logger.log(
        `Cheque ${cheque.cheque_no} BOUNCED by ${cmd.bouncedBy}: ${cmd.bounceReason}`,
      );

      // Notify collector and owner
      if (this.notify) {
        try {
          await this.notify.send('IN_APP', 'cheque_bounced', collectorId, {
            chequeNo: cheque.cheque_no,
            amount: cheque.amount,
            bounceReason: cmd.bounceReason,
            customerId,
          });

          // Also notify owner
          const owner = await trx('users').where('role', 'OWNER').first('id');
          if (owner) {
            await this.notify.send(
              'IN_APP',
              'cheque_bounced',
              String(owner.id),
              {
                chequeNo: cheque.cheque_no,
                amount: cheque.amount,
                bounceReason: cmd.bounceReason,
                customerId,
                collectorId,
              },
            );
          }
        } catch (err) {
          this.logger.warn(
            `Failed to send cheque bounced notification: ${(err as Error).message}`,
          );
        }
      }

      const updated = await trx('cheque_register')
        .where('id', cmd.chequeId)
        .first('*');

      return { success: true, cheque: updated };
    });
  }

  /**
   * Return a cheque without depositing (RECEIVED → RETURNED)
   * Called when cheque is returned to customer before deposit
   */
  async returnCheque(cmd: {
    chequeId: string;
    returnedBy: string;
    returnReason: string;
  }): Promise<{ success: boolean; cheque: any }> {
    return this.knex.transaction(async (trx) => {
      const cheque = await trx('cheque_register')
        .where('id', cmd.chequeId)
        .forUpdate()
        .first('*');

      if (!cheque) {
        throw new NotFoundException(`Cheque ${cmd.chequeId} not found`);
      }

      if (cheque.status !== 'RECEIVED') {
        throw new BadRequestException(
          `Cheque ${cmd.chequeId} cannot be returned from status ${cheque.status}`,
        );
      }

      const now = Clock.nowUtc();
      const amount = Money.of(cheque.amount);

      // Get the original receipt and customer
      const receipt = await trx('collection_receipts')
        .where('id', cheque.receipt_id)
        .first('customer_id', 'collected_by_user_id', 'site_id');

      if (!receipt) {
        throw new BadRequestException(`Receipt ${cheque.receipt_id} not found`);
      }

      const customerId = String(receipt.customer_id);
      const collectorId = String(receipt.collected_by_user_id);
      const siteId = String(receipt.site_id);

      // Update cheque status
      await trx('cheque_register').where('id', cmd.chequeId).update({
        status: 'RETURNED',
        return_reason: cmd.returnReason,
        returned_at: now,
        returned_by: cmd.returnedBy,
        updated_at: now,
        updated_by: cmd.returnedBy,
      });

      // Reverse customer ledger entry (re-add the AR balance)
      const prevCustomerBal = await this.ledger.getCustomerBalance(
        customerId,
        trx,
      );
      const newCustomerBal = prevCustomerBal.add(amount);

      await trx('customer_ledger_entries').insert({
        site_id: siteId,
        customer_id: customerId,
        entry_type: 'ADJUSTMENT',
        debit: amount.toStorageString(),
        ref_id: cheque.receipt_id,
        ref_no: `CHEQUE_RETURN_${cheque.cheque_no}`,
        running_balance: newCustomerBal.toStorageString(),
        note: `Cheque ${cheque.cheque_no} returned: ${cmd.returnReason}`,
      });

      // Update customer cached balance
      await trx('customers').where('id', customerId).update({
        current_ar_balance: newCustomerBal.toStorageString(),
      });

      // Update custody ledger
      const prevCustodyBal = await this.ledger.getCustodyBalance(
        collectorId,
        trx,
      );
      const newCustodyBal = prevCustodyBal.sub(amount);

      await trx('custody_ledger').insert({
        user_id: collectorId,
        site_id: siteId,
        entry_type: 'ADJUSTMENT',
        amount_delta: newCustodyBal.toStorageString(),
        receipt_id: cheque.receipt_id,
        running_balance: newCustodyBal.toStorageString(),
      });

      this.logger.log(
        `Cheque ${cheque.cheque_no} RETURNED by ${cmd.returnedBy}: ${cmd.returnReason}`,
      );

      const updated = await trx('cheque_register')
        .where('id', cmd.chequeId)
        .first('*');

      return { success: true, cheque: updated };
    });
  }

  /**
   * Get cheque details with full history
   */
  async getCheque(chequeId: string) {
    const cheque = await this.knex('cheque_register')
      .where('id', chequeId)
      .first('*');

    if (!cheque) return null;

    const receipt = await this.knex('collection_receipts')
      .where('id', cheque.receipt_id)
      .first('*');

    return { ...cheque, receipt };
  }

  /**
   * List cheques by status
   */
  async listCheques(
    siteId: string,
    status?: string,
    limit = 50,
  ): Promise<Array<any>> {
    let query = this.knex('cheque_register')
      .join(
        'collection_receipts',
        'cheque_register.receipt_id',
        'collection_receipts.id',
      )
      .where('collection_receipts.site_id', siteId)
      .orderBy('cheque_register.created_at', 'desc')
      .limit(limit)
      .select(
        'cheque_register.*',
        'collection_receipts.receipt_no',
        'collection_receipts.customer_id',
      );

    if (status) {
      query = query.andWhere('cheque_register.status', status);
    }

    return query;
  }

  /**
   * Get pending cheques that need follow-up (deposited but not cleared/bounced)
   */
  async getPendingCheques(
    siteId: string,
    daysThreshold = 7,
  ): Promise<Array<any>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    return this.knex('cheque_register')
      .join(
        'collection_receipts',
        'cheque_register.receipt_id',
        'collection_receipts.id',
      )
      .where('collection_receipts.site_id', siteId)
      .andWhere('cheque_register.status', 'DEPOSITED')
      .andWhere('cheque_register.deposited_at', '<', cutoffDate)
      .orderBy('cheque_register.deposited_at', 'asc')
      .select(
        'cheque_register.*',
        'collection_receipts.receipt_no',
        'collection_receipts.customer_id',
      );
  }
}

// Export the provider for module wiring
export const ChequeProvider = {
  provide: 'CHEQUE_SERVICE',
  useClass: ChequeService,
};
