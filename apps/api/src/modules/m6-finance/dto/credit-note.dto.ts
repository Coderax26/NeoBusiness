import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreditNoteLineDto {
  @ApiProperty({ description: 'Item UUID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Quantity credited', example: '5.000' })
  @IsString()
  qty: string;

  @ApiProperty({ description: 'Unit price before tax', example: '120.00' })
  @IsString()
  unitPrice: string;

  @ApiPropertyOptional({ description: 'Line-level reason code' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateCreditNoteDto {
  @ApiProperty({ description: 'Sales order UUID' })
  @IsUUID()
  orderId: string;

  @ApiProperty({
    description: 'Credit note reason',
    enum: ['RETURN', 'DAMAGE', 'REBATE', 'WRITEOFF'],
  })
  @IsEnum(['RETURN', 'DAMAGE', 'REBATE', 'WRITEOFF'])
  reason: 'RETURN' | 'DAMAGE' | 'REBATE' | 'WRITEOFF';

  @ApiPropertyOptional({ description: 'Optional explanation notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Credit note line items', type: [CreditNoteLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteLineDto)
  lines: CreditNoteLineDto[];
}

export class RejectCreditNoteDto {
  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  reason: string;
}

export class CancelCreditNoteDto {
  @ApiProperty({ description: 'Cancellation reason' })
  @IsString()
  reason: string;
}

export class ListCreditNotesQueryDto {
  @ApiPropertyOptional({ description: 'Customer UUID filter' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Status filter (DRAFT | APPROVED | APPLIED | REJECTED | CANCELLED)' })
  @IsOptional()
  @IsString()
  status?: string;
}

