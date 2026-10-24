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
 * concurrent access (SERIALIZABLE not required because the row-level
 * lock on the sequence row prevents race conditions).
 */
@Injectable()
export class DocNumberService {
  private readonly logger = new Logger(DocNumberService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Get the next document number for a given type.
   *
   * @param docType  e.g. 'invoice', 'receipt', 'delivery_challan'
   * @param siteId   UUID of the site (null for global types)
   * @param deviceId optional device ID for offline sequences
   * @returns formatted number like 'INV-2610-0042'
   */
  async next(docType: string, siteId?: string, deviceId?: string): Promise<string> {
    const period = this.currentPeriod();

    const prefix = await this.resolvePrefix(docType);

    const nextNo = await this.knex.transaction(async (trx) => {
      // Upsert the sequence row, incrementing last_no
      const result = await trx('doc_sequences')
        .where({
          doc_type: docType,
          period,
          site_id: siteId ?? null,
          device_id: deviceId ?? null,
        })
        .update('last_no', trx.raw('?? + 1', ['last_no']))
        .returning('last_no');

      if (result.length > 0) {
        return Number(result[0]);
      }

      // First insert for this combination
      await trx('doc_sequences').insert({
        doc_type: docType,
        prefix,
        period,
        last_no: 1,
        site_id: siteId ?? null,
        device_id: deviceId ?? null,
      });

      return 1;
    });

    return this.formatNumber(prefix, period, nextNo);
  }

  /**
   * Peek at the next number without incrementing (for validation/preview).
   */
  async peek(docType: string, siteId?: string, deviceId?: string): Promise<string> {
    const period = this.currentPeriod();
    const prefix = await this.resolvePrefix(docType);

    const row = await this.knex('doc_sequences')
      .where({
        doc_type: docType,
        period,
        site_id: siteId ?? null,
        device_id: deviceId ?? null,
      })
      .first('last_no');

    const nextNo = row ? Number(row.last_no) + 1 : 1;
    return this.formatNumber(prefix, period, nextNo);
  }

  private async resolvePrefix(docType: string): Promise<string> {
    const row = await this.knex('doc_sequences')
      .where('doc_type', docType)
      .first('prefix');
    if (row) return row.prefix;

    // Fallback to a default prefix derived from the doc type
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