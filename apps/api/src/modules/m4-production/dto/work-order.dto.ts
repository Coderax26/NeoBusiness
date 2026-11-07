import {
  IsUUID,
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum WorkOrderStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class WorkOrderMaterialDto {
  @IsUUID()
  itemId: string;

  @IsString()
  @Min(1, { message: 'planned_qty must be positive' })
  plannedQty: string;

  @IsString()
  uom: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsString()
  actualQty?: string;
}

export class WorkOrderOutputDto {
  @IsUUID()
  itemId: string;

  @IsString()
  @Min(1, { message: 'planned_qty must be positive' })
  plannedQty: string;

  @IsString()
  uom: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsString()
  actualQty?: string;
}

export class CreateWorkOrderDto {
  @IsString()
  @Min(1)
  @Max(50)
  woNo: string;

  @IsUUID()
  siteId: string;

  @IsUUID()
  bomHeaderId: string;

  @IsString()
  @Min(1, { message: 'planned_qty must be positive' })
  plannedQty: string;

  @IsString()
  uom: string;

  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status: WorkOrderStatus = WorkOrderStatus.PLANNED;
}

export class RecordConsumptionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkOrderMaterialDto)
  lines: WorkOrderMaterialDto[];
}

export class RecordOutputDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkOrderOutputDto)
  lines: WorkOrderOutputDto[];
}

export class StartWorkOrderDto {
  @IsUUID()
  startedBy: string;
}

export class CompleteWorkOrderDto {
  @IsUUID()
  completedBy: string;
}

export class WorkOrderMaterialResponseDto {
  id: string;
  workOrderId: string;
  itemId: string;
  itemName: string;
  itemSkuCode: string;
  batchId: string | null;
  batchNumber: string | null;
  plannedQty: string;
  actualQty: string;
  uom: string;
  variancePct: string;
  createdAt: string;
  updatedAt: string;
}

export class WorkOrderOutputResponseDto {
  id: string;
  workOrderId: string;
  itemId: string;
  itemName: string;
  itemSkuCode: string;
  batchId: string | null;
  batchNumber: string | null;
  plannedQty: string;
  actualQty: string;
  uom: string;
  yieldPct: string;
  createdAt: string;
  updatedAt: string;
}

export class WorkOrderResponseDto {
  id: string;
  woNo: string;
  siteId: string;
  bomHeaderId: string;
  bomNo: string;
  finishedItemId: string;
  finishedItemName: string;
  finishedItemSkuCode: string;
  plannedQty: string;
  uom: string;
  status: WorkOrderStatus;
  startedAt: string | null;
  completedAt: string | null;
  startedBy: string | null;
  completedBy: string | null;
  materials: WorkOrderMaterialResponseDto[];
  outputs: WorkOrderOutputResponseDto[];
  createdAt: string;
  updatedAt: string;
}
