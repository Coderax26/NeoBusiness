import { Module, Global, Inject, Logger } from '@nestjs/common';
import { KnexModule } from 'nestjs-knex';
import { InvoiceService } from './invoice.service.js';
import { CollectionService } from './collection.service.js';
import { LedgerService } from './ledger.service.js';
import { HandoverService } from './handover.service.js';
import { PTPService } from './ptp.service.js';
import { EodService } from './eod.service.js';
import { WorklistService } from './worklist.service.js';
import { CreditNoteService } from './credit-note.service.js';
import {
  CreditPortService,
  CreditPortProvider,
} from './credit-port.service.js';
import {
  CodSettlementService,
  CodSettlementProvider,
} from './cod-settlement.service.js';
import {
  TallyExportService,
  TallyExportProvider,
} from './tally-export.service.js';
import { ChequeService, ChequeProvider } from './cheque.service.js';
import { OpeningBalanceService } from './opening-balance.service.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import {
  LEDGER_PORT,
  CREDIT_PORT,
  EXCEPTION_PORT,
} from '../../shared/ports/ports.interface.js';
import type { ExceptionPort } from '../../shared/ports/ports.interface.js';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

import { InvoiceController } from './invoice.controller.js';
import { CollectionController } from './collection.controller.js';
import { CustomerLedgerController } from './customer-ledger.controller.js';
import { HandoverController } from './handover.controller.js';
import { ChequeController } from './cheque.controller.js';
import { PtpController } from './ptp.controller.js';
import { EodController } from './eod.controller.js';
import { CreditNoteController } from './credit-note.controller.js';
import { CodSettlementController } from './cod-settlement.controller.js';
import { TallyExportController } from './tally-export.controller.js';
import { OpeningBalanceController } from './opening-balance.controller.js';
import { ExpenseService } from './expense.service.js';
import { ExpenseController } from './expense.controller.js';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';

@Global()
@Module({
  imports: [KnexModule],
  controllers: [
    InvoiceController,
    CollectionController,
    CustomerLedgerController,
    HandoverController,
    ChequeController,
    PtpController,
    EodController,
    CreditNoteController,
    CodSettlementController,
    TallyExportController,
    OpeningBalanceController,
    ExpenseController,
    ReportsController,
  ],
  providers: [
    InvoiceService,
    CollectionService,
    LedgerService,
    HandoverService,
    PTPService,
    EodService,
    WorklistService,
    CreditNoteService,
    ExpenseService,
    ReportsService,
    CreditPortService,
    CodSettlementService,
    TallyExportService,
    ChequeService,
    OpeningBalanceService,
    DocNumberService,
    {
      provide: LEDGER_PORT,
      useFactory: (ledger: LedgerService) => ledger,
      inject: [LedgerService],
    },
    CreditPortProvider,
    CodSettlementProvider,
    TallyExportProvider,
    ChequeProvider,
  ],
  exports: [
    InvoiceService,
    CollectionService,
    LedgerService,
    HandoverService,
    PTPService,
    EodService,
    WorklistService,
    CreditNoteService,
    CreditPortService,
    CodSettlementService,
    TallyExportService,
    ChequeService,
    OpeningBalanceService,
    ExpenseService,
    ReportsService,
    LEDGER_PORT,
    CREDIT_PORT,
  ],
})
export class M6FinancialsModule {
  private readonly logger = new Logger(M6FinancialsModule.name);

  constructor(
    @Inject(EXCEPTION_PORT) private readonly exceptionPort: ExceptionPort,
    @InjectKnex() private readonly knex: Knex,
  ) {}

  onModuleInit(): void {
    this.exceptionPort.onResolved(
      'CREDIT_REBATE_WRITEOFF',
      async (
        exceptionId: string,
        action: string,
        remarks: string,
        counterJson?: object,
      ) => {
        try {
          // Fetch the exception to get context
          const exception = await this.knex('exception_approvals')
            .where('id', exceptionId)
            .first('reference_table', 'reference_id', 'context_payload_json');

          if (!exception) {
            this.logger.warn(
              `CREDIT_REBATE_WRITEOFF handler: Exception ${exceptionId} not found`,
            );
            return;
          }

          const payload = exception.context_payload_json
            ? typeof exception.context_payload_json === 'string'
              ? JSON.parse(exception.context_payload_json)
              : exception.context_payload_json
            : {};

          const creditNoteId = exception.reference_id;
          const creditNoteType = payload?.cnType || 'WRITEOFF';

          if (action === 'APPROVED') {
            // APPROVED: Credit note can be posted
            // NOTE: Full credit note posting logic will be implemented in CreditNoteService (Sprint 2)
            // For now, we mark the credit_note as APPROVED if it exists
            if (creditNoteId) {
              await this.knex('credit_notes')
                .where('id', creditNoteId)
                .update({
                  status: 'APPROVED',
                  status_reason: remarks || null,
                  approved_at: new Date(),
                });
              this.logger.log(
                `CREDIT_REBATE_WRITEOFF ${exceptionId}: Credit note ${creditNoteId} (${creditNoteType}) APPROVED`,
              );
            } else {
              // If no credit_note reference, create a placeholder entry
              this.logger.log(
                `CREDIT_REBATE_WRITEOFF ${exceptionId}: APPROVED for ${creditNoteType}, amount ${payload.valueAtRisk || 'unknown'}`,
              );
            }
          } else if (action === 'REJECTED') {
            // REJECTED: Credit note is rejected
            if (creditNoteId) {
              await this.knex('credit_notes').where('id', creditNoteId).update({
                status: 'REJECTED',
                rejected_reason: remarks,
                rejected_at: new Date(),
              });
              this.logger.log(
                `CREDIT_REBATE_WRITEOFF ${exceptionId}: Credit note ${creditNoteId} REJECTED - ${remarks}`,
              );
            } else {
              this.logger.log(
                `CREDIT_REBATE_WRITEOFF ${exceptionId}: REJECTED for ${creditNoteType} - ${remarks}`,
              );
            }
          } else if (action === 'COUNTERED') {
            // COUNTERED: Owner proposed a different amount
            const counterAmount =
              counterJson &&
              typeof counterJson === 'object' &&
              'amount' in counterJson
                ? String(counterJson.amount)
                : null;

            if (creditNoteId && counterAmount) {
              await this.knex('credit_notes').where('id', creditNoteId).update({
                total_debit: counterAmount,
                status: 'REQUESTED', // Back to requested for re-approval
                counter_amount: counterAmount,
                counter_remarks: remarks,
              });
              this.logger.log(
                `CREDIT_REBATE_WRITEOFF ${exceptionId}: COUNTERED with amount ${counterAmount}`,
              );
            }
          }
        } catch (err) {
          const error = err as Error;
          this.logger.error(
            `CREDIT_REBATE_WRITEOFF handler failed for ${exceptionId}: ${error.message}`,
          );
          // Don't re-throw - exception resolution should not fail silently
        }
      },
    );

    this.logger.log(
      'M6FinancialsModule: CREDIT_REBATE_WRITEOFF handler registered',
    );
  }
}
