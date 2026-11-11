import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpeningBalanceRowDto {
  @ApiProperty({
    description: 'Sub-ledger entity type',
    enum: ['CUSTOMER', 'SUPPLIER'],
  })
  @IsEnum(['CUSTOMER', 'SUPPLIER'])
  entityType: 'CUSTOMER' | 'SUPPLIER';

  @ApiProperty({ description: 'Customer or Supplier UUID' })
  @IsUUID()
  partyId: string;

  @ApiProperty({ description: 'Opening balance amount (positive)', example: '25000.00' })
  @IsString()
  amount: string;

  @ApiPropertyOptional({ description: 'Cut-off date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Reference/Note' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class OpeningBalanceDraftDto {
  @ApiProperty({ description: 'Array of opening balance rows', type: [OpeningBalanceRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceRowDto)
  rows: OpeningBalanceRowDto[];
}

export class OpeningBalanceImportDto {
  @ApiProperty({ description: 'Array of validated opening balance rows', type: [OpeningBalanceRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceRowDto)
  rows: OpeningBalanceRowDto[];

  @ApiPropertyOptional({ description: 'Site UUID (defaults to user site)' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class OpeningBalanceReverseDto {
  @ApiProperty({ description: 'Customer or Supplier UUID' })
  @IsUUID()
  partyId: string;

  @ApiProperty({
    description: 'Entity type',
    enum: ['CUSTOMER', 'SUPPLIER'],
  })
  @IsEnum(['CUSTOMER', 'SUPPLIER'])
  entityType: 'CUSTOMER' | 'SUPPLIER';

  @ApiProperty({ description: 'Justification for reversing opening balance' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Site UUID' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

