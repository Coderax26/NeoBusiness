import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsEnum,
} from 'class-validator';

/**
 * Stock Alerts DTOs — Response DTOs for M7b stock alerts
 */

export enum StockAlertType {
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  EXPIRING_SOON = 'EXPIRING_SOON',
  OVERCOMMITTED = 'OVERCOMMITTED',
}

export class StockAlertResponseDto {
  @ApiProperty({
    description: 'Site UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  siteId: string;

  @ApiProperty({
    description: 'Item UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  itemId: string;

  @ApiProperty({ description: 'Item SKU code', example: 'SUR-001' })
  @IsString()
  skuCode: string;

  @ApiProperty({ description: 'Item name', example: 'White Sugar' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Batch number', example: 'BSL-20261027-001' })
  @IsString()
  batchNumber: string;

  @ApiProperty({
    description: 'Expiry date (YYYY-MM-DD)',
    required: false,
    example: '2026-11-30',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string | null;

  @ApiProperty({ description: 'Quantity on hand', example: '500.000' })
  @IsString()
  qtyOnHand: string;

  @ApiProperty({
    description: 'Quantity available (on hand - committed)',
    example: '0.000',
  })
  @IsString()
  qtyAvailable: string;

  @ApiProperty({ description: 'Quantity committed', example: '500.000' })
  @IsString()
  qtyCommitted: string;

  @ApiProperty({
    description: 'Minimum quantity threshold',
    example: '1000.000',
  })
  @IsString()
  minQtyThreshold: string;

  @ApiProperty({ description: 'Alert type', enum: StockAlertType })
  @IsEnum(StockAlertType)
  alertType: StockAlertType;
}
