import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from 'class-validator';

export enum WastageReasonType {
  NORMAL = 'NORMAL',
  ABNORMAL = 'ABNORMAL',
  EXPIRY = 'EXPIRY',
  DAMAGE = 'DAMAGE',
}

export enum WastageStatus {
  RECORDED = 'RECORDED',
  APPROVED = 'APPROVED',
  WRITTEN_OFF = 'WRITTEN_OFF',
}

export class CreateWastageDto {
  @IsUUID()
  workOrderId: string;

  @IsUUID()
  itemId: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsString()
  @Min(1, { message: 'qty must be positive' })
  qty: string;

  @IsString()
  uom: string;

  @IsEnum(WastageReasonType)
  reasonType: WastageReasonType;
}

export class UpdateWastageDto {
  @IsOptional()
  @IsEnum(WastageStatus)
  status?: WastageStatus;

  @IsOptional()
  @IsUUID()
  approvedBy?: string;
}

export class WastageResponseDto {
  id: string;
  workOrderId: string;
  itemId: string;
  itemName: string;
  itemSkuCode: string;
  batchId: string | null;
  batchNumber: string | null;
  qty: string;
  uom: string;
  reasonType: WastageReasonType;
  status: WastageStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  createdAt: string;
}
