import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new customer.
 * Only OWNER can set credit_limit and credit_days; OPS_COORD gets defaults.
 */
export class CreateCustomerDto {
  @IsString()
  customerCode: string; // e.g. "CUST-001"

  @IsString()
  businessName: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  whatsappNo?: string;

  @IsString()
  billingAddress: string;

  @IsOptional()
  @IsUUID()
  defaultSiteId?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsString()
  stateCode: string; // GST state code

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditLimit?: number; // default 100000

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  creditDays?: number; // default 15

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxOverdueDays?: number; // default 15

  @IsOptional()
  @IsString()
  preferredDeliveryWindow?: string; // e.g. "14:00-16:00"

  @IsOptional()
  @IsString()
  priceTier?: string; // default 'STANDARD'

  @IsOptional()
  @IsBoolean()
  isActive?: boolean; // default true

  @IsOptional()
  @IsUrl()
  gpsLatLng?: string; // JSON string of {lat, lng}
}

/**
 * DTO for updating customer credit/profile (OWNER only for credit fields).
 */
export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsappNo?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsUUID()
  defaultSiteId?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

  // Credit fields - OWNER only
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  creditDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxOverdueDays?: number;

  @IsOptional()
  @IsBoolean()
  creditHold?: boolean;

  @IsOptional()
  @IsString()
  preferredDeliveryWindow?: string;

  @IsOptional()
  @IsString()
  priceTier?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUrl()
  gpsLatLng?: string;
}

/**
 * DTO for credit override (OWNER only).
 */
export class CreditOverrideDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditLimit: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  creditDays: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxOverdueDays?: number;

  @IsOptional()
  @IsBoolean()
  creditHold?: boolean;
}

/**
 * DTO for creating a customer contact.
 */
export class CreateCustomerContactDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsEnum([
    'ACCOUNT_MANAGER',
    'TAX_OFFICER',
    'PURCHASING',
    'PROCUREMENT',
    'FINANCE',
    'OTHER',
  ])
  role: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/**
 * DTO for communication log entry.
 */
export class CreateCommunicationLogDto {
  @IsEnum(['CALL', 'WHATSAPP', 'VISIT'])
  channel: string;

  @IsString()
  note: string;
}
