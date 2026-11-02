import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateVehicleDto {
  @IsUUID()
  siteId!: string;

  @IsString()
  @IsNotEmpty()
  registrationNo!: string;

  @IsString()
  @IsNotEmpty()
  vehicleType!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  capacityKg!: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacityCrates?: number;
}

export class CreateTripStopLineDto {
  @IsUUID()
  itemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  loadedQty!: number;

  @IsUUID()
  @IsOptional()
  batchId?: string;
}

export class CreateTripStopDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  @IsOptional()
  salesOrderId?: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  sequenceNo!: number;

  @IsBoolean()
  @IsOptional()
  isCod?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  codAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripStopLineDto)
  lines!: CreateTripStopLineDto[];
}

export class CreateTripDto {
  @IsUUID()
  siteId!: string;

  @IsISO8601()
  tripDate!: string;

  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  driverId!: string;

  @IsUUID()
  @IsOptional()
  originSiteId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  plannedDistanceKm?: number;

  @IsString()
  @IsOptional()
  routePolyline?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripStopDto)
  stops!: CreateTripStopDto[];
}

export class DispatchTripDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchLineDto)
  lines!: DispatchLineDto[];
}

export class DispatchLineDto {
  @IsUUID()
  stopId!: string;

  @IsUUID()
  itemId!: string;

  @IsUUID()
  batchId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  qty!: number;
}

export class DeliverStopLineDto {
  @IsUUID()
  itemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveredQty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  returnedQty!: number;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsBoolean()
  @IsOptional()
  damaged?: boolean;

  @IsString()
  @IsOptional()
  returnReason?: string;
}

export class DeliverStopDto {
  @IsEnum(['SIGNATURE', 'PHOTO', 'OTP'])
  epodMethod!: 'SIGNATURE' | 'PHOTO' | 'OTP';

  @IsString()
  @IsOptional()
  epodSignatureUrl?: string;

  @IsString()
  @IsOptional()
  epodPhotoUrl?: string;

  @IsBoolean()
  @IsOptional()
  epodOtpVerified?: boolean;

  @IsString()
  capturedAt!: string;

  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  gpsLat!: number;

  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  gpsLng!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliverStopLineDto)
  lines!: DeliverStopLineDto[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  codCollectedAmount?: number;
}

export class FailStopDto {
  @IsString()
  @IsNotEmpty()
  reasonCode!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateIssueDto {
  @IsEnum([
    'BREAKDOWN',
    'ROAD_CLOSURE',
    'CUSTOMER_PARTIAL_REJECTION',
    'CUSTOMER_FULL_REJECTION',
    'OTHER',
  ])
  category!: string;

  @IsUUID()
  @IsOptional()
  stopId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  rejectedQty?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  valueAtRisk?: number;

  @IsUUID()
  @IsOptional()
  photoAttachmentId?: string;
}

export class ResolveIssueDto {
  @IsString()
  @IsNotEmpty()
  resolutionNote!: string;

  @IsBoolean()
  @IsOptional()
  escalate?: boolean;
}

export class CreateExpenseDto {
  @IsEnum(['FUEL', 'TOLL', 'OTHER'])
  type!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsUUID()
  @IsOptional()
  receiptAttachmentId?: string;
}
