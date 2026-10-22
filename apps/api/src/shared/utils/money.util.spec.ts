import { describe, it, expect } from 'vitest';
import { Money } from './money.util';

describe('Money utility', () => {
  describe('basic arithmetic', () => {
    it('adds two money values correctly', () => {
      const a = Money.of(100.50);
      const b = Money.of(200.75);
      expect(a.add(b).toStorageString()).toBe('301.25');
    });

    it('subtracts money values correctly', () => {
      const a = Money.of(500);
      const b = Money.of(123.45);
      expect(a.sub(b).toStorageString()).toBe('376.55');
    });

    it('multiplies by a factor correctly', () => {
      const price = Money.of(92);
      const qty = 500;
      expect(price.mul(qty).toStorageString()).toBe('46000.00');
    });

    it('divides correctly', () => {
      const total = Money.of(100);
      expect(total.div(4).toStorageString()).toBe('25.00');
    });

    it('throws on division by zero', () => {
      expect(() => Money.of(100).div(0)).toThrow('division by zero');
    });
  });

  describe('rounding', () => {
    it('rounds to 2 decimal places on creation', () => {
      // This would be 92.0000000001 in float arithmetic — Money must handle it
      const m = Money.of('92.00499');
      expect(m.toStorageString()).toBe('92.00');
    });

    it('rounds UP to nearest 0.50 correctly', () => {
      expect(Money.of(91.10).roundUpTo(0.5).toStorageString()).toBe('91.50');
      expect(Money.of(91.50).roundUpTo(0.5).toStorageString()).toBe('91.50');
      expect(Money.of(91.51).roundUpTo(0.5).toStorageString()).toBe('92.00');
    });
  });

  describe('margin calculation (BR-01 G7)', () => {
    it('calculates margin_pct = (price - cost) / price', () => {
      const price = Money.of(92);
      const cost = Money.of(82);
      const marginPct = Money.marginPct(price, cost);
      // (92 - 82) / 92 = 10/92 ≈ 0.1087 (10.87%)
      expect(Number(marginPct?.toFixed(4))).toBeCloseTo(0.1087, 3);
    });

    it('returns null when price is zero', () => {
      const margin = Money.marginPct(Money.zero(), Money.of(50));
      expect(margin).toBeNull();
    });
  });

  describe('auto floor calculation (BR-01)', () => {
    it('calculates floor = landed_cost / (1 - min_margin_pct), rounded up to 0.50', () => {
      // Blueprint example: cost=82, floor should be >= 82/(1-0.10) = 91.11 → rounds up to 91.50
      const landedCost = Money.of(82);
      const minMarginPct = 0.10;
      const floor = Money.autoFloor(landedCost, minMarginPct);
      // 82 / 0.90 = 91.111... → rounds up to 91.50
      expect(floor.toStorageString()).toBe('91.50');
    });

    it('Scenario A: floor 90 at cost 82 requires min_margin_pct ≈ 8.6%', () => {
      // Blueprint uses floor=90, cost=82. This gives margin = (90-82)/90 = 8.89%
      // At 8.89% min margin: 82/(1-0.0889) = 82/0.9111 = 90.00 → rounds up to 90.00
      const floor = Money.autoFloor(Money.of(82), 0.0889);
      expect(Number(floor.toNumber())).toBeGreaterThanOrEqual(90);
    });

    it('throws when minMarginPct >= 1', () => {
      expect(() => Money.autoFloor(Money.of(100), 1.0)).toThrow();
    });

    it('throws when minMarginPct < 0', () => {
      expect(() => Money.autoFloor(Money.of(100), -0.1)).toThrow();
    });
  });

  describe('comparison', () => {
    it('isGreaterThanOrEqual works correctly', () => {
      expect(Money.of(92).isGreaterThanOrEqual(Money.of(90))).toBe(true);
      expect(Money.of(90).isGreaterThanOrEqual(Money.of(90))).toBe(true);
      expect(Money.of(88).isGreaterThanOrEqual(Money.of(90))).toBe(false);
    });

    it('isLessThan works correctly', () => {
      expect(Money.of(88).isLessThan(Money.of(90))).toBe(true);
      expect(Money.of(90).isLessThan(Money.of(90))).toBe(false);
    });
  });
});
