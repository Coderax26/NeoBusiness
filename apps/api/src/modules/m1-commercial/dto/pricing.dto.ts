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
  IsDateString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for bulk upserting daily prices.
 * Body contains array of { itemId, landedCost, floorPrice?, targetPrice?, source }
 */
export class UpsertDailyPriceItemDto {
  @IsUUID()
  itemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  latestLandedCost: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  floorPrice?: number; // if omitted, auto-calculated from minMarginPct

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetPrice?: number; // if omitted, uses floor + margin buffer

  @IsOptional()
  @IsEnum(['AUTO', 'MANUAL'])
  source?: string; // default 'MANUAL' when price provided, 'AUTO' when only landedCost given
}

/**
 * DTO for publishing prices for a specific date.
 */
export class PublishPricesDto {
  @IsDateString()
  effectiveDate: string; // YYYY-MM-DD

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertDailyPriceItemDto)
  items: UpsertDailyPriceItemDto[];
}

/**
 * Query DTO for fetching today's prices.
 */
export class GetPricesQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string; // default today

  @IsOptional()
  @IsUUID()
  siteId?: string; // filter by site if needed

  @IsOptional()
  @IsEnum(['TRADED_GOOD', 'RAW_MATERIAL', 'PROCESSED_FG', 'PACKAGING'])
  itemCategory?: string;
}
