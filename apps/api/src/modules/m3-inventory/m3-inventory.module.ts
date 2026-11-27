import { Global, Module } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryExpiryJob } from './inventory-expiry.job.js';
import { InventoryDriftJob } from './inventory-drift.job.js';
import { InventoryEventHandler } from './inventory-event.handler.js';
import { LedgerPostingService } from './ledger-posting.service.js';
import { ConfigModule } from '@nestjs/config';
import { INVENTORY_PORT } from '../../shared/ports/ports.interface.js';

@Global()
@Module({
  providers: [
    InventoryService,
    InventoryExpiryJob,
    InventoryDriftJob,
    InventoryEventHandler,
    LedgerPostingService,
    { provide: INVENTORY_PORT, useExisting: InventoryService },
  ],
  controllers: [InventoryController],
  exports: [InventoryService, INVENTORY_PORT],
  imports: [ConfigModule],
})
export class M3InventoryModule {}
