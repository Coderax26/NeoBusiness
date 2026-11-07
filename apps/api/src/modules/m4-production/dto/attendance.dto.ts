import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export enum AttendanceShift {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  NIGHT = 'NIGHT',
  GENERAL = 'GENERAL',
}

export class CreateAttendanceDto {
  @IsUUID()
  siteId: string;

  @IsUUID()
  workerId: string;

  @IsOptional()
  @IsUUID()
  workOrderId?: string;

  @IsDateString()
  date: string;

  @IsEnum(AttendanceShift)
  shift: AttendanceShift;

  @IsNumber()
  @Min(0)
  @Max(24)
  hoursWorked: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  overtimeHours?: number = 0;
}

export class AttendanceResponseDto {
  id: string;
  siteId: string;
  workerId: string;
  workerName: string;
  workOrderId: string | null;
  workOrderNo: string | null;
  date: string;
  shift: AttendanceShift;
  hoursWorked: number;
  overtimeHours: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
