import {
  IsUUID,
  IsInt,
  Min,
  Max,
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum BomStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  OBSOLETE = 'OBSOLETE',
}

export class BomLineDto {
  @IsUUID()
  itemId: string;

  @IsString()
  @Min(1, { message: 'qty_per_unit must be positive' })
  qtyPerUnit: string; // numeric string (Qty)

  @IsString()
  uom: string;

  @IsInt()
  @Min(1)
  sequenceNo: number = 1;

  @IsOptional()
  @IsBoolean()
  isCritical: boolean = false;
}

export class CreateBomDto {
  @IsString()
  @Min(1)
  @Max(50)
  bomNo: string;

  @IsUUID()
  itemId: string; // output/finished good item

  @IsUUID()
  siteId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  version: number = 1;

  @IsOptional()
  @IsEnum(BomStatus)
  status: BomStatus = BomStatus.DRAFT;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsString()
  @Min(1, { message: 'yield_pct must be positive' })
  @Max(100, { message: 'yield_pct cannot exceed 100' })
  yieldPct: string = '95.00';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  lines: BomLineDto[];
}

export class ActivateBomDto {
  @IsUUID()
  bomId: string;
}

export class BomLineResponseDto {
  id: string;
  itemId: string;
  itemName: string;
  itemSkuCode: string;
  qtyPerUnit: string;
  uom: string;
  sequenceNo: number;
  isCritical: boolean;
}

export class BomHeaderResponseDto {
  id: string;
  bomNo: string;
  itemId: string;
  itemName: string;
  itemSkuCode: string;
  siteId: string;
  version: number;
  status: BomStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  yieldPct: string;
  lines: BomLineResponseDto[];
  createdAt: string;
  updatedAt: string;
}
