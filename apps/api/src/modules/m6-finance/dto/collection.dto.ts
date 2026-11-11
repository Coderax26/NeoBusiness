import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsObject,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceiptAllocationDto {
  @ApiProperty({ description: 'Invoice UUID to allocate to' })
  @IsUUID()
  invoiceId: string;

  @ApiProperty({ description: 'Amount to allocate to this invoice', example: '500.00' })
  @IsString()
  amount: string;
}

export class ChequeDetailsDto {
  @ApiProperty({ description: 'Cheque number' })
  @IsString()
  chequeNo: string;

  @ApiProperty({ description: 'Bank name' })
  @IsString()
  bank: string;

  @ApiProperty({ description: 'Cheque date (YYYY-MM-DD)' })
  @IsDateString()
  chequeDate: Date;
}

export class GpsLatLngDto {
  @ApiProperty({ description: 'Latitude' })
  lat: number;

  @ApiProperty({ description: 'Longitude' })
  lng: number;
}

export class LogCollectionDto {
  @ApiProperty({ description: 'Customer UUID' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ description: 'Site UUID (defaults to user site)' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ description: 'Collected amount', example: '10000.00' })
  @IsString()
  amount: string;

  @ApiPropertyOptional({ description: 'On-account excess amount', example: '0.00' })
  @IsOptional()
  @IsString()
  onAccountAmount?: string;

  @ApiProperty({
    description: 'Payment instrument mode',
    enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'],
  })
  @IsEnum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'])
  paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';

  @ApiPropertyOptional({ description: 'Reference UTR or bank transaction reference' })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiProperty({ description: 'Client-generated idempotency key' })
  @IsString()
  idempotencyKey: string;

  @ApiPropertyOptional({ description: 'Mobile device UUID/identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Capture GPS location' })
  @IsOptional()
  @IsObject()
  gpsLatLng?: GpsLatLngDto;

  @ApiPropertyOptional({ description: 'Cheque instrument details (required if mode is CHEQUE)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChequeDetailsDto)
  chequeDetails?: ChequeDetailsDto;

  @ApiPropertyOptional({
    description: 'Manual invoice allocations (FIFO applies if omitted)',
    type: [ReceiptAllocationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  allocations?: ReceiptAllocationDto[];
}

export class AllocateReceiptDto {
  @ApiProperty({ description: 'Receipt UUID to allocate' })
  @IsUUID()
  receiptId: string;

  @ApiProperty({ description: 'Allocations array', type: [ReceiptAllocationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  allocations: ReceiptAllocationDto[];
}

export class ListCollectionsQueryDto {
  @ApiPropertyOptional({ description: 'Site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Customer UUID filter' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Payment mode filter' })
  @IsOptional()
  @IsEnum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'])
  paymentMode?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';

  @ApiPropertyOptional({ description: 'Start date filter (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'End date filter (YYYY-MM-DD)' })
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

