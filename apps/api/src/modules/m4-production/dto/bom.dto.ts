import {
  IsUUID,
  IsInt,
  Min,
  IsString,
  IsNotEmpty,
  MaxLength,
  Matches,
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
  @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,4})?$/, { message: 'qty_per_unit must be positive' })
  qtyPerUnit: string; // numeric string (Qty)

  @IsString()
  @IsNotEmpty()
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
  @IsNotEmpty()
  @MaxLength(50)
  bomNo: string;

  @IsUUID()
  itemId: string; // output/finished good item

  @IsOptional()
  @IsUUID()
  siteId?: string;

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

  @IsOptional()
  @IsString()
  @Matches(/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/, { message: 'yield_pct must be between 0 and 100' })
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
