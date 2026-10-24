import { Injectable, Logger } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * DocNumberService — generates sequential document numbers with a
 * PREFIX-YYMM-NNNN format (e.g. INV-2610-0042).
 *
 * Numbers are scoped by (doc_type, period, site_id, device_id) so that:
 *   - Each site has its own sequence (INV-2610-0001, INV-2610-0002, ...)
 *   - Offline devices can pre-allocate provisional numbers with their
 *     device_id, and the server issues the final number on sync.
 *
 * Uses a single UPSERT into doc_sequences to guarantee no gaps under
 * concurrent access.
 */
@Injectable()
export class DocNumberService {
  private readonly logger = new Logger(DocNumberService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Get the next document number for a given type.
   *
   * @param docType  e.g. 'ORDER', 'INVOICE', 'RECEIPT', 'DELIVERY_CHALLAN'
   * @param siteId   UUID of the site (null for global types)
   * @param deviceId optional device ID for offline sequences
   * @param externalTrx optional Knex transaction to participate in
   * @returns formatted number like 'INV-2610-0042'
   */
  async next(
    docType: string,
    siteId?: string | null,
    deviceId?: string | null,
    externalTrx?: Knex.Transaction,
  ): Promise<string> {
    const period = this.currentPeriod();
    const prefix = await this.resolvePrefix(docType, externalTrx);

    const runner = (trx: Knex.Transaction) => this.incrementSequence(trx, docType, prefix, period, siteId, deviceId);

    const nextNo = externalTrx ? await runner(externalTrx) : await this.knex.transaction(runner);

    return this.formatNumber(prefix, period, nextNo);
  }

  /**
   * Peek at the next number without incrementing (for validation/preview).
   */
  async peek(docType: string, siteId?: string | null, deviceId?: string | null): Promise<string> {
    const period = this.currentPeriod();
    const prefix = await this.resolvePrefix(docType);

    const query = this.knex('doc_sequences').where({
      doc_type: docType,
      period,
    });

    if (siteId) query.andWhere('site_id', siteId);
    else query.whereNull('site_id');

    if (deviceId) query.andWhere('device_id', deviceId);
    else query.whereNull('device_id');

    const row = await query.first('last_no');
    const nextNo = row ? Number(row.last_no) + 1 : 1;

    return this.formatNumber(prefix, period, nextNo);
  }

  private async incrementSequence(
    trx: Knex.Transaction,
    docType: string,
    prefix: string,
    period: string,
    siteId?: string | null,
    deviceId?: string | null,
  ): Promise<number> {
    // Check if row exists under lock
    const query = trx('doc_sequences')
      .where({ doc_type: docType, period })
      .forUpdate();

    if (siteId) query.andWhere('site_id', siteId);
    else query.whereNull('site_id');

    if (deviceId) query.andWhere('device_id', deviceId);
    else query.whereNull('device_id');

    const existing = await query.first();

    if (existing) {
      const updatedNo = Number(existing.last_no) + 1;
      const updateQuery = trx('doc_sequences')
        .where({ doc_type: docType, period })
        .update({ last_no: updatedNo });

      if (siteId) updateQuery.andWhere('site_id', siteId);
      else updateQuery.whereNull('site_id');

      if (deviceId) updateQuery.andWhere('device_id', deviceId);
      else updateQuery.whereNull('device_id');

      await updateQuery;
      return updatedNo;
    }

    // First insert for this (type, period, site, device) combination
    await trx('doc_sequences').insert({
      doc_type: docType,
      prefix,
      period,
      last_no: 1,
      site_id: siteId ?? null,
      device_id: deviceId ?? null,
    });

    return 1;
  }

  private async resolvePrefix(docType: string, trx?: Knex.Transaction): Promise<string> {
    const query = (trx || this.knex)('doc_sequences')
      .where('doc_type', docType)
      .first('prefix');

    const row = await query;
    if (row && row.prefix) return row.prefix;

    // Fallback to a default prefix derived from the doc type name
    const fallback = docType
      .split('_')
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('');
    return fallback || 'DOC';
  }

  private currentPeriod(): string {
    const now = new Date();
    const year = String(now.getUTCFullYear() % 100).padStart(2, '0');
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
  }

  private formatNumber(prefix: string, period: string, seqNo: number): string {
    return `${prefix}-${period}-${seqNo.toString().padStart(4, '0')}`;
  }
}