import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ArrayNotEmpty,
  ValidateNested,
} from 'class-validator';

const POSITIVE_QTY = /^(?=.*[1-9])\d+(?:\.\d{1,3})?$/;
const NON_NEGATIVE_QTY = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

export class AtpQueryDto {
  @IsUUID()
  siteId!: string;

  @IsUUID()
  itemId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(POSITIVE_QTY)
  qty!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  deliveryDate?: string;
}

export class CurrentStockQueryDto {
  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  itemId?: string;
}

export class LedgerQueryDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class CreateReservationDto {
  @IsUUID()
  siteId!: string;

  @IsUUID()
  itemId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(POSITIVE_QTY)
  qty!: string;

  @IsUUID()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  deliveryDate?: string;
}

export class ReleaseReservationDto {
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

export class CreateTransferDto {
  @IsUUID()
  fromSiteId!: string;

  @IsUUID()
  toSiteId!: string;

  @IsUUID()
  itemId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(POSITIVE_QTY)
  qty!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

export class ReceiveTransferLineDto {
  @IsUUID()
  lineId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(NON_NEGATIVE_QTY)
  receivedQty!: string;

  @IsOptional()
  @IsString()
  varianceReason?: string;
}

export class ReceiveTransferDto {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferLineDto)
  lines!: ReceiveTransferLineDto[];
}

export class PostGrnDto {
  @IsUUID()
  siteId!: string;

  @IsUUID()
  itemId!: string;

  @IsString()
  @IsNotEmpty()
  poId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(POSITIVE_QTY)
  requestedQty!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/)
  receivedQty!: string;
}

export enum AdjustmentType {
  WRITEOFF = 'WRITEOFF',
  SHRINKAGE = 'SHRINKAGE',
}

export class CreateAdjustmentDto {
  @IsUUID()
  siteId!: string;

  @IsUUID()
  itemId!: string;

  @IsEnum(AdjustmentType)
  adjustmentType!: AdjustmentType;

  @IsString()
  @IsNotEmpty()
  @Matches(POSITIVE_QTY)
  qty!: string;

  @IsString()
  @IsNotEmpty()
  remarks!: string;
}

export class RejectAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
