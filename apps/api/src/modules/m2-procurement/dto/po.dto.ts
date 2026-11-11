import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDate,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePOLineDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '100.000' })
  @IsString()
  orderedQty: string;

  @ApiProperty({ example: '45.50' })
  @IsString()
  unitPrice: string;
}

export class CreatePODto {
  @ApiProperty({ example: 'supplier-uuid' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ example: 'site-uuid' })
  @IsUUID()
  receivingSiteId: string;

  @ApiProperty({ type: [CreatePOLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePOLineDto)
  lines: CreatePOLineDto[];

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expectedDelivery?: Date;

  @ApiPropertyOptional({ example: 'sales-order-uuid' })
  @IsOptional()
  @IsUUID()
  linkedSalesOrderId?: string;
}

export class ConfirmPOLineDto {
  @ApiProperty({ example: 'po-line-uuid' })
  @IsUUID()
  lineId: string;

  @ApiProperty({ example: '100.000' })
  @IsString()
  confirmedQty: string;

  @ApiProperty({ example: '46.00' })
  @IsString()
  unitPrice: string;
}

export class ConfirmQuantitiesDto {
  @ApiProperty({ type: [ConfirmPOLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmPOLineDto)
  confirmations: ConfirmPOLineDto[];
}
