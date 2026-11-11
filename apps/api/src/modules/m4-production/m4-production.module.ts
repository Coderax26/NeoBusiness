import { Module, Global } from '@nestjs/common';
import { DatabaseModule } from '../m0-platform/database.module.js';
import { M7aExceptionsModule } from '../m7a-exceptions/m7a-exceptions.module.js';
import { M1CommercialModule } from '../m1-commercial/m1-commercial.module.js';
import { M3InventoryModule } from '../m3-inventory/m3-inventory.module.js';
import { BomService } from './bom.service.js';
import { BomRepository } from './repositories/bom.repository.js';
import { BomController } from './bom.controller.js';
import { RequisitionService } from './requisition.service.js';
import { RequisitionRepository } from './repositories/requisition.repository.js';
import { RequisitionController } from './requisition.controller.js';
import { WorkOrderService } from './work-order.service.js';
import { WorkOrderRepository } from './repositories/work-order.repository.js';
import { WorkOrderController } from './work-order.controller.js';
import { WastageService } from './wastage.service.js';
import { WastageRepository } from './repositories/wastage.repository.js';
import { WastageController } from './wastage.controller.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceRepository } from './repositories/attendance.repository.js';
import { AttendanceController } from './attendance.controller.js';
import { ProductionPortService } from './production-port.service.js';
import {
  PRODUCTION_PORT,
  type ProductionPort,
} from '../../shared/ports/ports.interface.js';

/**
 * M4 Factory Production Module.
 *
 * Provides ProductionPort via @Global() for M1/M3 consumption.
 * Consumes ItemPort from M1, ExceptionPort/NotifyPort from M7a, InventoryPort from M3.
 *
 * Build order: After M0, M1, M3, M7a
 */
@Global()
@Module({
  imports: [
    DatabaseModule,
    M7aExceptionsModule,
    M1CommercialModule,
    M3InventoryModule,
  ],
  providers: [
    BomRepository,
    BomService,
    RequisitionRepository,
    RequisitionService,
    WorkOrderRepository,
    WorkOrderService,
    WastageRepository,
    WastageService,
    AttendanceRepository,
    AttendanceService,
    ProductionPortService,
    // Wire ProductionPort to real implementation
    {
      provide: PRODUCTION_PORT,
      useExisting: ProductionPortService,
    },
  ],
  controllers: [
    BomController,
    RequisitionController,
    WorkOrderController,
    WastageController,
    AttendanceController,
  ],
  exports: [
    BomRepository,
    BomService,
    RequisitionRepository,
    RequisitionService,
    WorkOrderRepository,
    WorkOrderService,
    WastageService,
    AttendanceService,
    PRODUCTION_PORT,
  ],
})
export class M4ProductionModule {}
