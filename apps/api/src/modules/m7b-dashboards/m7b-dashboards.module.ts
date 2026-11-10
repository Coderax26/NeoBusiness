import { Module, Global } from '@nestjs/common';
import { KnexModule } from 'nestjs-knex';
import { DashboardController } from './dashboard.controller.js';
import { AnalyticsController } from './analytics.controller.js';
import { StockAlertsController } from './stock-alerts.controller.js';
import { DashboardService } from './dashboard.service.js';
import { AnalyticsService } from './analytics.service.js';
import { StockAlertsService } from './stock-alerts.service.js';
import { MvRefreshJob } from './jobs/mv-refresh.job.js';
import { DashboardEventHandler } from './dashboard-event.handler.js';
import {
  DASHBOARD_PORT,
  ANALYTICS_PORT,
} from '../../shared/ports/ports.interface.js';

@Global()
@Module({
  imports: [KnexModule],
  providers: [
    DashboardService,
    AnalyticsService,
    StockAlertsService,
    MvRefreshJob,
    DashboardEventHandler,
    {
      provide: DASHBOARD_PORT,
      useFactory: (svc: DashboardService) => svc,
      inject: [DashboardService],
    },
    {
      provide: ANALYTICS_PORT,
      useFactory: (svc: AnalyticsService) => svc,
      inject: [AnalyticsService],
    },
  ],
  controllers: [
    DashboardController,
    AnalyticsController,
    StockAlertsController,
  ],
  exports: [
    DashboardService,
    AnalyticsService,
    StockAlertsService,
    DASHBOARD_PORT,
    ANALYTICS_PORT,
  ],
})
export class M7bDashboardsModule {}
