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
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { LedgerService } from './ledger.service.js';
import { EXCEPTION_PORT } from '../../shared/ports/ports.interface.js';
import type { ExceptionPort } from '../../shared/ports/ports.interface.js';

/**
 * HandoverService — Cash custody chain verification (BR-07)
 *
 * Flow:
 * 1. Agent views wallet (custody_ledger balance)
 * 2. Coordinator initiates handover: expected = wallet balance (cash + cheques)
 * 3. Coordinator counts physical cash/cheques → counted_amount
 * 4. If counted == expected: status VERIFIED → custody_ledger HANDOVER (-expected), cashbook_entries HANDOVER_IN
 * 5. If counted != expected: status DISPUTED → variance recorded, owner notified via exception
 * 6. Non-zero wallet at EOD blocks sign-off
 */
@Injectable()
export class HandoverService {
  private readonly logger = new Logger(HandoverService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly ledger: LedgerService,
    @Inject(EXCEPTION_PORT) private readonly exceptionPort: ExceptionPort,
  ) {}

  /**
   * Get expected handover amount for a user (current wallet balance)
   * Only CASH and CHEQUE entries count toward physical handover
   */
  async getExpectedHandover(
    userId: string,
    siteId: string,
  ): Promise<{
    expectedAmount: string;
    chequeCount: number;
    upiAmount: string;
    breakdown: Array<{ type: string; amount: string }>;
  }> {
    // Get custody ledger entries that are not yet handed over
    // Include all positive entry types: COLLECTION, REVERSAL (and any future positive types)
    const entries = await this.knex('custody_ledger')
      .where('user_id', userId)
      .andWhere('site_id', siteId)
      .whereIn('entry_type', ['COLLECTION', 'REVERSAL'])
      .select('*');

    // Also get handovers already done to net out
    const handovers = await this.knex('custody_ledger')
      .where('user_id', userId)
      .andWhere('site_id', siteId)
      .andWhere('entry_type', 'HANDOVER')
      .select('*');

    let expected = Money.zero();
    let chequeCount = 0;
    let upiAmount = Money.zero();

    // Sum collections by payment mode (from receipts)
    const receiptIds = entries.map((e) => e.receipt_id).filter(Boolean);
    if (receiptIds.length > 0) {
      const receipts = await this.knex('collection_receipts')
        .whereIn('id', receiptIds)
        .select('id', 'payment_mode', 'amount');

      const receiptMap = new Map(receipts.map((r) => [r.id, r]));

      for (const entry of entries) {
        const receipt = receiptMap.get(entry.receipt_id);
        if (!receipt) continue;

        const amt = Money.of(entry.amount_delta);
        expected = expected.add(amt);

        if (receipt.payment_mode === 'CHEQUE') chequeCount++;
        else if (receipt.payment_mode === 'UPI') upiAmount = upiAmount.add(amt);
      }
    }

    // Subtract already handed over (HANDOVER entries have negative amount_delta)
    const handedOver = handovers.reduce(
      (sum, h) => sum.add(Money.of(h.amount_delta).mul(-1)),
      Money.zero(),
    );
    expected = expected.sub(handedOver);

    return {
      expectedAmount: expected.toStorageString(),
      chequeCount,
      upiAmount: upiAmount.toStorageString(),
      breakdown: [
        { type: 'CASH_CHEQUE', amount: expected.toStorageString() },
        { type: 'CHEQUES', amount: chequeCount.toString() },
        { type: 'UPI', amount: upiAmount.toStorageString() },
      ],
    };
  }

