import {
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerTallyExportDto {
  @ApiPropertyOptional({ description: 'Optional site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class ListTallyBatchesQueryDto {
  @ApiPropertyOptional({ description: 'Site UUID filter' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

