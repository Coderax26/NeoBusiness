import {
  IsUUID,
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateInvoiceDto {
  @ApiProperty({ description: 'Confirmed sales order UUID' })
  @IsUUID()
  orderId: string;

  @ApiPropertyOptional({ description: 'Fulfillment site UUID' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Delivery trip UUID if invoicing at trip dispatch' })
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiPropertyOptional({ description: '2-digit GST state code for place of supply (e.g. 27)' })
  @IsOptional()
  @IsString()
  placeOfSupplyStateCode?: string;

  @ApiPropertyOptional({ description: 'Whether the invoice is cash on delivery' })
  @IsOptional()
  @IsBoolean()
  isCOD?: boolean;
}

export class CancelInvoiceDto {
  @ApiProperty({ description: 'Reason for invoice cancellation' })
  @IsString()
  reason: string;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ description: 'Customer UUID filter' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Invoice status (UNPAID | PARTIAL | PAID | OVERDUE | CANCELLED)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Filter end date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

