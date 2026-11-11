import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePtpDto {
  @ApiProperty({ description: 'Customer UUID' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ description: 'Specific invoice UUID if promised against single invoice' })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiProperty({ description: 'Promised payment date (YYYY-MM-DD)' })
  @IsDateString()
  promisedDate: string;

  @ApiProperty({ description: 'Reason code for non-payment (e.g. OWNER_ABSENT, SHORT_FUNDS)' })
  @IsString()
  reasonCode: string;

  @ApiPropertyOptional({ description: 'Additional collector notes' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePtpDto {
  @ApiProperty({
    description: 'Updated PTP status',
    enum: ['KEPT', 'BROKEN'],
  })
  @IsEnum(['KEPT', 'BROKEN'])
  status: 'KEPT' | 'BROKEN';

  @ApiPropertyOptional({ description: 'Resolution or follow-up note' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ListPtpQueryDto {
  @ApiPropertyOptional({ description: 'Customer UUID filter' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Status filter (OPEN | KEPT | BROKEN)' })
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
}

