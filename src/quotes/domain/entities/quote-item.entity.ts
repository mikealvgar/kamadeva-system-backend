import { Prisma } from '../../../generated/prisma/client.js';
import { Money, Quantity } from '../../../common/domain/money.js';

export interface QuoteItemProps {
  id?: string;
  productId: string;
  sizeId?: string | null;
  quantity: Quantity | number | string | Prisma.Decimal;
  unitPrice: Money | number | string | Prisma.Decimal;
  discount?: Money | number | string | Prisma.Decimal;
  tax?: Money | number | string | Prisma.Decimal;
}

export class QuoteItem {
  readonly id?: string;
  readonly productId: string;
  readonly sizeId: string | null;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly discount: Money;
  readonly tax: Money;
  readonly subtotal: Money;
  readonly total: Money;

  constructor(props: QuoteItemProps) {
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
    this.total = this.subtotal.minus(this.discount).plus(this.tax);
  }
}
