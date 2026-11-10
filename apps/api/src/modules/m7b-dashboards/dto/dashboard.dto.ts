import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsEnum,
} from 'class-validator';

/**
 * Dashboard DTOs — Response DTOs for M7b dashboard endpoints
 *
 * These DTOs define the shape of responses for Pulse Header, Status Matrix,
 * EOD Dashboard, and KPI queries.
 */

export enum DashboardRole {
  OWNER = 'OWNER',
  OPS_COORD = 'OPS_COORD',
}

export class PulseResponseDto {
  @ApiProperty({
    description: 'Site UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  siteId: string;

  @ApiProperty({
    description:
      "Today's sales in INR (confirmed + dispatched + delivered + invoiced)",
    example: '285000.00',
  })
  @IsString()
  todaysSales: string;

  @ApiProperty({
    description: 'Gross margin percentage (weighted average)',
    example: '22.45',
  })
  @IsString()
  grossMarginPct: string;

  @ApiProperty({
    description: 'Cash collected today from COD/cheque/online',
    example: '35000.00',
  })
  @IsString()
  cashCollectedToday: string;

  @ApiProperty({ description: 'Number of pending exceptions', example: 3 })
  @IsNumber()
  pendingExceptions: number;
}

export class StatusMatrixResponseDto {
  @ApiProperty({
    description: 'Site UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  siteId: string;

  @ApiProperty({
    description: 'Orders pending dispatch (CONFIRMED + ALLOCATED)',
    example: 2,
  })
  @IsNumber()
  ordersPendingDispatch: number;

  @ApiProperty({
    description: 'Factory batches running (SCHEDULED + IN_PROGRESS)',
    example: 1,
  })
  @IsNumber()
  batchesRunning: number;

  @ApiProperty({ description: 'Trucks on road (IN_TRANSIT)', example: 3 })
  @IsNumber()
  trucksOnRoad: number;

  @ApiProperty({ description: 'Supplier shortfalls OPEN', example: 1 })
  @IsNumber()
  supplierShortfalls: number;
}

export class WalletInfoDto {
  @ApiProperty({
    description: 'User UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'User name', example: 'Rajesh Kumar' })
  @IsString()
  userName: string;

  @ApiProperty({ description: 'Opening balance', example: '50000.00' })
  @IsString()
  openingBalance: string;

  @ApiProperty({ description: 'Collections received', example: '125000.00' })
  @IsString()
  collections: string;

  @ApiProperty({ description: 'Handovers given out', example: '80000.00' })
  @IsString()
  handoversOut: string;

  @ApiProperty({ description: 'Handovers received', example: '25000.00' })
  @IsString()
  handoversIn: string;

  @ApiProperty({ description: 'Closing balance', example: '120000.00' })
  @IsString()
  closingBalance: string;
}

export class HandoverInfoDto {
  @ApiProperty({
    description: 'Handover UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  handoverId: string;

  @ApiProperty({
    description: 'From user UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  fromUserId: string;

  @ApiProperty({
    description: 'To user UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  toUserId: string;

  @ApiProperty({ description: 'Handover amount', example: '50000.00' })
  @IsString()
  amount: string;

  @ApiProperty({
    description: 'Handover status',
    enum: ['PENDING', 'VERIFIED', 'DISPUTED'],
  })
  @IsEnum(['PENDING', 'VERIFIED', 'DISPUTED'])
  status: 'PENDING' | 'VERIFIED' | 'DISPUTED';

  @ApiProperty({
    description: 'Verification timestamp',
    required: false,
    example: '2026-11-09T15:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  verifiedAt?: string;
}

export class DepositSlipDto {
  @ApiProperty({ description: 'Total cash collected', example: '75000.00' })
  @IsString()
  totalCash: string;

  @ApiProperty({ description: 'Total cheque collected', example: '25000.00' })
  @IsString()
  totalCheque: string;

  @ApiProperty({ description: 'Total online collected', example: '50000.00' })
  @IsString()
  totalOnline: string;

  @ApiProperty({ description: 'Grand total', example: '150000.00' })
  @IsString()
  total: string;
}

export class EODViewResponseDto {
  @ApiProperty({
    description: 'Site UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  siteId: string;

  @ApiProperty({ description: 'EOD date (YYYY-MM-DD)', example: '2026-11-09' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Agent wallet summaries', type: [WalletInfoDto] })
  wallets: WalletInfoDto[];

  @ApiProperty({ description: 'Cash handovers', type: [HandoverInfoDto] })
  handovers: HandoverInfoDto[];

  @ApiProperty({ description: 'Deposit slip summary', type: DepositSlipDto })
  depositSlip: DepositSlipDto;

  @ApiProperty({ description: 'Whether EOD is signed off', example: true })
  signedOff: boolean;

  @ApiProperty({
    description: 'User who signed off',
    required: false,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  signedOffBy?: string;

  @ApiProperty({
    description: 'Sign-off timestamp',
    required: false,
    example: '2026-11-09T20:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  signedOffAt?: string;
}

export class KPIResponseDto {
  @ApiProperty({
    description: 'Site UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  siteId: string;

  @ApiProperty({ description: 'KPI date (YYYY-MM-DD)', example: '2026-11-09' })
  @IsDateString()
  date: string;

  @ApiProperty({
    description: 'Owner call volume (exceptions resolved per day)',
    example: 3,
  })
  @IsNumber()
  ownerCallVolume: number;

  @ApiProperty({
    description: 'EOD time in minutes (initiated to signed off)',
    example: 8,
  })
  @IsNumber()
  eodTimeMinutes: number;

  @ApiProperty({ description: 'Missed entries percentage', example: '0.00' })
  @IsString()
  missedEntriesPct: string;

  @ApiProperty({
    description: 'Margin erosion visibility percentage',
    example: '100.00',
  })
  @IsString()
  marginErosionVisibilityPct: string;

  @ApiProperty({ description: 'ePOD visibility percentage', example: '100.00' })
  @IsString()
  epodVisibilityPct: string;

  @ApiProperty({
    description: 'Routine order confirmation time in minutes',
    example: 1,
  })
  @IsNumber()
  routineOrderConfirmationMinutes: number;
}

export class DashboardQueryDto {
  @ApiProperty({
    description: 'Role for permission filtering',
    enum: DashboardRole,
    required: false,
  })
  @IsOptional()
  @IsEnum(DashboardRole)
  role?: DashboardRole;
}

export class EODQueryDto extends DashboardQueryDto {
  @ApiProperty({ description: 'EOD date (YYYY-MM-DD)', example: '2026-11-09' })
  @IsDateString()
  date: string;
}

export class KPIQueryDto extends DashboardQueryDto {
  @ApiProperty({ description: 'KPI date (YYYY-MM-DD)', example: '2026-11-09' })
  @IsDateString()
  date: string;
}
