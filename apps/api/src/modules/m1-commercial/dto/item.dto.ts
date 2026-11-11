import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new item.
 */
export class CreateItemDto {
  @IsString()
  skuCode: string; // unique business SKU

  @IsString()
  name: string;

  @IsEnum(['TRADED_GOOD', 'RAW_MATERIAL', 'PROCESSED_FG', 'PACKAGING'])
  itemCategory: string;

  @IsEnum(['KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER'])
  primaryUom: string;

  @IsOptional()
  @IsEnum(['KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER'])
  secondaryUom?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shelfLifeDays?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRatePct: number; // e.g., 0.18 for 18%

  @IsOptional()
  @IsString()
  hsnCode?: string;

  @IsOptional()
  @IsBoolean()
  isCatchWeight?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardWeightPerSecondaryKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minMarginPct?: number; // default from config

  @IsEnum(['TAXABLE', 'EXEMPT', 'NIL_RATED', 'NON_GST'])
  taxTreatment: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO for updating an item (OWNER mostly).
 */
export class UpdateItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['TRADED_GOOD', 'RAW_MATERIAL', 'PROCESSED_FG', 'PACKAGING'])
  itemCategory?: string;

  @IsOptional()
  @IsEnum(['KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER'])
  primaryUom?: string;

  @IsOptional()
  @IsEnum(['KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER'])
  secondaryUom?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shelfLifeDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRatePct?: number;

  @IsOptional()
  @IsString()
  hsnCode?: string;

  @IsOptional()
  @IsBoolean()
  isCatchWeight?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardWeightPerSecondaryKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minMarginPct?: number;

  @IsOptional()
  @IsEnum(['TAXABLE', 'EXEMPT', 'NIL_RATED', 'NON_GST'])
  taxTreatment?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO for UoM conversion.
 */
export class CreateUomConversionDto {
  @IsUUID()
  itemId: string;

  @IsEnum(['KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER'])
  fromUom: string;

  @IsEnum(['KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER'])
  toUom: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  factor: number; // conversion factor
}
