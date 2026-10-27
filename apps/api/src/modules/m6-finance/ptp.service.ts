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
import {
  NOTIFY_PORT,
  EXCEPTION_PORT,
} from '../../shared/ports/ports.interface.js';
import type { ExceptionPort } from '../../shared/ports/ports.interface.js';

/**
 * PTPService — Promise-to-Pay workflow (Scenario E)
 *
 * Flow:
 * 1. Collector on worklist: customer declines payment → must log PTP (promised_date + reason_code)
 * 2. System schedules follow-up alert on promised_date
 * 3. Aging job (00:30) checks: if promised_date < today AND status OPEN → mark BROKEN
 * 4. BROKEN PTP raises customer priority in next worklist generation
 * 5. If customer pays → collector marks KEPT
 */
@Injectable()
export class PTPService {
  private readonly logger = new Logger(PTPService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    @Inject(NOTIFY_PORT) private readonly notify: any,
    @Inject(EXCEPTION_PORT) private readonly exceptionPort: ExceptionPort,
  ) {}

  /**
   * Create a Promise-to-Pay record
   * Required when collector outcome = DECLINED on worklist
   */
  async createPTP(cmd: {
    siteId: string;
    customerId: string;
    invoiceId?: string;
    promisedDate: Date;
    reasonCode: string; // CASH_FLOW, DISPUTE, WAITING_APPROVAL, OTHER
    note?: string;
    loggedByUserId: string;
  }) {
    // Validate promised date is future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (cmd.promisedDate < today) {
      throw new BadRequestException('Promised date must be today or future');
    }

    const [ptp] = await this.knex('ptp_followups')
      .insert({
        site_id: cmd.siteId,
        customer_id: cmd.customerId,
        invoice_id: cmd.invoiceId,
        promised_date: cmd.promisedDate,
        reason_code: cmd.reasonCode,
        note: cmd.note,
        logged_by_user_id: cmd.loggedByUserId,
        status: 'OPEN',
      })
      .returning('*');

    this.logger.log(
      `PTP created: customer ${cmd.customerId}, promised ${cmd.promisedDate.toISOString().split('T')[0]}, reason ${cmd.reasonCode}`,
    );

    return ptp;
  }

  /**
   * Get PTPs for a customer (mobile view)
   */
  async getCustomerPTPs(customerId: string, siteId: string, status?: string) {
    let query = this.knex('ptp_followups')
      .where('customer_id', customerId)
      .andWhere('site_id', siteId)
      .orderBy('promised_date', 'asc');

    if (status) query = query.andWhere('status', status);

    return query.select('*');
  }

  /**
   * Get all PTPs for a site (Coordinator/Owner view)
   */
  async getPTPs(
    siteId: string,
    filters?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      customerId?: string;
    },
  ) {
    let query = this.knex('ptp_followups')
      .where('site_id', siteId)
      .join('customers', 'ptp_followups.customer_id', 'customers.id')
      .select(
        'ptp_followups.*',
        'customers.name as customerName',
        'customers.phone',
      );

    if (filters?.status)
      query = query.andWhere('ptp_followups.status', filters.status);
    if (filters?.fromDate)
      query = query.andWhere(
        'ptp_followups.promised_date',
        '>=',
        filters.fromDate,
      );
    if (filters?.toDate)
      query = query.andWhere(
        'ptp_followups.promised_date',
        '<=',
        filters.toDate,
      );
    if (filters?.customerId)
      query = query.andWhere('ptp_followups.customer_id', filters.customerId);

    return query.orderBy('ptp_followups.promised_date', 'asc');
  }

  /**
   * Get PTPs due today (for follow-up alerts)
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
   * Mark PTP as KEPT or BROKEN
   * Called by collector on follow-up or by aging job
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

    if (status === 'BROKEN') {
      this.logger.warn(`PTP BROKEN: ${ptpId} for customer ${ptp.customer_id}`);
      // Could raise exception for priority escalation
    }

    return ptp;
  }

  /**
   * Nightly aging job: Mark overdue PTPs as BROKEN
   * Called by AgingJob at 00:30
   */
  async checkAndMarkBrokenPTPs(siteId: string, date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const brokenPTPs = await this.knex('ptp_followups')
      .where('site_id', siteId)
      .andWhere('status', 'OPEN')
      .andWhere('promised_date', '<', targetDate)
      .select('*');

    for (const ptp of brokenPTPs) {
      await this.knex('ptp_followups')
        .where('id', ptp.id)
        .update({ status: 'BROKEN', updated_at: new Date() });

      this.logger.warn(
        `Aging job: PTP ${ptp.id} marked BROKEN (promised ${ptp.promised_date}, today ${targetDate})`,
      );
    }

    return brokenPTPs;
  }

  /**
   * Send PTP reminder notification (day before or day of)
   */
  async sendPTPReminders(siteId: string, daysBefore = 0) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBefore);
    const dateStr = targetDate.toISOString().split('T')[0];

    const ptps = await this.getPTPsDueToday(siteId, dateStr);

    for (const ptp of ptps) {
      try {
        await this.notify.send('WHATSAPP', 'ptp_reminder', ptp.phone, {
          customerName: ptp.customerName,
          promisedDate: ptp.promised_date,
          reasonCode: ptp.reason_code,
          daysUntil: daysBefore,
        });
      } catch {
        // Ignore notification errors
      }
    }

    return ptps.length;
  }
}
