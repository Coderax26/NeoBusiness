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

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Refresh mv_pulse_today — every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async refreshPulse(): Promise<void> {
    try {
      await this.knex.raw('SELECT refresh_mv_pulse_today()');
      this.logger.debug('Refreshed mv_pulse_today');
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_pulse_today: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Refresh mv_ops_status — every 2 minutes
   */
  @Cron('*/2 * * * *')
  async refreshOpsStatus(): Promise<void> {
    try {
      await this.knex.raw('SELECT refresh_mv_ops_status()');
      this.logger.debug('Refreshed mv_ops_status');
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_ops_status: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Refresh mv_inventory_alerts — every 5 minutes
   */
  @Cron('*/5 * * * *')
  async refreshInventoryAlerts(): Promise<void> {
    try {
      await this.knex.raw('SELECT refresh_mv_inventory_alerts()');
      this.logger.debug('Refreshed mv_inventory_alerts');
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_inventory_alerts: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Refresh analytics MVs — nightly at 2:00 AM
   */
  @Cron('0 2 * * *')
  async refreshAnalyticsNightly(): Promise<void> {
    try {
      await this.knex.raw('SELECT refresh_mv_customer_profitability()');
      await this.knex.raw('SELECT refresh_mv_supplier_scorecard()');
      this.logger.debug(
        'Refreshed customer profitability & supplier scorecard',
      );
    } catch (error) {
      this.logger.error(
        `Failed to refresh analytics (customer/supplier): ${(error as Error).message}`,
      );
    }
  }

  /**
   * Refresh yield trend and AR aging — nightly at 3:00 AM
   */
  @Cron('0 3 * * *')
  async refreshYieldAndAR(): Promise<void> {
    try {
      await this.knex.raw('SELECT refresh_mv_yield_trend()');
      await this.knex.raw('SELECT refresh_mv_ar_aging()');
      this.logger.debug('Refreshed yield trend & AR aging');
    } catch (error) {
      this.logger.error(
        `Failed to refresh yield/AR: ${(error as Error).message}`,
      );
    }
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
