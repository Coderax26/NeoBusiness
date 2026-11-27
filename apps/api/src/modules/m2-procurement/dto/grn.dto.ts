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
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGRNLineDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '95.000' })
  @IsString()
  receivedQty: string;

  @ApiPropertyOptional({ example: '10.000' })
  @IsOptional()
  @IsString()
  receivedQtySecondary?: string;

  @ApiPropertyOptional({ example: 'BATCH-001' })
  @IsOptional()
  @IsString()
  batchLotNo?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  mfgDate?: Date;

  @ApiPropertyOptional({ example: '2027-11-01' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiryDate?: Date;

  @ApiPropertyOptional({ example: 'Good condition' })
  @IsOptional()
  @IsString()
  conditionNote?: string;
}

export class CreateGRNDto {
  @ApiPropertyOptional({ example: 'po-uuid' })
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiPropertyOptional({ example: 'site-uuid' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ example: 'location-uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ example: 'user-uuid' })
  @IsOptional()
  @IsUUID()
  receivedBy?: string;

  @ApiProperty({ type: [CreateGRNLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGRNLineDto)
  lines: CreateGRNLineDto[];

  @ApiPropertyOptional({ example: 12.9716 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLat?: number;

  @ApiPropertyOptional({ example: 77.5946 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLng?: number;
}

export class BlindReceiveLineDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '95.000' })
  @IsString()
  receivedQty: string;

  @ApiPropertyOptional({ example: '10.000' })
  @IsOptional()
  @IsString()
  receivedQtySecondary?: string;

  @ApiPropertyOptional({ example: 'BATCH-001' })
  @IsOptional()
  @IsString()
  batchLotNo?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  mfgDate?: Date;

  @ApiPropertyOptional({ example: '2027-11-01' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiryDate?: Date;

  @ApiPropertyOptional({ example: 'Good condition' })
  @IsOptional()
  @IsString()
  conditionNote?: string;
}