  /**
   * Initiate cash handover (Coordinator starts the process)
   * Records expected amount, creates pending handover record
   */
  async initiateHandover(cmd: {
    siteId: string;
    handedByUserId: string;
    receivedByUserId?: string; // Optional until verified
    notes?: string;
  }) {
    const expected = await this.getExpectedHandover(
      cmd.handedByUserId,
      cmd.siteId,
    );

    const [handover] = await this.knex('cash_handovers')
      .insert({
        site_id: cmd.siteId,
        handed_by_user_id: cmd.handedByUserId,
        received_by_user_id: cmd.receivedByUserId,
        expected_amount: expected.expectedAmount,
        cheque_count: expected.chequeCount,
        upi_amount: expected.upiAmount,
        status: 'PENDING',
        notes: cmd.notes,
      })
      .returning('*');

    this.logger.log(
      `Handover initiated: ${String(handover.id)} for user ${cmd.handedByUserId}, expected ${expected.expectedAmount}`,
    );

    return {
      handoverId: String(handover.id),
      expectedAmount: expected.expectedAmount,
      chequeCount: expected.chequeCount,
      upiAmount: expected.upiAmount,
      status: 'PENDING',
    };
  }

  /**
   * Verify Cash Handover — Coordinator counts and verifies
   * This is the critical BR-07 step that clears the agent's wallet
   */
  async verifyHandover(cmd: {
    handoverId: string;
    receivedByUserId: string; // Cashier/Coordinator verifying
    countedAmount: string;
    chequeCount?: number;
    notes?: string;
  }): Promise<{
    handoverId: string;
    status: 'VERIFIED' | 'DISPUTED';
    variance: string;
  }> {
    return this.knex.transaction(async (trx) => {
      const handover = await trx('cash_handovers')
        .where('id', cmd.handoverId)
        .first();
      if (!handover)
        throw new NotFoundException(`Handover ${cmd.handoverId} not found`);
      if (handover.status !== 'PENDING')
        throw new BadRequestException(`Handover already ${handover.status}`);

      const expected = Money.of(handover.expected_amount);
      const counted = Money.of(cmd.countedAmount);
      const variance = counted.sub(expected);
      const isMatch = variance.isZero();

      const status = isMatch ? 'VERIFIED' : 'DISPUTED';

      // Update handover record
      await trx('cash_handovers')
        .where('id', cmd.handoverId)
        .update({
          received_by_user_id: cmd.receivedByUserId,
          counted_amount: counted.toStorageString(),
          variance: variance.toStorageString(),
          cheque_count: cmd.chequeCount ?? handover.cheque_count,
          status,
          notes: cmd.notes,
          verified_at: new Date(),
          updated_at: new Date(),
        });

      if (isMatch) {
        // 1. Post custody_ledger HANDOVER (-expected) — clears agent wallet
        const prevCustody = await this.ledger.getCustodyBalance(
          handover.handed_by_user_id,
          trx,
        );
        const newCustody = prevCustody.sub(expected);

        await trx('custody_ledger').insert({
          user_id: handover.handed_by_user_id,
          site_id: handover.site_id,
          entry_type: 'HANDOVER',
          amount_delta: expected.mul(-1).toStorageString(),
          handover_id: cmd.handoverId,
          running_balance: newCustody.toStorageString(),
        });

        // 2. Post cashbook_entries HANDOVER_IN (+expected) — site cashbook increases
        await trx('cashbook_entries').insert({
          site_id: handover.site_id,
          entry_type: 'HANDOVER_IN',
          amount: expected.toStorageString(),
          ref_id: cmd.handoverId,
          date: new Date(),
        });

        // 3. Update user cached balance
        await trx('users').where('id', handover.handed_by_user_id).update({
          cash_custody_balance: newCustody.toStorageString(),
        });

        this.logger.log(
          `Handover VERIFIED: ${cmd.handoverId}, amount ${expected.toStorageString()}, wallet cleared`,
        );
      } else {
        // DISPUTED: owner notified via exception
        await this.exceptionPort.raise(
          'CASH_HANDOVER_VARIANCE',
          'cash_handovers',
          cmd.handoverId,
          cmd.receivedByUserId,
          {
            title: 'Cash Handover Variance',
            summary: `Counted amount differs from expected. Expected: ${expected.toStorageString()}, Counted: ${counted.toStorageString()}`,
            facts: [
              { label: 'Agent', value: handover.handed_by_user_id },
              { label: 'Expected', value: expected.toStorageString() },
              { label: 'Counted', value: counted.toStorageString() },
              { label: 'Variance', value: variance.toStorageString() },
            ],
            impact: 'Custody wallet not cleared; EOD blocked until resolved.',
            actions: [
              { code: 'ACCEPT_COUNTED', label: 'Accept Counted Amount' },
              { code: 'ADJUST_TO_EXPECTED', label: 'Adjust to Expected' },
              { code: 'PARTIAL', label: 'Partial Resolution' },
            ],
            valueAtRisk: variance.isNegative()
              ? variance.mul(-1).toStorageString()
              : variance.toStorageString(),
          },
          handover.site_id,
        );

        this.logger.warn(
          `Handover DISPUTED: ${cmd.handoverId}, expected ${expected.toStorageString()}, counted ${counted.toStorageString()}, variance ${variance.toStorageString()}`,
        );
      }

      return {
        handoverId: cmd.handoverId,
        status,
        variance: variance.toStorageString(),
      };
    });
  }

