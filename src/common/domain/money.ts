import { Prisma } from '../../generated/prisma/client.js';
import { InvalidAmountException } from './domain-exception.js';

export class Money {
  private readonly value: Prisma.Decimal;

  constructor(value: number | string | Prisma.Decimal) {
    const raw = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    const rounded = raw.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (rounded.isNegative() || rounded.greaterThan('9999999999.99')) {
      throw new InvalidAmountException('Importe fuera de rango');
    }
    this.value = rounded;
  }

  static zero(): Money {
    return new Money(0);
  }

  plus(other: Money): Money {
    return new Money(this.value.plus(other.value));
  }

  minus(other: Money): Money {
    return new Money(this.value.minus(other.value));
  }

  times(quantity: Quantity): Money {
    return new Money(this.value.times(quantity.toDecimal()));
  }

  equals(other: Money | number | string | Prisma.Decimal): boolean {
    const compare = other instanceof Money ? other.value : new Prisma.Decimal(other);
    return this.value.equals(compare);
  }

  greaterThan(other: Money): boolean {
    return this.value.greaterThan(other.value);
  }

  toDecimal(): Prisma.Decimal {
    return this.value;
  }

  toString(): string {
    return this.value.toFixed(2);
  }
}

export class Quantity {
  private readonly value: Prisma.Decimal;

  constructor(value: number | string | Prisma.Decimal) {
    const raw = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    const rounded = raw.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
    if (rounded.isNegative() || rounded.greaterThan('99999999999.999')) {
      throw new InvalidAmountException('Cantidad fuera de rango');
    }
    this.value = rounded;
  }

  plus(other: Quantity): Quantity {
    return new Quantity(this.value.plus(other.value));
  }

  greaterThan(other: Quantity | number | string | Prisma.Decimal): boolean {
    const compare = other instanceof Quantity ? other.value : new Prisma.Decimal(other);
    return this.value.greaterThan(compare);
  }

  toDecimal(): Prisma.Decimal {
    return this.value;
  }

  toString(): string {
    return this.value.toFixed(3);
  }
}
