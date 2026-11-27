import {
  IsUUID,
  IsString,
  IsNotEmpty,
  MaxLength,
  Matches,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
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

  @IsOptional()
  @IsString()
  @Matches(/^\d+(?:\.\d{1,3})?$/, { message: 'planned_qty must be a valid non-negative numeric string' })
  plannedQty?: string;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,3})?$/, { message: 'actual_qty must be positive' })
  actualQty?: string;
}

export class WorkOrderOutputDto {
  @IsUUID()
  itemId: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(?:\.\d{1,3})?$/, { message: 'planned_qty must be a valid non-negative numeric string' })
  plannedQty?: string;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  batchNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,3})?$/, { message: 'actual_qty must be positive' })
  actualQty?: string;
}

export class CreateWorkOrderDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  woNo?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsUUID()
  bomHeaderId: string;

  @IsString()
  @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,3})?$/, { message: 'planned_qty must be positive' })
  plannedQty: string;

  @IsString()
  @IsNotEmpty()
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
