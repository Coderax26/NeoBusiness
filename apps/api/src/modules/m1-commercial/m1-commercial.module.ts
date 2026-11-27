import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../m0-platform/database.module.js';
import { AuthModule } from '../m0-platform/auth.module.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { PricingService } from './pricing.service.js';
import { ItemService } from './item.service.js';
import { CreditService } from './credit.service.js';
import { CustomerService } from './customer.service.js';
import { OrderService } from './order.service.js';
import { QuoteService } from './quote.service.js';
import { CustomerController } from './customer.controller.js';
import { ItemController } from './item.controller.js';
import { PricingController } from './pricing.controller.js';
import { OrderController } from './order.controller.js';
import { QuoteController } from './quote.controller.js';
import { M7aExceptionsModule } from '../m7a-exceptions/m7a-exceptions.module.js';
import {
  ITEM_PORT,
  PRICING_PORT,
} from '../../shared/ports/ports.interface.js';

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
  imports: [ConfigModule, DatabaseModule, AuthModule, M7aExceptionsModule],
  providers: [
    PricingService,
    ItemService,
    CreditService,
    CustomerService,
    OrderService,
    QuoteService,
    DocNumberService,
    // Wire the real implementations as the global port tokens.
    // M1 does not import M7aExceptionsModule here — it subscribes to event handlers directly.
    // M1 also provides INVENTORY_PORT stub for Sprint 1 backward compatibility
    {
      provide: PRICING_PORT,
      useExisting: PricingService,
    },
    {
      provide: ITEM_PORT,
      useExisting: ItemService,
    },
  ],
  controllers: [
    CustomerController,
    ItemController,
    PricingController,
    OrderController,
    QuoteController,
  ],
  exports: [
    PricingService,
    ItemService,
    CreditService,
    CustomerService,
    OrderService,
    QuoteService,
    DocNumberService,
    PRICING_PORT,
    ITEM_PORT,
  ],
})
export class M1CommercialModule {}
