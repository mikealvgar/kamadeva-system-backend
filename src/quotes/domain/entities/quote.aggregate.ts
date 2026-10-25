import { Folio } from '../value-objects/folio.js';
import { Money } from '../value-objects/money.js';
import { QuoteItem } from './quote-item.entity.js';
import {
  InvalidQuoteStateException,
  QuoteExpiredException,
  QuoteNotPayableException,
} from '../exceptions/quote-exceptions.js';

export type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED'
  | 'CANCELLED';

export interface QuoteAggregateProps {
  id?: string;
  folio?: Folio | string;
  status?: QuoteStatus;
  customerId: string;
  createdById?: string | null;
  notes?: string | null;
  expiresAt?: Date | null;
  items: QuoteItem[];
  subtotal?: Money;
  discount?: Money;
  tax?: Money;
  total?: Money;
  createdAt?: Date;
  updatedAt?: Date;
}

export class QuoteAggregate {
  readonly id: string;
  private _folio: Folio;
  private _status: QuoteStatus;
  private _customerId: string;
  private _createdById: string | null;
  private _notes: string | null;
  private _expiresAt: Date | null;
  private _items: QuoteItem[];
  private _subtotal: Money;
  private _discount: Money;
  private _tax: Money;
  private _total: Money;
  readonly createdAt: Date;
  private _updatedAt: Date;
  rawRecord?: unknown;

  constructor(props: QuoteAggregateProps) {
    this.id = props.id ?? '';
    this._folio =
      props.folio instanceof Folio
        ? props.folio
        : props.folio
          ? new Folio(props.folio)
          : Folio.generate('COT');
    this._status = props.status ?? 'DRAFT';
    this._customerId = props.customerId;
    this._createdById = props.createdById ?? null;
    this._notes = props.notes ?? null;
    this._expiresAt = props.expiresAt ?? null;
    this._items = props.items;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();

    const totals = this.calculateTotals(props.items);
    this._subtotal = props.subtotal
      ? props.subtotal instanceof Money
        ? props.subtotal
        : new Money(props.subtotal)
      : totals.subtotal;
    this._discount = props.discount
      ? props.discount instanceof Money
        ? props.discount
        : new Money(props.discount)
      : totals.discount;
    this._tax = props.tax
      ? props.tax instanceof Money
        ? props.tax
        : new Money(props.tax)
      : totals.tax;
    this._total = props.total
      ? props.total instanceof Money
        ? props.total
        : new Money(props.total)
      : totals.total;
  }

  get folio(): Folio {
    return this._folio;
  }

  get status(): QuoteStatus {
    return this._status;
  }

  get customerId(): string {
    return this._customerId;
  }

  get createdById(): string | null {
    return this._createdById;
  }

  get notes(): string | null {
    return this._notes;
  }

  get expiresAt(): Date | null {
    return this._expiresAt;
  }

  get items(): readonly QuoteItem[] {
    return this._items;
  }

  get subtotal(): Money {
    return this._subtotal;
  }

  get discount(): Money {
    return this._discount;
  }

  get tax(): Money {
    return this._tax;
  }

  get total(): Money {
    return this._total;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  send(): void {
    this.assertDraft();
    this._status = 'SENT';
    this._updatedAt = new Date();
  }

  markConverted(): void {
    this._status = 'CONVERTED';
    this._updatedAt = new Date();
  }

  assertDraft(): void {
    if (this._status !== 'DRAFT') {
      throw new InvalidQuoteStateException('La cotización no está en borrador');
    }
  }

  assertPayable(now = new Date()): void {
    if (this._status !== 'DRAFT' && this._status !== 'SENT') {
      throw new QuoteNotPayableException('La cotización no admite pago');
    }
    if (this._expiresAt !== null && this._expiresAt.getTime() <= now.getTime()) {
      throw new QuoteExpiredException('La cotización ha expirado');
    }
  }

  updateDetails(params: {
    customerId?: string;
    notes?: string | null;
    expiresAt?: Date | null;
    items?: QuoteItem[];
  }): void {
    this.assertDraft();
    if (params.customerId !== undefined) {
      this._customerId = params.customerId;
    }
    if (params.notes !== undefined) {
      this._notes = params.notes?.trim() || null;
    }
    if (params.expiresAt !== undefined) {
      this._expiresAt = params.expiresAt;
    }
    if (params.items !== undefined) {
      this._items = params.items;
      const totals = this.calculateTotals(params.items);
      this._subtotal = totals.subtotal;
      this._discount = totals.discount;
      this._tax = totals.tax;
      this._total = totals.total;
    }
    this._updatedAt = new Date();
  }

  private calculateTotals(items: QuoteItem[]): {
    subtotal: Money;
    discount: Money;
    tax: Money;
    total: Money;
  } {
    let subtotal = Money.zero();
    let discount = Money.zero();
    let tax = Money.zero();

    for (const item of items) {
      subtotal = subtotal.plus(item.subtotal);
      discount = discount.plus(item.discount);
      tax = tax.plus(item.tax);
    }

    const total = subtotal.minus(discount).plus(tax);
    return { subtotal, discount, tax, total };
  }
}