  /**
   * Get handover details
   */
  async getHandover(handoverId: string) {
    const handover = await this.knex('cash_handovers')
      .where('id', handoverId)
      .first('*');
    if (!handover)
      throw new NotFoundException(`Handover ${handoverId} not found`);

    return handover;
  }

  /**
   * List pending handovers for a site (Coordinator dashboard)
   */
  async getPendingHandovers(siteId: string) {
    return this.knex('cash_handovers')
      .where('site_id', siteId)
      .andWhere('status', 'PENDING')
      .join('users as h', 'cash_handovers.handed_by_user_id', 'h.id')
      .select('cash_handovers.*', 'h.name as handedByName')
      .orderBy('created_at', 'asc');
  }

  /**
   * Get agent's wallet balance (for mobile My Wallet screen)
   */
  async getAgentWallet(userId: string, siteId: string) {
    const balance = await this.ledger.getCustodyBalance(userId);
    const entries = await this.ledger.getCustodyLedger(userId, siteId, 20);

    const expected = await this.getExpectedHandover(userId, siteId);

    return {
      currentBalance: balance.toStorageString(),
      expectedHandover: expected.expectedAmount,
      canHandover: !balance.isZero(),
      recentEntries: entries,
    };
  }

  /**
   * Dispute resolution (owner resolves variance)
   * Posts REVERSAL entries to correct the ledger
   */
  async resolveDispute(cmd: {
    handoverId: string;
    resolvedByUserId: string; // Owner
    resolution: 'ACCEPT_COUNTED' | 'ADJUST_TO_EXPECTED' | 'PARTIAL';
    adjustedAmount?: string; // If PARTIAL
  }) {
    return this.knex.transaction(async (trx) => {
      const handover = await trx('cash_handovers')
        .where('id', cmd.handoverId)
        .first();
      if (!handover)
        throw new NotFoundException(`Handover ${cmd.handoverId} not found`);
      if (handover.status !== 'DISPUTED')
        throw new BadRequestException('Handover not in DISPUTED status');

      let finalAmount: Money;

      switch (cmd.resolution) {
        case 'ACCEPT_COUNTED':
          finalAmount = Money.of(handover.counted_amount);
          break;
        case 'ADJUST_TO_EXPECTED':
          finalAmount = Money.of(handover.expected_amount);
          break;
        case 'PARTIAL':
          if (!cmd.adjustedAmount)
            throw new BadRequestException(
              'adjustedAmount required for PARTIAL resolution',
            );
          finalAmount = Money.of(cmd.adjustedAmount);
          break;
        default:
          throw new BadRequestException('Invalid resolution');
      }

      // Post correction entries
      const expected = Money.of(handover.expected_amount);
      const diff = finalAmount.sub(expected);

      if (handover.status === 'DISPUTED') {
        // For disputed handovers, no HANDOVER entry was posted yet.
        // The agent's wallet shows the full expected amount from collections,
        // but they physically only possess the counted amount.
        // Clear the entire wallet balance to zero; cashbook receives finalAmount.
        const prevCustody = await this.ledger.getCustodyBalance(
          handover.handed_by_user_id,
          trx,
        );
        this.logger.log(
          `resolveDispute: prevCustody=${prevCustody.toStorageString()}, finalAmount=${finalAmount.toStorageString()}`,
        );
        const newCustody = Money.zero();

        // Get the latest posted_at to ensure our entry sorts after existing ones
        const latestEntry = await trx('custody_ledger')
          .where('user_id', handover.handed_by_user_id)
          .orderBy('posted_at', 'desc')
          .first('posted_at');
        const postedAt = latestEntry
          ? new Date(latestEntry.posted_at.getTime() + 1)
          : new Date();

        const [inserted] = await trx('custody_ledger')
          .insert({
            user_id: handover.handed_by_user_id,
            site_id: handover.site_id,
            entry_type: 'HANDOVER',
            amount_delta: prevCustody.mul(-1).toStorageString(),
            handover_id: cmd.handoverId,
            running_balance: newCustody.toStorageString(),
            posted_at: postedAt,
          })
          .returning('*');
        this.logger.log(
          `resolveDispute: HANDOVER entry inserted id=${inserted.id}, posted_at=${inserted.posted_at}, running_balance=${inserted.running_balance}`,
        );

        // Verify the balance was updated
        const verifyBalance = await this.ledger.getCustodyBalance(
          handover.handed_by_user_id,
          trx,
        );
        this.logger.log(
          `resolveDispute: verified balance after insert = ${verifyBalance.toStorageString()}`,
        );

        // Post cashbook_entries HANDOVER_IN (+finalAmount) — site cashbook increases by what was counted
        await trx('cashbook_entries').insert({
          site_id: handover.site_id,
          entry_type: 'HANDOVER_IN',
          amount: finalAmount.toStorageString(),
          ref_id: cmd.handoverId,
          date: new Date(),
        });

        await trx('users').where('id', handover.handed_by_user_id).update({
          cash_custody_balance: newCustody.toStorageString(),
        });
      } else if (!diff.isZero()) {
        // For VERIFIED handovers being adjusted (unlikely path)
        // Post custody REVERSAL for the difference
        const prevCustody = await this.ledger.getCustodyBalance(
          handover.handed_by_user_id,
          trx,
        );
        const newCustody = prevCustody.add(diff); // diff can be + or -

        await trx('cashbook_entries').insert({
          site_id: handover.site_id,
          entry_type: 'HANDOVER_IN',
          amount: finalAmount.toStorageString(),
          ref_id: cmd.handoverId,
          date: new Date(),
        });

        await trx('custody_ledger').insert({
          user_id: handover.handed_by_user_id,
          site_id: handover.site_id,
          entry_type: 'REVERSAL',
          amount_delta: diff.toStorageString(),
          handover_id: cmd.handoverId,
          running_balance: newCustody.toStorageString(),
          posted_at: new Date(),
        });

        await trx('users').where('id', handover.handed_by_user_id).update({
          cash_custody_balance: newCustody.toStorageString(),
        });
      }

      // Update handover to VERIFIED
      await trx('cash_handovers')
        .where('id', cmd.handoverId)
        .update({
          status: 'VERIFIED',
          variance: finalAmount.sub(expected).toStorageString(),
          updated_at: new Date(),
          updated_by: cmd.resolvedByUserId,
        });

      this.logger.log(
        `Dispute resolved: ${cmd.handoverId} by ${cmd.resolvedByUserId}, final amount ${finalAmount.toStorageString()}`,
      );

      return { success: true, finalAmount: finalAmount.toStorageString() };
    });
  }
}
