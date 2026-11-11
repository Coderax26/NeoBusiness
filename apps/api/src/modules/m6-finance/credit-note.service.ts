import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Worker } from 'bullmq';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { Money } from '../../shared/utils/money.util.js';
import { ConfigService } from '../m0-platform/config.service.js';
import {
  LEDGER_PORT,
  EXCEPTION_PORT,
  NOTIFY_PORT,
} from '../../shared/ports/ports.interface.js';
import type {
  LedgerPort,
  ExceptionPort,
  NotifyPort,
} from '../../shared/ports/ports.interface.js';

interface DomainJob {
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
}

export interface CreditNoteData {
  customerId: string;
  siteId: string;
  orderId: string;
  reasonType:
    'RETURNED' | 'SOLD_QUIETLY' | 'ABNORMAL_DAMAGE' | 'EXPIRY' | 'OTHER';
  lines: Array<{
    itemId: string;
    qty: string;
    unitPrice: string;
    lineItemId?: string;
    reason?: string;
  }>;
  totalDebit: string;
  requestedBy: string;
}

@Injectable()
export class CreditNoteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CreditNoteService.name);
  private worker: Worker | undefined;

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly config: ConfigService,
    @Inject(LEDGER_PORT) private readonly ledger: LedgerPort,
    @Optional()
    @Inject(EXCEPTION_PORT)
    private readonly exceptionPort?: ExceptionPort,
    @Optional()
    @Inject(NOTIFY_PORT)
    private readonly notify?: NotifyPort,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      'domain-events',
      async (job) => this.handle(job.data as DomainJob),
      { connection: { host: 'localhost', port: 6379 } },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `M6 CreditNoteService ${job?.name ?? 'unknown'} failed: ${error.message}`,
      );
    });
    this.logger.log(
      'CreditNoteService started (listening on domain-events queue)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  async handle(event: DomainJob): Promise<void> {
    const payload = event.payload;
    switch (event.event_type) {
      case 'stops.returned': {
        await this.handleStopsReturned(payload);
        return;
      }
      default:
        this.logger.debug(
          `M6 CreditNoteService ignored event ${event.event_type}`,
        );
    }
  }

  private async handleStopsReturned(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const stopId = this.getStringValue(payload.stopId);
    const orderId = this.getStringValue(payload.orderId);
    const customerId = this.getStringValue(payload.customerId);
    const totalValue = this.getStringValue(payload.totalValue);
    const returnedLines = this.getArrayValue(payload.returnedLines);

    if (!orderId || returnedLines.length === 0) {
      this.logger.warn(
        `Stops returned event ${stopId} has no order or lines - skipping credit note`,
      );
      return;
    }

    try {
      // Get siteId from the order
      const order = await this.knex('sales_orders')
        .where('id', orderId)
        .first('site_id');

      if (!order) {
        this.logger.error(
          `Order ${orderId} not found for credit note creation`,
        );
        return;
      }

      const siteId = String(order.site_id);

      // Create credit note for returned items
      const creditNote = await this.createCreditNote({
        customerId,
        siteId,
        orderId,
        reasonType: 'RETURNED',
        lines: returnedLines.map((line) => ({
          itemId: this.getStringValue(line.itemId),
          qty: this.getStringValue(line.returnedQty),
          unitPrice: '0', // Will be fetched from order lines
          lineItemId: undefined,
          reason: this.getStringValue(line.reason ?? ''),
        })),
        totalDebit: totalValue,
        requestedBy: 'SYSTEM', // Auto-generated from delivery return
      });

      this.logger.log(
        `Credit note ${creditNote.creditNoteNo} created for returned items from stop ${stopId} (${totalValue})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to create credit note for stop ${stopId}: ${(err as Error).message}`,
      );
    }
  }

  async createCreditNote(data: CreditNoteData): Promise<{
    creditNoteId: string;
    creditNoteNo: string;
    totalDebit: string;
    status: string;
  }> {
    return this.knex.transaction(async (trx) => {
      // Generate credit note number
      const creditNoteNo = await this.docNumber.next(
        'CREDIT_NOTE',
        data.siteId,
        null,
        trx,
      );

      // Fetch unit prices from order lines
      const orderLines = await trx('sales_order_lines')
        .where('order_id', data.orderId)
        .select('id', 'item_id', 'quoted_unit_price');

      const priceMap = new Map<string, string>();
      for (const line of orderLines) {
        priceMap.set(String(line.item_id), String(line.quoted_unit_price));
      }

      // Calculate line totals and validate
      let calculatedTotal = Money.zero();
      const creditNoteLines = [];

      for (const line of data.lines) {
        const unitPrice =
          line.unitPrice !== '0'
            ? line.unitPrice
            : (priceMap.get(line.itemId) ?? '0');

        const lineTotal = Money.of(unitPrice).mul(line.qty);
        calculatedTotal = calculatedTotal.add(lineTotal);

        creditNoteLines.push({
          item_id: line.itemId,
          qty: line.qty,
          unit_price: unitPrice,
          line_total: lineTotal.toStorageString(),
          line_item_id: line.lineItemId ?? null,
        });
      }

      // Verify total matches (allow small rounding differences)
      const providedTotal = Money.of(data.totalDebit);
      if (
        Math.abs(calculatedTotal.toNumber() - providedTotal.toNumber()) > 0.01
      ) {
        this.logger.warn(
          `Credit note total mismatch: calculated ${calculatedTotal.toStorageString()} vs provided ${data.totalDebit}`,
        );
      }

      // Insert credit note
      const [creditNote] = await trx('credit_notes')
        .insert({
          credit_note_no: creditNoteNo,
          site_id: data.siteId,
          customer_id: data.customerId,
          order_id: data.orderId,
          status: 'DRAFT',
          reason_type: data.reasonType,
          total_debit: providedTotal.toStorageString(),
          status_reason: `Auto-created from delivery return for order ${data.orderId}`,
          created_by: data.requestedBy,
          updated_by: data.requestedBy,
        })
        .returning('*');

      const creditNoteId = String(creditNote.id);

      // Insert credit note lines
      for (const line of creditNoteLines) {
        await trx('credit_note_lines').insert({
          credit_note_id: creditNoteId,
          order_id: data.orderId,
          item_id: line.item_id,
          line_item_id: line.line_item_id,
          debited_qty: line.qty,
          unit_price: line.unit_price,
          total_debit: line.line_total,
        });
      }

      // Post credit note to ledger (creates ADJUSTMENT entry with credit)
      await this.ledger.postCreditNote(creditNoteId);

      return {
        creditNoteId,
        creditNoteNo,
        totalDebit: providedTotal.toStorageString(),
        status: 'DRAFT',
      };
    });
  }

  async getCreditNote(creditNoteId: string) {
    const creditNote = await this.knex('credit_notes')
      .where('id', creditNoteId)
      .first('*');
    if (!creditNote) return null;

    const lines = await this.knex('credit_note_lines')
      .where('credit_note_id', creditNoteId)
      .select('*');

    return { ...creditNote, lines };
  }

  async listCreditNotes(customerId?: string, siteId?: string, status?: string) {
    let query = this.knex('credit_notes').orderBy('created_at', 'desc');

    if (customerId) query = query.where('customer_id', customerId);
    if (siteId) query = query.where('site_id', siteId);
    if (status) query = query.where('status', status);

    return query.select('*');
  }

  async approveCreditNote(
    creditNoteId: string,
    approvedBy: string,
    remarks?: string,
  ) {
    return this.knex.transaction(async (trx) => {
      const creditNote = await trx('credit_notes')
        .where('id', creditNoteId)
        .first('*');

      if (!creditNote) throw new Error(`Credit note ${creditNoteId} not found`);
      if (creditNote.status !== 'DRAFT') {
        throw new Error(`Credit note ${creditNoteId} is not in DRAFT status`);
      }

      await trx('credit_notes')
        .where('id', creditNoteId)
        .update({
          status: 'ISSUED',
          approved_by: approvedBy,
          approved_at: new Date(),
          status_reason: remarks ?? creditNote.status_reason,
          updated_by: approvedBy,
          updated_at: new Date(),
        });

      // Update customer AR balance (credit reduces AR)
      const customer = await trx('customers')
        .where('id', creditNote.customer_id)
        .first('current_ar_balance');

      if (customer) {
        const newBalance = Money.of(customer.current_ar_balance).sub(
          Money.of(creditNote.total_debit),
        );
        await trx('customers')
          .where('id', creditNote.customer_id)
          .update({ current_ar_balance: newBalance.toStorageString() });
      }

      this.logger.log(
        `Credit note ${creditNote.credit_note_no} APPROVED by ${approvedBy}`,
      );
      return { success: true };
    });
  }

  async rejectCreditNote(
    creditNoteId: string,
    rejectedBy: string,
    reason: string,
  ) {
    await this.knex('credit_notes').where('id', creditNoteId).update({
      status: 'REJECTED',
      rejected_by: rejectedBy,
      rejected_at: new Date(),
      rejected_reason: reason,
      updated_by: rejectedBy,
      updated_at: new Date(),
    });
    this.logger.log(
      `Credit note ${creditNoteId} REJECTED by ${rejectedBy}: ${reason}`,
    );
    return { success: true };
  }

  async cancelCreditNote(
    creditNoteId: string,
    cancelledBy: string,
    reason: string,
  ) {
    return this.knex.transaction(async (trx) => {
      const creditNote = await trx('credit_notes')
        .where('id', creditNoteId)
        .first('*');

      if (!creditNote) throw new Error(`Credit note ${creditNoteId} not found`);
      if (creditNote.status === 'CANCELLED') {
        throw new Error(`Credit note ${creditNoteId} already cancelled`);
      }

      // Reverse any ledger impact if already applied
      if (creditNote.status === 'APPLIED' || creditNote.status === 'ISSUED') {
        await this.ledger.postCreditNote(creditNoteId); // This should handle reversal
      }

      await trx('credit_notes').where('id', creditNoteId).update({
        status: 'CANCELLED',
        status_reason: reason,
        updated_by: cancelledBy,
        updated_at: new Date(),
      });

      this.logger.log(
        `Credit note ${creditNoteId} CANCELLED by ${cancelledBy}`,
      );
      return { success: true };
    });
  }

  private getStringValue(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Domain event contains a missing string field');
    }
    return value;
  }

  private getArrayValue(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null,
        )
      : [];
  }
}
