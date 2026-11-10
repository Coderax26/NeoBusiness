import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

/**
 * Analytics DTOs — Response DTOs for M7b analytics endpoints
 *
 * These DTOs define the shape of responses for Customer Profitability,
 * Supplier Scorecard, Yield Trend, and AR Aging.
 */

export class CustomerProfitabilityResponseDto {
  @ApiProperty({
    description: 'Customer UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  customerId: string;

  @ApiProperty({
    description: 'Business name',
    example: 'Sweet Treats Confectionery',
  })
  @IsString()
  businessName: string;

  @ApiProperty({ description: 'Customer code', example: 'ST-001' })
  @IsString()
  customerCode: string;

  @ApiProperty({ description: 'Number of orders', example: 15 })
  @IsNumber()
  orderCount: number;

  @ApiProperty({ description: 'Total revenue', example: '2500000.00' })
  @IsString()
  revenue: string;

  @ApiProperty({ description: 'Gross profit', example: '500000.00' })
  @IsString()
  grossProfit: string;

  @ApiProperty({ description: 'Gross margin percentage', example: '20.00' })
  @IsString()
  grossMarginPct: string;

  @ApiProperty({
    description: 'Last order date (YYYY-MM-DD)',
    example: '2026-11-09',
  })
  @IsDateString()
  lastOrderDate: string;
}

export class SupplierScorecardResponseDto {
  @ApiProperty({
    description: 'Supplier UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  supplierId: string;

  @ApiProperty({ description: 'Company name', example: 'Urban Traders Ltd' })
  @IsString()
  companyName: string;

  @ApiProperty({ description: 'Supplier code', example: 'UT-001' })
  @IsString()
  supplierCode: string;

  @ApiProperty({ description: 'Number of POs', example: 10 })
  @IsNumber()
  poCount: number;

  @ApiProperty({ description: 'Number of GRNs', example: 8 })
  @IsNumber()
  grnCount: number;

  @ApiProperty({ description: 'Fill rate (received/confirmed)', example: 0.85 })
  @IsNumber()
  fillRate: number;

  @ApiProperty({
    description: 'Average price variance percentage',
    example: 2.5,
  })
  @IsNumber()
  avgPriceVariancePct: number;

  @ApiProperty({
    description: 'Last receipt date (YYYY-MM-DD)',
    example: '2026-11-09',
  })
  @IsDateString()
  lastReceiptDate: string;
}

export class YieldTrendResponseDto {
  @ApiProperty({
    description: 'Site UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  siteId: string;

  @ApiProperty({
    description: 'Week start date (YYYY-MM-DD)',
    example: '2026-11-02',
  })
  @IsDateString()
  weekStart: string;

  @ApiProperty({ description: 'Total planned quantity', example: '10000.000' })
  @IsString()
  totalPlanned: string;

  @ApiProperty({ description: 'Total actual output', example: '9250.000' })
  @IsString()
  totalOutput: string;

  @ApiProperty({ description: 'Yield percentage', example: 92.5 })
  @IsNumber()
  yieldPct: number;

  @ApiProperty({ description: 'Total wastage', example: '750.000' })
  @IsString()
  totalWastage: string;

  @ApiProperty({ description: 'Wastage percentage', example: 8.11 })
  @IsNumber()
  wastagePct: number;
}

export class ARAgingResponseDto {
  @ApiProperty({
    description: 'Customer UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  customerId: string;

  @ApiProperty({ description: 'Business name', example: 'Customer with AR' })
  @IsString()
  businessName: string;

  @ApiProperty({ description: 'Customer code', example: 'AR-001' })
  @IsString()
  customerCode: string;

  @ApiProperty({ description: 'Total outstanding', example: '140000.00' })
  @IsString()
  totalOutstanding: string;

  @ApiProperty({ description: 'Aging 0-7 days', example: '40000.00' })
  @IsString()
  aging_0_7: string;

  @ApiProperty({ description: 'Aging 8-15 days', example: '100000.00' })
  @IsString()
  aging_8_15: string;

  @ApiProperty({ description: 'Aging 16-30 days', example: '0.00' })
  @IsString()
  aging_16_30: string;

  @ApiProperty({ description: 'Aging 30+ days', example: '0.00' })
  @IsString()
  aging_30_plus: string;
}

export class AnalyticsDateRangeDto {
  @ApiProperty({
    description: 'Start date (YYYY-MM-DD)',
    example: '2026-11-01',
  })
  @IsDateString()
  from: string;

  @ApiProperty({ description: 'End date (YYYY-MM-DD)', example: '2026-11-30' })
  @IsDateString()
  to: string;
}
