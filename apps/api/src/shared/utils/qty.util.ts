import { Decimal } from 'decimal.js';

/**
 * Qty utility — all inventory quantity arithmetic must go through this class.
 * Internally uses Decimal.js for 3 decimal places.
 * The database stores numeric(14,3) in the primary UoM.
 *
 * Never use JavaScript float for quantities.
 */
export class Qty {
  private readonly value: Decimal;
  readonly uom: string;

  private constructor(value: Decimal | number | string, uom: string) {
    this.value = new Decimal(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
    this.uom = uom;
  }

  static of(value: number | string | Decimal, uom: string): Qty {
    return new Qty(value, uom);
  }

  static zero(uom: string): Qty {
    return new Qty(0, uom);
  }

  add(other: Qty): Qty {
    this.assertSameUom(other);
    return new Qty(this.value.plus(other.value), this.uom);
  }

  sub(other: Qty): Qty {
    this.assertSameUom(other);
    return new Qty(this.value.minus(other.value), this.uom);
  }

  mul(factor: number | string): Qty {
    return new Qty(this.value.mul(new Decimal(factor)), this.uom);
  }

  div(divisor: number | string): Qty {
    if (new Decimal(divisor).isZero()) {
      throw new Error('Qty.div: division by zero');
    }
    return new Qty(this.value.div(new Decimal(divisor)), this.uom);
  }

  /**
   * Convert to a different UoM using a conversion factor.
   * @param targetUom the target unit of measure
   * @param factor    how many targetUom per one sourceUom (e.g. 1 crate = 20 kg, factor = 20)
   */
  convert(targetUom: string, factor: number | string): Qty {
    return new Qty(this.value.mul(new Decimal(factor)), targetUom);
  }

  isGreaterThan(other: Qty): boolean {
    this.assertSameUom(other);
    return this.value.gt(other.value);
  }

  isGreaterThanOrEqual(other: Qty): boolean {
    this.assertSameUom(other);
    return this.value.gte(other.value);
  }

  isLessThan(other: Qty): boolean {
    this.assertSameUom(other);
    return this.value.lt(other.value);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  /** Returns the value as a string suitable for storing in numeric(14,3) column */
  toStorageString(): string {
    return this.value.toFixed(3);
  }

  /** Returns a JS number — use only for display calculations */
  toNumber(): number {
    return this.value.toNumber();
  }

  toString(): string {
    return `${this.value.toFixed(3)} ${this.uom}`;
  }

  /**
   * Calculate variance percentage between actual and standard.
   * Returns a decimal fraction (0.03 = 3%).
   */
  static variancePct(actual: Qty, standard: Qty): Decimal {
    standard.assertSameUom(actual);
    if (standard.isZero()) return new Decimal(0);
    return actual.value.minus(standard.value).div(standard.value);
  }

  private assertSameUom(other: Qty): void {
    if (this.uom !== other.uom) {
      throw new Error(
        `Qty UoM mismatch: cannot operate on ${this.uom} and ${other.uom}. Convert first.`,
      );
    }
  }
}
