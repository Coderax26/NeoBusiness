import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new sales order.
 */
export class CreateOrderDto {
  @IsUUID()
  customerId: string;

  @IsUUID()
  fulfillmentSiteId: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  deliveryTimeWindow?: string;

  @IsOptional()
  @IsBoolean()
  autoSubmit?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines: OrderLineDto[];
}

/**
 * DTO for an order line.
 */
export class OrderLineDto {
  @IsUUID()
  itemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  qty: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  requestedPrice: number;
}

/**
 * DTO for confirming an order (in-band confirmation).
 */
export class ConfirmOrderDto {
  @IsOptional()
  @IsString()
  remarks?: string;
}

/**
 * DTO for requesting a price override.
 */
export class RequestOverrideDto {
  @IsString()
  reason: string;
}

/**
 * DTO for accepting a counter price.
 */
export class AcceptCounterDto {
  @IsOptional()
  @IsString()
  remarks?: string;
}

/**
 * DTO for cancelling an order.
 */
export class CancelOrderDto {
  @IsString()
  reason: string;
}
