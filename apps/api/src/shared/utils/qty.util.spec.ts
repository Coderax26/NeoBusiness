import { describe, it, expect } from 'vitest';
import { Qty } from './qty.util';

describe('Qty utility', () => {
  describe('basic arithmetic', () => {
    it('adds two quantities with same UoM', () => {
      const a = Qty.of(100.5, 'KG');
      const b = Qty.of(200.75, 'KG');
      expect(a.add(b).toStorageString()).toBe('301.250');
    });

    it('subtracts quantities correctly', () => {
      const a = Qty.of(500, 'KG');
      const b = Qty.of(123.456, 'KG');
      expect(a.sub(b).toStorageString()).toBe('376.544');
    });

    it('throws when adding different UoMs', () => {
      const kg = Qty.of(100, 'KG');
      const crate = Qty.of(5, 'CRATE');
      expect(() => kg.add(crate)).toThrow('UoM mismatch');
    });

    it('throws when subtracting different UoMs', () => {
      const kg = Qty.of(100, 'KG');
      const crate = Qty.of(5, 'CRATE');
      expect(() => kg.sub(crate)).toThrow('UoM mismatch');
    });

    it('multiplies by a factor', () => {
      const qty = Qty.of(20, 'CRATE');
      expect(qty.mul(40).toStorageString()).toBe('800.000');
    });

    it('throws on division by zero', () => {
      expect(() => Qty.of(100, 'KG').div(0)).toThrow('division by zero');
    });
  });

  describe('UoM conversion', () => {
    it('converts CRATE to KG using a factor', () => {
      // 1 crate = 20 kg → 5 crates = 100 kg
      const crates = Qty.of(5, 'CRATE');
      const kg = crates.convert('KG', 20);
      expect(kg.toStorageString()).toBe('100.000');
      expect(kg.uom).toBe('KG');
    });
  });

  describe('rounding', () => {
    it('rounds to 3 decimal places on creation', () => {
      const q = Qty.of(100.0004999, 'KG');
      expect(q.toStorageString()).toBe('100.000');
    });

    it('rounds half-up at the third decimal', () => {
      const q = Qty.of(100.0005, 'KG');
      expect(q.toStorageString()).toBe('100.001');
    });
  });

  describe('comparison', () => {
    it('isGreaterThan works correctly', () => {
      expect(Qty.of(100, 'KG').isGreaterThan(Qty.of(50, 'KG'))).toBe(true);
      expect(Qty.of(50, 'KG').isGreaterThan(Qty.of(100, 'KG'))).toBe(false);
    });

    it('isZero detects zero', () => {
      expect(Qty.zero('KG').isZero()).toBe(true);
      expect(Qty.of(0.001, 'KG').isZero()).toBe(false);
    });

    it('isNegative detects negative quantities', () => {
      expect(Qty.of(-1, 'KG').isNegative()).toBe(true);
      expect(Qty.of(0, 'KG').isNegative()).toBe(false);
    });
  });

  describe('variance calculation (BR-06)', () => {
    it('returns 0 variance when actual equals standard', () => {
      const variance = Qty.variancePct(Qty.of(100, 'KG'), Qty.of(100, 'KG'));
      expect(variance.toNumber()).toBe(0);
    });

    it('calculates positive variance (over-yield)', () => {
      // Scenario F: 103 actual vs 100 standard = +3%
      const variance = Qty.variancePct(Qty.of(103, 'KG'), Qty.of(100, 'KG'));
      expect(variance.toNumber()).toBeCloseTo(0.03, 5);
    });

    it('calculates negative variance (under-yield)', () => {
      // -3% variance
      const variance = Qty.variancePct(Qty.of(97, 'KG'), Qty.of(100, 'KG'));
      expect(variance.toNumber()).toBeCloseTo(-0.03, 5);
    });

    it('returns 0 when standard is zero (avoid division by zero)', () => {
      const variance = Qty.variancePct(Qty.of(10, 'KG'), Qty.of(0, 'KG'));
      expect(variance.toNumber()).toBe(0);
    });
  });
});
