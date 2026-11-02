import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KnexModule } from 'nestjs-knex';
import { FleetController } from './fleet.controller.js';
import { FleetService } from './fleet.service.js';
import { M1CommercialModule } from '../m1-commercial/m1-commercial.module.js';
import { M3InventoryModule } from '../m3-inventory/m3-inventory.module.js';
import { M6FinancialsModule } from '../m6-finance/m6-financials.module.js';
import { M7aExceptionsModule } from '../m7a-exceptions/m7a-exceptions.module.js';

@Global()
@Module({
  imports: [
    ConfigModule,
    KnexModule,
    M1CommercialModule,
    M3InventoryModule,
    M6FinancialsModule,
    M7aExceptionsModule,
  ],
  providers: [FleetService],
  controllers: [FleetController],
  exports: [FleetService],
})
export class M5FleetModule {}
