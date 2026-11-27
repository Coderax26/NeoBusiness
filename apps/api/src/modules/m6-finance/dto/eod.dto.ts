import {
  IsOptional,
  IsString,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateEodDto {
  @ApiPropertyOptional({ description: 'Closing date (YYYY-MM-DD, defaults to today)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Site UUID (defaults to user site)' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class SignOffEodDto {
  @ApiPropertyOptional({ description: 'Optional sign-off notes or verification remarks' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Optional owner verification password' })
  @IsOptional()
  @IsString()
  password?: string;
}

