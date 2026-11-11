import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDate,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBackupPODto {
  @ApiProperty({ example: 'shortfall-uuid' })
  @IsUUID()
  shortfallId: string;

  @ApiProperty({ example: 'backup-supplier-uuid' })
  @IsUUID()
  backupSupplierId: string;
}

export class UpdateShortfallStatusDto {
  @ApiProperty({
    enum: ['OPEN', 'COVERED_BY_BACKUP', 'ALLOCATED', 'WRITTEN_OFF'],
    example: 'COVERED_BY_BACKUP',
  })
  @IsEnum(['OPEN', 'COVERED_BY_BACKUP', 'ALLOCATED', 'WRITTEN_OFF'])
  status: 'OPEN' | 'COVERED_BY_BACKUP' | 'ALLOCATED' | 'WRITTEN_OFF';
}
