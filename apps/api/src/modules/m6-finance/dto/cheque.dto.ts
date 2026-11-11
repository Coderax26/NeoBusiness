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

export class DepositChequeDto {
  @ApiPropertyOptional({ description: 'Bank deposit slip number' })
  @IsOptional()
  @IsString()
  depositSlipNo?: string;

  @ApiPropertyOptional({ description: 'Deposit date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  depositDate?: string;
}

export class ClearChequeDto {
  @ApiPropertyOptional({ description: 'Clearance date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  clearanceDate?: string;
}

export class BounceChequeDto {
  @ApiProperty({ description: 'Reason for cheque bounce (e.g. INSUFFICIENT_FUNDS)' })
  @IsString()
  bounceReason: string;
}

export class ReturnChequeDto {
  @ApiProperty({ description: 'Reason for returning cheque to customer' })
  @IsString()
  reason: string;
}

export class ListChequesQueryDto {
  @ApiPropertyOptional({ description: 'Cheque status filter (RECEIVED | DEPOSITED | CLEARED | BOUNCED | RETURNED)' })
  @IsOptional()
  @IsString()
  status?: string;

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

