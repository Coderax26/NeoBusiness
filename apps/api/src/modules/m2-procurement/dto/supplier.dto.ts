import { IsString, IsNumber, IsOptional, IsUUID, IsEnum, IsDate, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Acme Foods Ltd' })
  @IsString()
  companyName: string;

  @ApiProperty({ example: '+91-9876543210' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  whatsappNo?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;

  @ApiPropertyOptional({ example: '27AAAAA0000A1Z5' })
  @IsOptional()
  @IsString()
  gstin?: string;

  @ApiPropertyOptional({ example: 85.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  reliabilityScorePct?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDaysAvg?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  isApproved?: boolean;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'Acme Foods Pvt Ltd' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: '+91-9876543211' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '+91-9876543211' })
  @IsOptional()
  @IsString()
  whatsappNo?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;

  @ApiPropertyOptional({ example: '27AAAAA0000A1Z5' })
  @IsOptional()
  @IsString()
  gstin?: string;

  @ApiPropertyOptional({ example: 90.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  reliabilityScorePct?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDaysAvg?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isApproved?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;
}

export class LinkSupplierItemDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: '25.000' })
  @IsOptional()
  @IsString()
  packSize?: string;

  @ApiPropertyOptional({ example: '10.000' })
  @IsOptional()
  @IsString()
  minOrderQty?: string;
}

export class AddRateQuoteDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '45.50' })
  @IsString()
  quotedPrice: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  validUntil?: Date;

  @ApiProperty({ enum: ['CALL', 'WHATSAPP', 'PO'], example: 'CALL' })
  @IsEnum(['CALL', 'WHATSAPP', 'PO'])
  source: 'CALL' | 'WHATSAPP' | 'PO';
}