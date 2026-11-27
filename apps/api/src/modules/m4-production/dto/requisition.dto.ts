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
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum RequisitionStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  CONVERTED = 'CONVERTED',
  CANCELLED = 'CANCELLED',
}

export class RequisitionLineDto {
  @IsUUID()
  itemId: string;

  @IsString()
  @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,3})?$/, { message: 'required_qty must be positive' })
  requiredQty: string; // numeric string (Qty)

  @IsString()
  @IsNotEmpty()
  uom: string;

  @IsOptional()
  @IsUUID()
  bomHeaderId?: string;
}

export class CreateRequisitionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  reqNo?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  requestedBy?: string;

  @IsDateString()
  requiredByDate: string;

  @IsOptional()
  @IsEnum(RequisitionStatus)
  status: RequisitionStatus = RequisitionStatus.DRAFT;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines: RequisitionLineDto[];
}

export class UpdateRequisitionDto {
  @IsOptional()
  @IsEnum(RequisitionStatus)
  status?: RequisitionStatus;

  @IsOptional()
  @IsDateString()
  requiredByDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines?: RequisitionLineDto[];
}

export class RequisitionLineResponseDto {
  id: string;
  requisitionId: string;
  itemId: string;
  itemName: string;
  itemSkuCode: string;
  itemCategory: string;
  requiredQty: string;
  uom: string;
  bomHeaderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export class RequisitionResponseDto {
  id: string;
  reqNo: string;
  siteId: string;
  requestedBy: string;
  requiredByDate: string;
  status: RequisitionStatus;
  lines: RequisitionLineResponseDto[];
  createdAt: string;
  updatedAt: string;
}
