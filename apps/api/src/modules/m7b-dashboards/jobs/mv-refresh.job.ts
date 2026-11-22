import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * MvRefreshJob — Scheduled jobs for materialized view refresh
 *
 * Refresh frequencies:
 * - Pulse: every 30 seconds (high frequency for Owner dashboard)
 * - Ops Status: every 2 minutes
 * - Inventory Alerts: every 5 minutes
 * - Analytics: nightly at 2-3 AM
 */

@Injectable()
export class MvRefreshJob {
  private readonly logger = new Logger(MvRefreshJob.name);
  private readonly running = new Set<string>();

  constructor(@InjectKnex() private readonly knex: Knex) {}

  private async runGuarded(
    key: string,
    errorContext: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (this.running.has(key)) {
      this.logger.debug(`Skipping ${key}: previous refresh still in progress`);
      return;
    }
    this.running.add(key);
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        `Failed to refresh ${errorContext}: ${(error as Error).message}`,
      );
    } finally {
      this.running.delete(key);
    }
  }

  /**
   * Refresh mv_pulse_today — every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async refreshPulse(): Promise<void> {
    await this.runGuarded('mv_pulse_today', 'mv_pulse_today', async () => {
      await this.knex.raw('SELECT refresh_mv_pulse_today()');
      this.logger.debug('Refreshed mv_pulse_today');
    });
  }

  /**
   * Refresh mv_ops_status — every 2 minutes
   */
  @Cron('*/2 * * * *')
  async refreshOpsStatus(): Promise<void> {
    await this.runGuarded('mv_ops_status', 'mv_ops_status', async () => {
      await this.knex.raw('SELECT refresh_mv_ops_status()');
      this.logger.debug('Refreshed mv_ops_status');
    });
  }

  /**
   * Refresh mv_inventory_alerts — every 5 minutes
   */
  @Cron('*/5 * * * *')
  async refreshInventoryAlerts(): Promise<void> {
    await this.runGuarded(
      'mv_inventory_alerts',
      'mv_inventory_alerts',
      async () => {
        await this.knex.raw('SELECT refresh_mv_inventory_alerts()');
        this.logger.debug('Refreshed mv_inventory_alerts');
      },
    );
  }

  /**
   * Refresh analytics MVs — nightly at 2:00 AM
   */
  @Cron('0 2 * * *')
  async refreshAnalyticsNightly(): Promise<void> {
    await this.runGuarded(
      'analytics_nightly',
      'analytics (customer/supplier)',
      async () => {
        await this.knex.raw('SELECT refresh_mv_customer_profitability()');
        await this.knex.raw('SELECT refresh_mv_supplier_scorecard()');
        this.logger.debug(
          'Refreshed customer profitability & supplier scorecard',
        );
      },
    );
  }

  /**
   * Refresh yield trend and AR aging — nightly at 3:00 AM
   */
  @Cron('0 3 * * *')
  async refreshYieldAndAR(): Promise<void> {
    await this.runGuarded('yield_and_ar', 'yield/AR', async () => {
      await this.knex.raw('SELECT refresh_mv_yield_trend()');
      await this.knex.raw('SELECT refresh_mv_ar_aging()');
      this.logger.debug('Refreshed yield trend & AR aging');
    });
  }

  /**
   * Manual refresh all MVs (for testing/admin)
   */
  async refreshAll(): Promise<void> {
    await this.refreshPulse();
    await this.refreshOpsStatus();
    await this.refreshInventoryAlerts();
    await this.refreshAnalyticsNightly();
    await this.refreshYieldAndAR();
    this.logger.log('All materialized views refreshed manually');
  }
}
