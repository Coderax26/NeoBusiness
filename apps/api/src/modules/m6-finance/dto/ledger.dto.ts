import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerLedgerQueryDto {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ArAgingQueryDto {
  @ApiPropertyOptional({ description: 'Site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'As-of date for aging buckets (defaults to today)' })
  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}

export class UpdateWorklistOutcomeDto {
  @ApiProperty({
    description: 'Outcome status',
    example: 'PAID',
    enum: ['DISPUTED', 'PAID', 'PTP', 'DECLINED', 'NOT_AT_HOME'],
  })
  @IsEnum(['DISPUTED', 'PAID', 'PTP', 'DECLINED', 'NOT_AT_HOME'])
  outcome: 'DISPUTED' | 'PAID' | 'PTP' | 'DECLINED' | 'NOT_AT_HOME';

  @ApiPropertyOptional({ description: 'Follow-up notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

