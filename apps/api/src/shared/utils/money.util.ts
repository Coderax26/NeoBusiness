import { Decimal } from 'decimal.js';

/**
 * Money utility — all financial arithmetic must go through this class.
 * Internally uses Decimal.js for arbitrary-precision arithmetic.
 * The database stores numeric(14,2); this class enforces 2 decimal places.
 *
 * Currency: INR (₹). Never use JavaScript float for money.
 */
export class Money {
  private readonly value: Decimal;

  private constructor(value: Decimal | number | string) {
    this.value = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  static of(value: number | string | Decimal): Money {
    return new Money(value);
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.value.plus(other.value));
  }

  sub(other: Money): Money {
    return new Money(this.value.minus(other.value));
  }

  mul(factor: number | string): Money {
    return new Money(this.value.mul(new Decimal(factor)));
  }

  div(divisor: number | string): Money {
    if (new Decimal(divisor).isZero()) {
      throw new Error('Money.div: division by zero');
    }
    return new Money(this.value.div(new Decimal(divisor)));
  }

  pct(percent: number | string): Money {
    return new Money(this.value.mul(new Decimal(percent)).div(100));
  }

  /** Round UP to nearest multiple of step (e.g. 0.50) */
  roundUpTo(step: number | string): Money {
    const s = new Decimal(step);
    return new Money(this.value.div(s).ceil().mul(s));
  }

  isGreaterThanOrEqual(other: Money): boolean {
    return this.value.gte(other.value);
  }

  isLessThan(other: Money): boolean {
    return this.value.lt(other.value);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  /** Returns the value as a string suitable for storing in numeric(14,2) column */
  toStorageString(): string {
    return this.value.toFixed(2);
  }

  /** Returns a JS number — use only for display, never for DB writes */
  toNumber(): number {
    return this.value.toNumber();
  }

  toString(): string {
    return `₹${this.value.toFixed(2)}`;
  }

  /**
   * Calculate margin percentage: margin_pct = (price - cost) / price
   * Returns a decimal fraction (0.073 = 7.3%)
   * Returns null if price is zero (undefined margin)
   */
  static marginPct(price: Money, cost: Money): Decimal | null {
    if (price.isZero()) return null;
    return price.value.minus(cost.value).div(price.value);
  }

  /**
   * Calculate auto floor price: floor = cost / (1 - min_margin_pct)
   * min_margin_pct is a decimal fraction (e.g. 0.10 for 10%)
   * Result is rounded UP to nearest 0.50 INR per blueprint convention.
   */
  static autoFloor(landedCost: Money, minMarginPct: number): Money {
    if (minMarginPct >= 1 || minMarginPct < 0) {
      throw new Error('minMarginPct must be between 0 and 1 exclusive');
    }
    const floor = landedCost.value.div(new Decimal(1).minus(minMarginPct));
    return new Money(floor).roundUpTo(0.5);
  }
}
