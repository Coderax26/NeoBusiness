import {
  IsUUID,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillStatus } from '../enums/bill-status.enum.js';

export class SupplierBillItemDto {
  @ApiProperty({ description: 'Item UUID' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ description: 'Inventory batch UUID' })
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Item name' })
  @IsOptional()
  @IsString()
  itemName?: string;

  @ApiProperty({ description: 'Invoiced quantity string', example: '100.000' })
  @IsString()
  quantity: string;

  @ApiProperty({ description: 'Rate per unit before tax', example: '100.00' })
  @IsString()
  ratePerUnit: string;

  @ApiPropertyOptional({ description: 'Line tax amount', example: '500.00' })
  @IsOptional()
  @IsString()
  taxAmount?: string;

  @ApiPropertyOptional({ description: 'Line total', example: '10500.00' })
  @IsOptional()
  @IsString()
  lineTotal?: string;

  @ApiPropertyOptional({ description: 'Tax rate percentage', example: '5.00' })
  @IsOptional()
  @IsString()
  taxRate?: string;

  @ApiPropertyOptional({
    description: 'Tax treatment',
    enum: ['TAXABLE', 'EXEMPT', 'NIL_RATED'],
    default: 'TAXABLE',
  })
  @IsOptional()
  @IsString()
  taxTreatment?: string;
}

export class CreateSupplierBillDto {
  @ApiProperty({ description: 'Supplier UUID' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ description: 'Purchase order UUID' })
  @IsUUID()
  poId: string;

  @ApiPropertyOptional({ description: 'Receiving site UUID' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Bill date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  billDate?: string;

  @ApiPropertyOptional({ description: 'Payment credit days', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  dueDays?: number;

  @ApiProperty({ description: 'Bill line items', type: [SupplierBillItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBillItemDto)
  items: SupplierBillItemDto[];
}

export class ApproveSupplierBillDto {
  @ApiPropertyOptional({ description: 'Approval remarks or reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectSupplierBillDto {
  @ApiPropertyOptional({ description: 'Rejection reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListSupplierBillsQueryDto {
  @ApiPropertyOptional({ description: 'Supplier UUID filter' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Purchase Order UUID filter' })
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiPropertyOptional({
    description: 'Bill status filter',
    enum: BillStatus,
  })
  @IsOptional()
  @IsEnum(BillStatus)
  status?: BillStatus;
}
