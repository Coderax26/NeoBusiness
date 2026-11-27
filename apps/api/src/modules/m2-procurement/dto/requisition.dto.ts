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

export class CreateRequisitionDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '500.000' })
  @IsString()
  qty: string;

  @ApiProperty({ example: '2026-12-15' })
  @IsDate()
  @Type(() => Date)
  neededBy: Date;

  @ApiProperty({
    enum: ['PRODUCTION', 'SALES_ORDER', 'MANUAL'],
    example: 'PRODUCTION',
  })
  @IsEnum(['PRODUCTION', 'SALES_ORDER', 'MANUAL'])
  source: 'PRODUCTION' | 'SALES_ORDER' | 'MANUAL';

  @ApiPropertyOptional({ example: 'production-requisition-uuid' })
  @IsOptional()
  @IsUUID()
  sourceRefId?: string;
}

export class ConvertToPODto {
  @ApiProperty({ example: 'supplier-uuid' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ type: [String], example: ['req-uuid-1', 'req-uuid-2'] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  requisitionIds: string[];
}
