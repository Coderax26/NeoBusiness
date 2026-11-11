import { DateTime } from 'luxon';

/**
 * Clock utility — all timestamp operations must go through this class.
 *
 * Rules:
 * - Timestamps are STORED in UTC (timestamptz in PostgreSQL)
 * - Timestamps are DISPLAYED in Asia/Kolkata (IST, UTC+5:30)
 * - Device timestamps from field apps are stored as captured_at (device) alongside received_at (server)
 * - A skew > 5 minutes between device and server time is flagged for audit
 */
export class Clock {
  static readonly APP_TZ = 'Asia/Kolkata';
  static readonly MAX_SKEW_MINUTES = 5;

  /** Current UTC timestamp as a JavaScript Date */
  static nowUtc(): Date {
    return new Date();
  }

  /** Current UTC timestamp as an ISO 8601 string */
  static nowIso(): string {
    return new Date().toISOString();
  }

  /** Current UTC timestamp as a Luxon DateTime */
  static now(): DateTime {
    return DateTime.utc();
  }

  /** Convert a UTC Date to the application timezone for display */
  static toKolkata(date: Date | string): DateTime {
    const dt =
      typeof date === 'string'
        ? DateTime.fromISO(date, { zone: 'utc' })
        : DateTime.fromJSDate(date, { zone: 'utc' });
    return dt.setZone(Clock.APP_TZ);
  }

  /**
   * Check if the device-reported timestamp deviates from server time by more than MAX_SKEW_MINUTES.
   * Returns true if the skew is acceptable, false if it should be flagged.
   */
  static isTimestampAcceptable(deviceTimestamp: Date | string): boolean {
    const device =
      typeof deviceTimestamp === 'string'
        ? new Date(deviceTimestamp).getTime()
        : deviceTimestamp.getTime();
    const server = Date.now();
    const skewMs = Math.abs(server - device);
    return skewMs <= Clock.MAX_SKEW_MINUTES * 60 * 1000;
  }

  /**
   * Get the skew in minutes between device and server time.
   * Positive = device is ahead; negative = device is behind.
   */
  static skewMinutes(deviceTimestamp: Date | string): number {
    const device =
      typeof deviceTimestamp === 'string'
        ? new Date(deviceTimestamp).getTime()
        : deviceTimestamp.getTime();
    return (device - Date.now()) / 60000;
  }

  /**
   * Parse a date in the application timezone and return it as UTC.
   * Used when the owner sets a price for "today" (which means today in IST).
   */
  static parseKolkataDate(dateStr: string): DateTime {
    return DateTime.fromISO(dateStr, { zone: Clock.APP_TZ }).toUTC();
  }

  /**
   * Get the current date in the application timezone (YYYY-MM-DD).
   * Used for "today's price list" queries.
   */
  static todayKolkata(): string {
    return DateTime.now().setZone(Clock.APP_TZ).toISODate()!;
  }

  /**
   * Add hours to a date, returns a new Date in UTC.
   */
  static addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 3600000);
  }

  /**
   * Format a date for display in IST.
   */
  static format(date: Date | string, format = 'dd MMM yyyy, hh:mm a'): string {
    return Clock.toKolkata(date).toFormat(format);
  }
}
