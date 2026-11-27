import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Suresh Patil' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: '+919822000099' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({
    example: 'OPS_COORD',
    enum: ['OWNER', 'OPS_COORD', 'PROD_MGR', 'DRIVER', 'COLLECTOR', 'STOREKEEPER'],
  })
  @IsIn(['OWNER', 'OPS_COORD', 'PROD_MGR', 'DRIVER', 'COLLECTOR', 'STOREKEEPER'])
  role!: string;

  @ApiPropertyOptional({ example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsString()
  assignedSiteId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  siteIds?: string[];

  @ApiPropertyOptional({ example: '1234' })
  @IsOptional()
  @IsString()
  pin?: string;

  @ApiPropertyOptional({ example: 'Password@123' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: 'mr', enum: ['en', 'mr'] })
  @IsOptional()
  @IsString()
  preferredLanguage?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Suresh R. Patil' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    enum: ['OWNER', 'OPS_COORD', 'PROD_MGR', 'DRIVER', 'COLLECTOR', 'STOREKEEPER'],
  })
  @IsOptional()
  @IsIn(['OWNER', 'OPS_COORD', 'PROD_MGR', 'DRIVER', 'COLLECTOR', 'STOREKEEPER'])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedSiteId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  siteIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  preferredLanguage?: string;
}

export class ResetPinDto {
  @ApiProperty({ example: '5678' })
  @IsString()
  @IsNotEmpty()
  pin!: string;
}

export class CreateSiteDto {
  @ApiProperty({ example: 'Pune Central Hub' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'WAREHOUSE', enum: ['FACTORY', 'WAREHOUSE', 'OFFICE'] })
  @IsIn(['FACTORY', 'WAREHOUSE', 'OFFICE'])
  siteType!: string;

  @ApiPropertyOptional({ example: 'Plot 42, Hadapsar Industrial Estate, Pune' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateSiteDto {
  @ApiPropertyOptional({ example: 'Pune Central Cold Storage' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['FACTORY', 'WAREHOUSE', 'OFFICE'] })
  @IsOptional()
  @IsIn(['FACTORY', 'WAREHOUSE', 'OFFICE'])
  siteType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateLocationDto {
  @ApiProperty({ example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsString()
  @IsNotEmpty()
  siteId!: string;

  @ApiProperty({ example: 'Cold Room A' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'RAW_MATERIAL_STORE',
    enum: [
      'RAW_MATERIAL_STORE',
      'FINISHED_GOODS_STORE',
      'TRADING_WAREHOUSE',
      'VEHICLE',
      'QUARANTINE',
      'OFFICE',
    ],
  })
  @IsIn([
    'RAW_MATERIAL_STORE',
    'FINISHED_GOODS_STORE',
    'TRADING_WAREHOUSE',
    'VEHICLE',
    'QUARANTINE',
    'OFFICE',
  ])
  locationType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleId?: string;
}

export class UpdateBusinessRuleDto {
  @ApiProperty({ example: { value: 0.12 } })
  valueJson!: any;

  @ApiPropertyOptional({ example: 'Updated min margin to 12%' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateApprovalPolicyDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  canDelegate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  delegateUserId?: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  delegateValueCapInr?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  @Min(5)
  escalationWaitMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondEscalationUserId?: string;
}

