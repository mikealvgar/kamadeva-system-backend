import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { Folio } from '../../common/domain/folio.js';
import { Money, Quantity } from '../../common/domain/money.js';
import { SaleNotCancellableException } from './sale-exceptions.js';

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
export type PaymentStatus =
  'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type SaleStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

export class PaymentRecord {
  readonly id: string;
  readonly saleId: string;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly status: PaymentStatus;
  readonly paidAt: Date | null;
  readonly createdById: string | null;

  constructor(props: {
    id?: string;
    saleId: string;
    amount: Money | number | string;
    method: PaymentMethod;
    status?: PaymentStatus;
    paidAt?: Date | null;
    createdById?: string | null;
  }) {
    this.id = props.id ?? '';
    this.saleId = props.saleId;
    this.amount =
      props.amount instanceof Money ? props.amount : new Money(props.amount);
    this.method = props.method;
    this.status = props.status ?? 'PAID';
    this.paidAt = props.paidAt ?? new Date();
    this.createdById = props.createdById ?? null;
  }
}

export class SaleItem {
  readonly id?: string;
  readonly productId: string;
  readonly sizeId: string | null;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly discount: Money;
  readonly tax: Money;
  readonly subtotal: Money;
  readonly total: Money;

  constructor(props: {
    id?: string;
    productId: string;
    sizeId?: string | null;
    quantity: Quantity | number | string | Prisma.Decimal;
    unitPrice: Money | number | string | Prisma.Decimal;
    discount?: Money | number | string | Prisma.Decimal;
    tax?: Money | number | string | Prisma.Decimal;
    /** Stored line total; computed from price, quantity, discount and tax when omitted. */
    total?: Money | number | string | Prisma.Decimal;
  }) {
    this.id = props.id;
    this.productId = props.productId;
    this.sizeId = props.sizeId ?? null;
    this.quantity =
      props.quantity instanceof Quantity
        ? props.quantity
        : new Quantity(props.quantity);
    this.unitPrice =
      props.unitPrice instanceof Money
        ? props.unitPrice
        : new Money(props.unitPrice);
    this.discount =
      props.discount instanceof Money
        ? props.discount
        : new Money(props.discount ?? 0);
    this.tax =
      props.tax instanceof Money ? props.tax : new Money(props.tax ?? 0);
    this.subtotal = this.unitPrice.times(this.quantity);
    // Money rejects negatives, so a discount above the line subtotal fails here.
    this.total =
      props.total === undefined
        ? this.subtotal.minus(this.discount).plus(this.tax)
        : props.total instanceof Money
          ? props.total
          : new Money(props.total);
  }
}

export interface SaleTotals {
  subtotal: Money;
  discount: Money;
  tax: Money;
  total: Money;
}

export interface SaleCancellation {
  cancelledAt: Date;
  cancelledById: string;
  reason: string;
}

export class SaleAggregate {
  readonly id: string;
  readonly folio: Folio;
  private _status: SaleStatus;
  readonly customerId: string | null;
  readonly quoteId: string | null;
  readonly createdById: string | null;
  readonly notes: string | null;
  readonly subtotal: Money;
  readonly discount: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly items: readonly SaleItem[];
  readonly payment?: PaymentRecord;
  /** Persisted payments, loaded for cancellation. */
  readonly payments: readonly PaymentRecord[];
  private _cancellation: SaleCancellation | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id?: string;
    folio: Folio | string;
    status?: SaleStatus;
    customerId?: string | null;
    quoteId?: string | null;
    createdById?: string | null;
    notes?: string | null;
    subtotal: Money;
    discount: Money;
    tax: Money;
    total: Money;
    items: SaleItem[];
    payment?: PaymentRecord;
    payments?: PaymentRecord[];
    cancellation?: SaleCancellation | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id ?? randomUUID();
    this.folio =
      props.folio instanceof Folio ? props.folio : new Folio(props.folio);
    this._status = props.status ?? 'COMPLETED';
    this.customerId = props.customerId ?? null;
    this.quoteId = props.quoteId ?? null;
    this.createdById = props.createdById ?? null;
    this.notes = props.notes ?? null;
    this.subtotal = props.subtotal;
    this.discount = props.discount;
    this.tax = props.tax;
    this.total = props.total;
    this.items = props.items;
    this.payment = props.payment;
    this.payments = props.payments ?? [];
    this._cancellation = props.cancellation ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static totalsOf(items: readonly SaleItem[]): SaleTotals {
    return items.reduce<SaleTotals>(
      (sum, item) => ({
        subtotal: sum.subtotal.plus(item.subtotal),
        discount: sum.discount.plus(item.discount),
        tax: sum.tax.plus(item.tax),
        total: sum.total.plus(item.total),
      }),
      {
        subtotal: Money.zero(),
        discount: Money.zero(),
        tax: Money.zero(),
        total: Money.zero(),
      },
    );
  }

  get status(): SaleStatus {
    return this._status;
  }

  get cancellation(): SaleCancellation | null {
    return this._cancellation;
  }

  /**
   * Cancel a completed sale. Returns false when it was already cancelled so
   * callers can skip side effects (repeat → same result).
   */
  cancel(actorId: string, reason: string, at = new Date()): boolean {
    if (this._status === 'CANCELLED') return false;
    if (this._status !== 'COMPLETED') {
      throw new SaleNotCancellableException('La venta no admite cancelación');
    }
    this._status = 'CANCELLED';
    this._cancellation = {
      cancelledAt: at,
      cancelledById: actorId,
      reason: reason.trim(),
    };
    return true;
  }
}
