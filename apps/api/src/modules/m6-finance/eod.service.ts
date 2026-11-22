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
import { LedgerService } from './ledger.service.js';
import { Clock } from '../../shared/utils/clock.util.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import {
  NOTIFY_PORT,
  EXCEPTION_PORT,
} from '../../shared/ports/ports.interface.js';
import type { ExceptionPort } from '../../shared/ports/ports.interface.js';
import { PdfGeneratorService } from '../../shared/services/pdf-generator.service.js';

/**
 * EodService — End of Day closing checklist (10-minute target)
 *
 * 4 Checks:
 * 1. All trips closed? (M5 delivery_trips)
 * 2. All field cash handed over? (custody_ledger wallet balances = 0)
 * 3. Any uninvoiced deliveries? (Dispatched orders without invoices)
 * 4. Daily net cash position & bank deposit slip
 *
 * KPI 2: initiated_at → signed_off_at (target < 10 min)
 */
@Injectable()
export class EodService {
  private readonly logger = new Logger(EodService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
    @Inject(NOTIFY_PORT) private readonly notify: any,
    @Inject(EXCEPTION_PORT) private readonly exceptionPort: ExceptionPort,
    @Optional() private readonly pdfGenerator?: PdfGeneratorService,
  ) {}

  /**
   * Initiate EOD closing for a site
   * Runs all 4 checks, returns checklist status
   */
  async initiateClosing(siteId: string, userId: string, date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    // Check if already initiated
    const existing = await this.knex('eod_closings')
      .where('site_id', siteId)
      .andWhere('date', targetDate)
      .first('*');

    if (existing) {
      return this.getChecklist(existing.id);
    }

    // Run all 4 checks
    const checks = await this.runChecks(siteId, targetDate);

    const allGreen = Object.values(checks).every((c) => c.passed);

    const [eod] = await this.knex('eod_closings')
      .insert({
        site_id: siteId,
        date: targetDate,
        initiated_at: new Date(),
        all_trips_closed: checks.trips.passed,
        all_cash_handed_over: checks.handover.passed,
        uninvoiced_deliveries: checks.uninvoiced.count,
        net_cash_position: checks.cashPosition.netPosition.toStorageString(),
        status: allGreen ? 'READY' : 'OPEN',
        signed_off_by_user_id: userId,
      })
      .returning('*');

    this.logger.log(
      `EOD initiated for site ${siteId}, date ${targetDate}: ${allGreen ? 'READY' : 'OPEN'}`,
    );

    return {
      ...eod,
      checks,
      canSignOff:
        checks.trips.passed &&
        checks.handover.passed &&
        checks.uninvoiced.passed,
    };
  }

