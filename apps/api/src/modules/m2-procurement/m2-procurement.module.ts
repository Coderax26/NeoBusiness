import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../m0-platform/database.module.js';
import { AuthModule } from '../m0-platform/auth.module.js';
import { M7aExceptionsModule } from '../m7a-exceptions/m7a-exceptions.module.js';
import { SupplierService } from './supplier.service.js';
import { POService } from './po.service.js';
import { GRNService } from './grn.service.js';
import { ShortfallService } from './shortfall.service.js';
import { BackToBackService } from './back-to-back.service.js';
import { RequisitionService } from './requisition.service.js';
import { SupplierBillService } from './supplier-bill.service.js';
import { ProcurementPortService } from './procurement-port.service.js';
import { SupplierMaintenanceJob } from './supplier-maintenance.job.js';
import { SupplierController } from './supplier.controller.js';
import { POController } from './po.controller.js';
import { GRNController } from './grn.controller.js';
import { RequisitionController } from './requisition.controller.js';
import { ShortfallController } from './shortfall.controller.js';
import { SupplierBillController } from './supplier-bill.controller.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { PROCUREMENT_PORT } from '../../shared/ports/ports.interface.js';

/**
 * M2 Procurement & Supplier Module
 *
 * Provides:
 * - Supplier master data & rate tracking
 * - Purchase orders with BR-03 price spike detection
 * - Blind GRN receiving with BR-05 shortfall detection
 * - Backup supplier ranking
 * - Back-to-back trading POs
 * - Purchase requisitions
 * - Supplier bills with 3-way matching
 * - ProcurementPort implementation for M1 integration
 *
 * Exports: PROCUREMENT_PORT (real implementation replaces stub)
 */
@Global()
@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, M7aExceptionsModule],
  controllers: [
    SupplierController,
    POController,
    GRNController,
    RequisitionController,
    ShortfallController,
    SupplierBillController,
  ],
  providers: [
    SupplierService,
    POService,
    GRNService,
    ShortfallService,
    BackToBackService,
    RequisitionService,
    SupplierBillService,
    SupplierMaintenanceJob,
    ProcurementPortService,
    {
      provide: PROCUREMENT_PORT,
      useExisting: ProcurementPortService,
    },
    DocNumberService,
    ConfigService,
    OutboxService,
  ],
  exports: [
    PROCUREMENT_PORT,
    SupplierService,
    POService,
    GRNService,
    ShortfallService,
    BackToBackService,
    RequisitionService,
    SupplierBillService,
    SupplierMaintenanceJob,
    ProcurementPortService,
  ],
})
export class M2ProcurementModule {}
