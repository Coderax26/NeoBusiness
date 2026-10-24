import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../m0-platform/database.module.js';
import { AuthModule } from '../m0-platform/auth.module.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { ExceptionPort } from '../../shared/ports/ports.interface.js';
import { PricingService } from './pricing.service.js';
import { ItemService } from './item.service.js';
import { CreditService } from './credit.service.js';

/**
 * M1 Commercial & CRM Module.
 *
 * Provides PricingPort, ItemPort, and CreditPort via @Global().
 * Consumers include OrderService (via Injection) and M5 (via ExceptionPort once implemented).
 *
 * Build order note: M1 uses M7a's ExceptionPort to raise PRICE_OVERRIDE/CREDIT_BREACH,
 * but does not yet forward onResolved events to M7a. That's handled in OrderService.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
  ],
  providers: [
    PricingService,
    ItemService,
    CreditService,
    // Wire the real implementations as the global port tokens.
    // M1 does not import M7aExceptionsModule here — it subscribes to event handlers directly.
    {
      provide: 'PRICING_PORT',
      useExisting: PricingService,
    },
    {
      provide: 'ITEM_PORT',
      useExisting: ItemService,
    },
    {
      provide: 'CREDIT_PORT',
      useExisting: CreditService,
    },
  ],
  exports: [
    PricingService,
    ItemService,
    CreditService,
    'PRICING_PORT',
    'ITEM_PORT',
    'CREDIT_PORT',
  ],
})
export class M1CommercialModule {}