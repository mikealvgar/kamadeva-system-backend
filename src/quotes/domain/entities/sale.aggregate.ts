import { Folio } from '../value-objects/folio.js';
import { Money, Quantity } from '../value-objects/money.js';

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';
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
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly discount: Money;
  readonly tax: Money;
  readonly total: Money;

  constructor(props: {
    id?: string;
    productId: string;
    quantity: Quantity | number | string;
    unitPrice: Money | number | string;
    discount?: Money | number | string;
    tax?: Money | number | string;
    total?: Money | number | string;
  }) {
    this.id = props.id;
    this.productId = props.productId;
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
    this.total =
      props.total instanceof Money ? props.total : new Money(props.total ?? 0);
  }
}

export class SaleAggregate {
  readonly id: string;
  readonly folio: Folio;
  readonly status: SaleStatus;
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
  readonly createdAt: Date;
  readonly updatedAt: Date;
  rawRecord?: unknown;

  constructor(props: {
    id?: string;
    folio?: Folio | string;
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
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id ?? '';
    this.folio =
      props.folio instanceof Folio
        ? props.folio
        : props.folio
          ? new Folio(props.folio)
          : Folio.generate('VEN');
    this.status = props.status ?? 'COMPLETED';
    this.customerId = props.customerId ?? null;
    this.quoteId = props.quoteId ?? null;
    this.createdById = props.createdById ?? null;
    this.notes = props.notes ?? null;
    this.subtotal =
      props.subtotal instanceof Money
        ? props.subtotal
        : new Money(props.subtotal);
    this.discount =
      props.discount instanceof Money
        ? props.discount
        : new Money(props.discount);
    this.tax =
      props.tax instanceof Money ? props.tax : new Money(props.tax);
    this.total =
      props.total instanceof Money ? props.total : new Money(props.total);
    this.items = props.items;
    this.payment = props.payment;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }
}