  /**
   * Run the 4 EOD checks
   */
  private async runChecks(
    siteId: string,
    date: string,
  ): Promise<{
    trips: { passed: boolean; count: number; detail: string };
    handover: { passed: boolean; nonZeroWallets: number; detail: string };
    uninvoiced: { passed: boolean; count: number; detail: string };
    cashPosition: { passed: boolean; netPosition: Money; detail: string };
  }> {
    // Check 1: All trips closed?
    const openTrips = await this.knex('delivery_trips')
      .where('site_id', siteId)
      .where('trip_date', date)
      .whereNotIn('status', ['COMPLETED', 'CANCELLED'])
      .count('* as cnt')
      .first();

    const tripsPassed = Number(openTrips?.cnt ?? 0) === 0;
    const trips = {
      passed: tripsPassed,
      count: Number(openTrips?.cnt ?? 0),
      detail: tripsPassed
        ? 'All trips closed'
        : `${openTrips?.cnt} trips not closed`,
    };

    // Check 2: All field cash handed over? (custody_ledger running_balance = 0 for all agents)
    // Sum ALL entry types to get actual wallet balance (COLLECTION positive, HANDOVER/REVERSAL negative)
    const nonZeroWallets = await this.knex('custody_ledger as cl')
      .join('users as u', 'cl.user_id', 'u.id')
      .where('cl.site_id', siteId)
      .where('u.role', 'COLLECTOR')
      .groupBy('cl.user_id', 'u.full_name')
      .havingRaw('SUM(cl.amount_delta) != 0')
      .select(
        'cl.user_id',
        'u.full_name as name',
        this.knex.raw('SUM(cl.amount_delta) as balance'),
      );

    const handoverPassed = nonZeroWallets.length === 0;
    const handover = {
      passed: handoverPassed,
      nonZeroWallets: nonZeroWallets.length,
      detail: handoverPassed
        ? 'All wallets zero'
        : `${nonZeroWallets.length} agents with non-zero wallet`,
    };

    // Check 3: Uninvoiced deliveries? (Dispatched sales_orders without invoices)
    const uninvoiced = await this.knex('sales_orders')
      .where('fulfillment_site_id', siteId)
      .where('order_status', 'DISPATCHED')
      .whereNotExists(
        this.knex('invoices').whereRaw(
          'invoices.sales_order_id = sales_orders.id',
        ),
      )
      .count('* as cnt')
      .first();

    const uninvoicedCount = Number(uninvoiced?.cnt ?? 0);
    const uninvoicedCheck = {
      passed: uninvoicedCount === 0,
      count: uninvoicedCount,
      detail:
        uninvoicedCount === 0
          ? 'All dispatched orders invoiced'
          : `${uninvoicedCount} dispatched orders without invoice`,
    };

    // Check 4: Net cash position & deposit slip
    // Cash in = HANDOVER_IN + RECEIPT_CASH (from cashbook)
    // Cash out = EXPENSE + SUPPLIER_PAYMENT + BANK_DEPOSIT
    const cashIn = await this.knex('cashbook_entries')
      .where('site_id', siteId)
      .where('date', date)
      .whereIn('entry_type', ['HANDOVER_IN', 'RECEIPT_CASH'])
      .sum('amount as total')
      .first();

    const cashOut = await this.knex('cashbook_entries')
      .where('site_id', siteId)
      .where('date', date)
      .whereIn('entry_type', ['EXPENSE', 'SUPPLIER_PAYMENT', 'BANK_DEPOSIT'])
      .sum('amount as total')
      .first();

    const netPosition = Money.of(cashIn?.total ?? '0').sub(
      Money.of(cashOut?.total ?? '0'),
    );

    const cashPosition = {
      passed: true, // Just informational
      netPosition,
      detail: `Cash In: ${Money.of(cashIn?.total ?? '0').toStorageString()}, Cash Out: ${Money.of(cashOut?.total ?? '0').toStorageString()}, Net: ${netPosition.toStorageString()}`,
    };

    return { trips, handover, uninvoiced: uninvoicedCheck, cashPosition };
  }

  /**
   * Get EOD checklist status
   */
  async getChecklist(eodId: string) {
    const eod = await this.knex('eod_closings').where('id', eodId).first('*');
    if (!eod) throw new NotFoundException(`EOD ${eodId} not found`);

    // Date in DB is a PostgreSQL DATE column. Read it as the local (IST) business
    // date — never derive it from a UTC timestamp, or the day shifts at the
    // UTC→IST boundary (e.g. IST midnight Oct 31 → UTC Oct 30).
    const dateStr = Clock.toKolkata(eod.date).toISODate();

    this.logger.debug(
      `[EOD Debug] getChecklist for eodId=${eodId}, site=${eod.site_id}, date=${dateStr}`,
    );

    if (!eod.site_id || !dateStr) {
      throw new Error('EOD closing is missing site or business date');
    }
    const checks = await this.runChecks(eod.site_id, dateStr);

    return {
      ...eod,
      checks,
      canSignOff:
        checks.trips.passed &&
        checks.handover.passed &&
        checks.uninvoiced.passed,
    };
  }

  /**
   * Get EOD by site and date
   */
  async getEODBySiteDate(siteId: string, date: string) {
    const eod = await this.knex('eod_closings')
      .where('site_id', siteId)
      .andWhere('date', date)
      .first('*');

    if (!eod) return null;

    return this.getChecklist(String(eod.id));
  }

