import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  SaleDetailView,
  SaleListFilter,
  SalePage,
  SaleQueryPort,
} from '../application/ports/sale-query.port.js';

const ref = { select: { id: true, name: true } } as const;

const detailSelect = {
  id: true,
  folio: true,
  status: true,
  quoteId: true,
  notes: true,
  subtotal: true,
  discount: true,
  tax: true,
  total: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  customer: ref,
  createdBy: ref,
  cancelledBy: ref,
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      discount: true,
      tax: true,
      total: true,
      product: { select: { id: true, barcode: true, name: true } },
      size: ref,
    },
  },
  payments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      method: true,
      amount: true,
      status: true,
      paidAt: true,
    },
  },
} satisfies Prisma.SaleSelect;

const summarySelect = {
  id: true,
  folio: true,
  status: true,
  total: true,
  quoteId: true,
  createdAt: true,
  customer: ref,
  createdBy: ref,
  payments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 1,
    select: { method: true },
  },
} satisfies Prisma.SaleSelect;

type DetailRecord = Prisma.SaleGetPayload<{ select: typeof detailSelect }>;

function toDetail(sale: DetailRecord): SaleDetailView {
  return {
    id: sale.id,
    folio: sale.folio,
    status: sale.status,
    customer: sale.customer,
    createdBy: sale.createdBy,
    quoteId: sale.quoteId,
    notes: sale.notes,
    subtotal: sale.subtotal.toFixed(2),
    discount: sale.discount.toFixed(2),
    tax: sale.tax.toFixed(2),
    total: sale.total.toFixed(2),
    items: sale.items.map((item) => ({
      id: item.id,
      product: item.product,
      size: item.size,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unitPrice.toFixed(2),
      discount: item.discount.toFixed(2),
      tax: item.tax.toFixed(2),
      total: item.total.toFixed(2),
    })),
    payments: sale.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: payment.amount.toFixed(2),
      status: payment.status,
      paidAt: payment.paidAt?.toISOString() ?? null,
    })),
    cancelledAt: sale.cancelledAt?.toISOString() ?? null,
    cancelledBy: sale.cancelledBy,
    cancelReason: sale.cancelReason,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaSaleQueryAdapter implements SaleQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findDetail(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleDetailView | null> {
    const sale = await (tx ?? this.prisma).sale.findUnique({
      where: { id },
      select: detailSelect,
    });
    return sale ? toDetail(sale) : null;
  }

  async list(filter: SaleListFilter): Promise<SalePage> {
    const where: Prisma.SaleWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.createdById) where.createdById = filter.createdById;
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.folio) where.folio = filter.folio;
    if (filter.paymentMethod)
      where.payments = { some: { method: filter.paymentMethod } };
    if (filter.startDate || filter.endDate)
      where.createdAt = {
        ...(filter.startDate ? { gte: filter.startDate } : {}),
        ...(filter.endDate ? { lte: filter.endDate } : {}),
      };
    const [total, sales] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: summarySelect,
      }),
    ]);
    return {
      data: sales.map((sale) => ({
        id: sale.id,
        folio: sale.folio,
        status: sale.status,
        total: sale.total.toFixed(2),
        paymentMethod: sale.payments[0]?.method ?? null,
        customer: sale.customer,
        createdBy: sale.createdBy,
        quoteId: sale.quoteId,
        createdAt: sale.createdAt.toISOString(),
      })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}
