import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateHandoverDto {
  @ApiPropertyOptional({ description: 'Agent user UUID (defaults to logged-in user)' })
  @IsOptional()
  @IsUUID()
  handedByUserId?: string;

  @ApiPropertyOptional({ description: 'Receiving cashier/coordinator user UUID' })
  @IsOptional()
  @IsUUID()
  receivedByUserId?: string;

  @ApiPropertyOptional({ description: 'Handover notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class VerifyHandoverDto {
  @ApiProperty({ description: 'Counted physical cash amount', example: '10000.00' })
  @IsString()
  countedAmount: string;

  @ApiPropertyOptional({ description: 'Number of cheques physically received' })
  @IsOptional()
  @IsInt()
  @Min(0)
  chequeCount?: number;

  @ApiPropertyOptional({ description: 'Verification notes or comments' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({
    description: 'Dispute resolution action code',
    enum: ['ACCEPT_COUNTED', 'ADJUST_TO_EXPECTED', 'PARTIAL'],
  })
  @IsEnum(['ACCEPT_COUNTED', 'ADJUST_TO_EXPECTED', 'PARTIAL'])
  action: 'ACCEPT_COUNTED' | 'ADJUST_TO_EXPECTED' | 'PARTIAL';

  @ApiPropertyOptional({ description: 'Adjusted amount for PARTIAL resolution', example: '9900.00' })
  @IsOptional()
  @IsString()
  adjustedAmount?: string;

  @ApiProperty({ description: 'Mandatory resolution justification/notes' })
  @IsString()
  notes: string;
}

export class ListHandoversQueryDto {
  @ApiPropertyOptional({ description: 'Status filter (PENDING | VERIFIED | DISPUTED)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Collector/driver user UUID filter' })
  @IsOptional()
  @IsUUID()
  handedByUserId?: string;

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

