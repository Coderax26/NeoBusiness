import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { SupplierService } from './supplier.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { ExceptionService } from '../m7a-exceptions/exception.service.js';

@Injectable()
export class SupplierMaintenanceJob {
  private readonly logger = new Logger(SupplierMaintenanceJob.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly supplierService: SupplierService,
    private readonly outbox: OutboxService,
    private readonly exceptionService: ExceptionService,
  ) {}

  /**
   * Nightly job (00:00): Recompute supplier reliability scores based on fulfillment history
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateAllSupplierPerformance(): Promise<void> {
    this.logger.log('Starting nightly supplier performance recomputation');

    try {
      const suppliers = await this.knex('suppliers')
        .where('is_active', true)
        .select('id', 'name');

      let updatedCount = 0;
      for (const supplier of suppliers) {
        try {
          await this.supplierService.updateReliabilityScore(supplier.id, 'system');
          updatedCount++;
        } catch (err) {
          this.logger.error(
            `Failed to update reliability score for supplier ${supplier.id} (${supplier.name}): ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `Supplier performance recomputation complete: ${updatedCount}/${suppliers.length} updated`,
      );
    } catch (err) {
      this.logger.error(
        `Supplier performance job failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Daily job (06:00): Detect stale supplier quotes and missing rates for active items
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkStaleAndMissingRates(): Promise<void> {
    this.logger.log('Checking for stale supplier quotes and missing rates');

    try {
      const sites = await this.knex('sites').select('id', 'name');

      for (const site of sites) {
        // Items missing quotes
        const missing = await this.supplierService.getSuppliersMissingRates(site.id);
        if (missing.length > 0) {
          this.logger.warn(
            `Site ${site.name} has ${missing.length} items without active supplier rates`,
          );

          await this.knex.transaction(async (trx) => {
            await this.outbox.raise(
              trx,
              'supplier.stale_rates_detected',
              site.id,
              {
                siteId: site.id,
                missingItemCount: missing.length,
                sampleItems: missing.slice(0, 5),
              },
              'm2',
            );
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Stale rates check failed: ${(err as Error).message}`,
      );
    }
  }
}
