import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Clock } from './clock.util';

describe('Clock utility', () => {
  describe('todayKolkata()', () => {
    it('returns a valid YYYY-MM-DD date string', () => {
      const today = Clock.todayKolkata();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('nowIso()', () => {
    it('returns a valid ISO 8601 UTC timestamp', () => {
      const ts = Clock.nowIso();
      expect(() => new Date(ts)).not.toThrow();
      expect(ts).toContain('T');
      expect(ts).toContain('Z');
    });
  });

  describe('toKolkata()', () => {
    it('converts UTC timestamp to IST (+5:30 offset)', () => {
      // UTC 00:00 = IST 05:30
      const kolkata = Clock.toKolkata('2026-10-21T00:00:00Z');
      expect(kolkata.hour).toBe(5);
      expect(kolkata.minute).toBe(30);
      expect(kolkata.zoneName).toBe('Asia/Kolkata');
    });
  });

  describe('isTimestampAcceptable()', () => {
    beforeEach(() => {
      // Fix server "now" to 12:00:00 UTC
      vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-21T12:00:00Z').getTime());
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('accepts a timestamp within 5 minutes', () => {
      const deviceTs = new Date('2026-10-21T12:04:00Z');
      expect(Clock.isTimestampAcceptable(deviceTs)).toBe(true);
    });

    it('accepts a timestamp exactly at 5 minutes', () => {
      const deviceTs = new Date('2026-10-21T12:05:00Z');
      expect(Clock.isTimestampAcceptable(deviceTs)).toBe(true);
    });

    it('rejects a timestamp more than 5 minutes ahead', () => {
      const deviceTs = new Date('2026-10-21T12:06:00Z');
      expect(Clock.isTimestampAcceptable(deviceTs)).toBe(false);
    });

    it('rejects a timestamp more than 5 minutes behind', () => {
      const deviceTs = new Date('2026-10-21T11:54:00Z');
      expect(Clock.isTimestampAcceptable(deviceTs)).toBe(false);
    });
  });

  describe('skewMinutes()', () => {
    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-21T12:00:00Z').getTime());
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns positive skew when device is ahead of server', () => {
      const skew = Clock.skewMinutes(new Date('2026-10-21T12:03:00Z'));
      expect(skew).toBeCloseTo(3, 1);
    });

    it('returns negative skew when device is behind server', () => {
      const skew = Clock.skewMinutes(new Date('2026-10-21T11:57:00Z'));
      expect(skew).toBeCloseTo(-3, 1);
    });
  });

  describe('addHours()', () => {
    it('correctly adds hours to a date', () => {
      const base = new Date('2026-10-21T08:00:00Z');
      const result = Clock.addHours(base, 3);
      expect(result.toISOString()).toBe('2026-10-21T11:00:00.000Z');
    });
  });
});
