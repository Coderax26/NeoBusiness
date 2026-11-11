import { Injectable } from '@nestjs/common';
import type { ProductionPort } from '../../shared/ports/ports.interface.js';
import { RequisitionService } from './requisition.service.js';
import { WorkOrderService } from './work-order.service.js';

/**
 * ProductionPortService — Real implementation of ProductionPort
 * Delegates shortage requisition creation to RequisitionService
 * and work order status inspection to WorkOrderService.
 */
@Injectable()
export class ProductionPortService implements ProductionPort {
  constructor(
    private readonly requisitionService: RequisitionService,
    private readonly workOrderService: WorkOrderService,
  ) {}

  async createRequisition(
    sourceOrderLineId: string,
    finishedItemId: string,
    netQty: string,
    requiredBy: Date,
  ): Promise<string> {
    return this.requisitionService.createRequisition(
      sourceOrderLineId,
      finishedItemId,
      netQty,
      requiredBy,
    );
  }

  async workOrderStatus(workOrderId: string): Promise<{
    status: string;
    plannedQty: string;
    actualOutputQty: string | null;
  } | null> {
    return this.workOrderService.workOrderStatus(workOrderId);
  }
}

