import {
  IsUUID,
  IsOptional,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListPendingCodQueryDto {
  @ApiPropertyOptional({ description: 'Site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class SettleCodStopDto {
  @ApiPropertyOptional({ description: 'Optional site UUID override' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