  /**
   * Owner sign-off — finalizes the day
   * Requires all 4 checks green
   * Triggers accounting export
   */
  async signOff(eodId: string, ownerId: string) {
    return this.knex.transaction(async (trx) => {
      const eod = await trx('eod_closings').where('id', eodId).first('*');
      if (!eod) throw new NotFoundException(`EOD ${eodId} not found`);

      if (eod.status === 'SIGNED_OFF')
        throw new BadRequestException('Already signed off');

      // Re-run checks to ensure still valid
      // Date in DB is a PostgreSQL DATE column. Read it as the local (IST) business
      // date — never derive it from a UTC timestamp, or the day shifts at the
      // UTC→IST boundary (e.g. IST midnight Oct 31 → UTC Oct 30).
      const correctDateStr = Clock.toKolkata(eod.date).toISODate();

      this.logger.log(
        `[EOD Debug signOff] eodId=${eodId}, site=${eod.site_id}, rawDate=${eod.date}, correctDate=${correctDateStr}`,
      );

      if (!eod.site_id || !correctDateStr) {
        throw new Error('EOD closing is missing site or business date');
      }
      const checks = await this.runChecks(eod.site_id, correctDateStr);
      this.logger.log(`[EOD Debug signOff] checks: ${JSON.stringify(checks)}`);
      if (!checks.trips.passed)
        throw new BadRequestException('Cannot sign off: trips not closed');
      if (!checks.handover.passed)
        throw new BadRequestException('Cannot sign off: cash not handed over');
      if (!checks.uninvoiced.passed)
        throw new BadRequestException(
          'Cannot sign off: uninvoiced deliveries exist',
        );

      // Generate deposit slip (PDF attachment) - placeholder
      // const depositSlipId = await this.generateDepositSlip(eod.site_id, eod.date, trx);

      await trx('eod_closings').where('id', eodId).update({
        status: 'SIGNED_OFF',
        signed_off_by_user_id: ownerId,
        signed_off_at: new Date(),
        // deposit_slip_id: depositSlipId,
      });

      this.logger.log(
        `EOD SIGNED OFF: ${eodId} by ${ownerId}, duration ${new Date().getTime() - new Date(eod.initiated_at).getTime()}ms`,
      );

      // Emit eod.closed domain event transactionally (via Outbox)
      await this.outbox.raise(
        trx,
        'eod.closed',
        eodId,
        {
          eodId: eodId,
          siteId: String(eod.site_id),
          date: correctDateStr,
          signedOffBy: ownerId,
          signedOffAt: new Date().toISOString(),
        },
        'm6',
      );

      return { success: true, signedOffAt: new Date() };
    });
  }

  /**
   * Generate bank deposit slip (PDF)
   * Shows cash + cheque breakdown for bank deposit
   */
  async generateDepositSlip(siteId: string, date: string) {
    // Get handover data for the day
    const handovers = await this.knex('cash_handovers')
      .where('site_id', siteId)
      .where('verified_at', '>=', `${date} 00:00:00`)
      .where('verified_at', '<', `${date} 23:59:59`)
      .where('status', 'VERIFIED')
      .select('*');

    let totalCash = Money.zero();
    let totalCheques = Money.zero();
    let chequeCount = 0;

    for (const h of handovers) {
      totalCash = totalCash.add(
        Money.of(h.counted_amount).sub(Money.of(h.upi_amount ?? '0')),
      );
      totalCheques = totalCheques.add(Money.of(h.upi_amount ?? '0')); // Actually cheques tracked separately
      chequeCount += Number(h.cheque_count ?? 0);
    }

    // Get cheque register for the day
    const cheques = await this.knex('cheque_register as cr')
      .join('collection_receipts as r', 'cr.receipt_id', 'r.id')
      .where('r.site_id', siteId)
      .where('cr.deposited_on', date)
      .select('cr.*');

    return {
      siteId,
      date,
      totalCash: totalCash.toStorageString(),
      totalCheques: totalCheques.toStorageString(),
      chequeCount,
      cheques: cheques.map((c) => ({
        chequeNo: c.cheque_no,
        bank: c.bank,
        amount: c.amount,
      })),
    };
  }

  /**
   * Generate Bank Deposit Slip PDF buffer
   */
  async generateDepositSlipPdf(siteId: string, date: string): Promise<Buffer> {
    const slip = await this.generateDepositSlip(siteId, date);
    const site = await this.knex('sites').where('id', siteId).first('*');

    const totalCash = Money.of(slip.totalCash);
    const totalCheques = Money.of(slip.totalCheques);
    const totalDeposit = totalCash.add(totalCheques);

    const pdfGen = this.pdfGenerator ?? new PdfGeneratorService();
    return pdfGen.generateDepositSlip({
      date,
      siteName: site?.name || 'NeoBus Depot',
      siteAddress: site?.address,
      cashAmount: slip.totalCash,
      chequeTotal: slip.totalCheques,
      totalDeposit: totalDeposit.toStorageString(),
      handoversCount: slip.chequeCount,
      cheques: slip.cheques.map((c) => ({
        chequeNo: c.chequeNo,
        bank: c.bank,
        chequeDate: date,
        amount: String(c.amount),
      })),
    });
  }

  /**
   * Get EOD history for site
   */
  async getEODHistory(siteId: string, limit = 30) {
    return this.knex('eod_closings')
      .where('site_id', siteId)
      .orderBy('date', 'desc')
      .limit(limit)
      .select('*');
  }
}
