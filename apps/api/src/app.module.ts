import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller.js';
import { M0PlatformModule } from './modules/m0-platform/m0-platform.module.js';
import { M7aExceptionsModule } from './modules/m7a-exceptions/m7a-exceptions.module.js';

/**
 * Root application module for NeoBus.
 *
 * Module registration order follows the build order in docs/IMPLEMENTATION_ROADMAP.md:
 *   M0 (Platform) → M7a (Exceptions) → M1 (Commercial) → M6 (Finance) →
 *   M3 (Inventory) → M5 (Fleet) → M4 (Production) → M2 (Procurement) → M7b (Analytics)
 *
 * Business modules are commented out until implemented — they are enabled one sprint at a time.
 */
@Module({
  imports: [
    // ── Configuration ─────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── Rate limiting ──────────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: parseInt(process.env.THROTTLE_TTL_SECONDS ?? '60') * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '100'),
      },
    ]),

    // ── Business modules (activated sprint by sprint) ─────────────────────────
    // Sprint 0: M0 Platform Foundation
    M0PlatformModule,

    // Sprint 0–1: M7a Exception Engine + Notification Hub
    M7aExceptionsModule,

    // Sprint 1: M1 Commercial and CRM
    // M1CommercialModule,

    // Sprint 1: M6 Collections and Financials (core)
    // M6FinanceModule,

    // Sprint 2: M3 Inventory and Warehouse
    // M3InventoryModule,

    // Sprint 2: M5 Fleet, Dispatch and Delivery
    // M5FleetModule,

    // Sprint 3: M4 Factory Production
    // M4ProductionModule,

    // Sprint 3: M2 Procurement and Supplier
    // M2ProcurementModule,

    // Sprint 3: M7b Dashboards and Analytics
    // M7bAnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}

