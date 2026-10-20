import { Prisma } from '../generated/prisma/client.js';
import type { CustomerDto } from '../customers/dto/customer.dto.js';
import type { QuoteDto, SaleDto } from './dto/quote.dto.js';

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;
const economicSelect = {
  id: true,
  folio: true,
  status: true,
  subtotal: true,
  discount: true,
  tax: true,
  total: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: customerSelect },
} as const;
export const quoteSelect = {
  ...economicSelect,
  expiresAt: true,
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      discount: true,
      tax: true,
      total: true,
      product: { select: { id: true, sku: true, name: true, imageUrl: true } },
    },
  },
} satisfies Prisma.QuoteSelect;
export const saleSelect = {
  ...economicSelect,
  quoteId: true,
} satisfies Prisma.SaleSelect;
export type QuoteRecord = Prisma.QuoteGetPayload<{
  select: typeof quoteSelect;
}>;
type SaleRecord = Prisma.SaleGetPayload<{ select: typeof saleSelect }>;
type CustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof customerSelect;
}>;

function customerDto(customer: CustomerRecord): CustomerDto {
  return {
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}
function economics(record: QuoteRecord | SaleRecord) {
  return {
    id: record.id,
    folio: record.folio,
    subtotal: record.subtotal.toFixed(2),
    discount: record.discount.toFixed(2),
    tax: record.tax.toFixed(2),
    total: record.total.toFixed(2),
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
export function quoteDto(quote: QuoteRecord): QuoteDto {
  return {
    ...economics(quote),
    status: quote.status,
    customer: customerDto(quote.customer),
    expiresAt: quote.expiresAt?.toISOString() ?? null,
    canPay:
      (quote.status === 'DRAFT' || quote.status === 'SENT') &&
      (quote.expiresAt === null || quote.expiresAt.getTime() > Date.now()),
    items: quote.items.map((item) => ({
      id: item.id,
      product: item.product,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unitPrice.toFixed(2),
      discount: item.discount.toFixed(2),
      tax: item.tax.toFixed(2),
      total: item.total.toFixed(2),
    })),
  };
}
export function saleDto(sale: SaleRecord): SaleDto {
  return {
    ...economics(sale),
    status: sale.status,
    quoteId: sale.quoteId,
    customer: sale.customer ? customerDto(sale.customer) : null,
  };
}
