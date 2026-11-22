import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { generateUuidV7 } from '../../shared/utils/uuid.util.js';

export interface OpeningBalanceRow {
  entityType: 'CUSTOMER' | 'SUPPLIER';
  partyId: string;
  amount: string;
  date?: string;
  note?: string;
}

export interface ValidationSummary {
  totalCount: number;
  validCount: number;
  invalidCount: number;
  totalValidAmount: string;
  validRows: OpeningBalanceRow[];
  invalidRows: Array<{ row: OpeningBalanceRow; error: string }>;
}

@Injectable()
export class OpeningBalanceService {
  private readonly logger = new Logger(OpeningBalanceService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Return CSV template string
   */
  getTemplate(): string {
    return [
      'entity_type,party_id,amount,date,note',
      'CUSTOMER,11111111-1111-1111-1111-111111111111,25000.00,2026-11-01,FY Opening AR Balance',
      'SUPPLIER,22222222-2222-2222-2222-222222222222,15000.00,2026-11-01,FY Opening AP Balance',
    ].join('\n');
  }

  /**
   * Validate draft rows before import
   */
  async validateDraft(rows: OpeningBalanceRow[]): Promise<ValidationSummary> {
    const validRows: OpeningBalanceRow[] = [];
    const invalidRows: Array<{ row: OpeningBalanceRow; error: string }> = [];
    let totalValidAmount = Money.zero();

    for (const row of rows) {
      if (!['CUSTOMER', 'SUPPLIER'].includes(row.entityType)) {
        invalidRows.push({ row, error: `Invalid entityType: ${row.entityType}. Must be CUSTOMER or SUPPLIER` });
        continue;
      }

      if (!row.partyId) {
        invalidRows.push({ row, error: 'partyId is required' });
        continue;
      }

      let parsedAmount: Money;
      try {
        parsedAmount = Money.of(row.amount);
        if (parsedAmount.isNegative()) {
          invalidRows.push({ row, error: 'Amount cannot be negative' });
          continue;
        }
      } catch (err) {
        invalidRows.push({ row, error: `Invalid amount format: ${row.amount}` });
        continue;
      }

      // Check entity exists
      if (row.entityType === 'CUSTOMER') {
        const customer = await this.knex('customers').where('id', row.partyId).first('id');
        if (!customer) {
          invalidRows.push({ row, error: `Customer ${row.partyId} not found` });
          continue;
        }
      } else {
        const supplier = await this.knex('suppliers').where('id', row.partyId).first('id');
        if (!supplier) {
          invalidRows.push({ row, error: `Supplier ${row.partyId} not found` });
          continue;
        }
      }

      validRows.push(row);
      totalValidAmount = totalValidAmount.add(parsedAmount);
    }

    return {
      totalCount: rows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      totalValidAmount: totalValidAmount.toStorageString(),
      validRows,
      invalidRows,
    };
  }

  /**
   * Import validated opening balance rows into sub-ledgers
   */
  async importBalances(
    rows: OpeningBalanceRow[],
    siteId: string,
    userId: string,
  ): Promise<{ importedCount: number; totalAmount: string; batchId: string }> {
    const validation = await this.validateDraft(rows);
    if (validation.invalidCount > 0) {
      throw new BadRequestException(
        `Cannot import batch with ${validation.invalidCount} invalid rows. Run draft validation first.`,
      );
    }

    const batchId = generateUuidV7();
    const now = new Date();

    return this.knex.transaction(async (trx) => {
      let totalImportedAmount = Money.zero();

      for (const row of rows) {
        const amount = Money.of(row.amount);
        const postedAt = row.date ? new Date(row.date) : now;

        if (row.entityType === 'CUSTOMER') {
          // Get previous running balance
          const prevEntry = await trx('customer_ledger_entries')
            .where('customer_id', row.partyId)
            .orderBy('posted_at', 'desc')
            .first('running_balance');
          const prevBalance = prevEntry ? Money.of(prevEntry.running_balance) : Money.zero();
          const newBalance = prevBalance.add(amount);

          await trx('customer_ledger_entries').insert({
            site_id: siteId,
            customer_id: row.partyId,
            entry_type: 'OPENING',
            debit: amount.toStorageString(),
            credit: '0.00',
            ref_no: `OB-${batchId.slice(0, 8)}`,
            running_balance: newBalance.toStorageString(),
            posted_at: postedAt,
            note: row.note || 'Opening balance import',
          });

          await trx('customers').where('id', row.partyId).update({
            current_ar_balance: newBalance.toStorageString(),
            updated_at: now,
          });
        } else {
          const prevEntry = await trx('supplier_ledger_entries')
            .where('supplier_id', row.partyId)
            .orderBy('posted_at', 'desc')
            .first('running_balance');
          const prevBalance = prevEntry ? Money.of(prevEntry.running_balance) : Money.zero();
          const newBalance = prevBalance.add(amount);

          await trx('supplier_ledger_entries').insert({
            site_id: siteId,
            supplier_id: row.partyId,
            entry_type: 'OPENING',
            debit: '0.00',
            credit: amount.toStorageString(),
            ref_no: `OB-${batchId.slice(0, 8)}`,
            running_balance: newBalance.toStorageString(),
            posted_at: postedAt,
            note: row.note || 'Opening balance import',
          });

          await trx('suppliers').where('id', row.partyId).update({
            current_ap_balance: newBalance.toStorageString(),
            updated_at: now,
          });
        }

        totalImportedAmount = totalImportedAmount.add(amount);
      }

      this.logger.log(
        `Imported ${rows.length} opening balances (batch ${batchId}, total ${totalImportedAmount.toStorageString()}) by user ${userId}`,
      );

      return {
        importedCount: rows.length,
        totalAmount: totalImportedAmount.toStorageString(),
        batchId,
      };
    });
  }

  /**
   * Reverse an opening balance entry
   */
  async reverseOpeningBalance(
    partyId: string,
    entityType: 'CUSTOMER' | 'SUPPLIER',
    siteId: string,
    userId: string,
    reason: string,
  ): Promise<{ success: boolean; reversedAmount: string }> {
    return this.knex.transaction(async (trx) => {
      if (entityType === 'CUSTOMER') {
        const openingEntry = await trx('customer_ledger_entries')
          .where('customer_id', partyId)
          .where('entry_type', 'OPENING')
          .orderBy('posted_at', 'desc')
          .first('*');

        if (!openingEntry) {
          throw new NotFoundException(`No opening balance found for customer ${partyId}`);
        }

        const reversedAmount = Money.of(openingEntry.debit);
        const prevEntry = await trx('customer_ledger_entries')
          .where('customer_id', partyId)
          .orderBy('posted_at', 'desc')
          .first('running_balance');
        const prevBalance = prevEntry ? Money.of(prevEntry.running_balance) : Money.zero();
        const newBalance = prevBalance.sub(reversedAmount);

        await trx('customer_ledger_entries').insert({
          site_id: siteId,
          customer_id: partyId,
          entry_type: 'ADJUSTMENT',
          debit: '0.00',
          credit: reversedAmount.toStorageString(),
          ref_no: `REV-${openingEntry.ref_no || ''}`,
          running_balance: newBalance.toStorageString(),
          posted_at: new Date(),
          note: `Reversal of opening balance: ${reason}`,
        });

        await trx('customers').where('id', partyId).update({
          current_ar_balance: newBalance.toStorageString(),
          updated_at: new Date(),
        });

        return { success: true, reversedAmount: reversedAmount.toStorageString() };
      } else {
        const openingEntry = await trx('supplier_ledger_entries')
          .where('supplier_id', partyId)
          .where('entry_type', 'OPENING')
          .orderBy('posted_at', 'desc')
          .first('*');

        if (!openingEntry) {
          throw new NotFoundException(`No opening balance found for supplier ${partyId}`);
        }

        const reversedAmount = Money.of(openingEntry.credit);
        const prevEntry = await trx('supplier_ledger_entries')
          .where('supplier_id', partyId)
          .orderBy('posted_at', 'desc')
          .first('running_balance');
        const prevBalance = prevEntry ? Money.of(prevEntry.running_balance) : Money.zero();
        const newBalance = prevBalance.sub(reversedAmount);

        await trx('supplier_ledger_entries').insert({
          site_id: siteId,
          supplier_id: partyId,
          entry_type: 'ADJUSTMENT',
          debit: reversedAmount.toStorageString(),
          credit: '0.00',
          ref_no: `REV-${openingEntry.ref_no || ''}`,
          running_balance: newBalance.toStorageString(),
          posted_at: new Date(),
          note: `Reversal of opening balance: ${reason}`,
        });

        await trx('suppliers').where('id', partyId).update({
          current_ap_balance: newBalance.toStorageString(),
          updated_at: new Date(),
        });

        return { success: true, reversedAmount: reversedAmount.toStorageString() };
      }
    });
  }
}

