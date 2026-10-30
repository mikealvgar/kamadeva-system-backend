import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Money } from '../../common/domain/money.js';
import type { SaleRepositoryPort } from '../application/ports/sale-repository.port.js';
import {
  PaymentRecord,
  SaleAggregate,
  SaleItem,
} from '../domain/sale.aggregate.js';

const cancellationSelect = {
  id: true,
  folio: true,
  status: true,
  customerId: true,
  quoteId: true,
  createdById: true,
  notes: true,
  subtotal: true,
  discount: true,
  tax: true,
  total: true,
  cancelledAt: true,
  cancelledById: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      productId: true,
      sizeId: true,
      quantity: true,
      unitPrice: true,
      discount: true,
      tax: true,
      total: true,
    },
  },
  payments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      paidAt: true,
      createdById: true,
    },
  },
} satisfies Prisma.SaleSelect;

@Injectable()
export class PrismaSaleRepository implements SaleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    sale: SaleAggregate,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    // Snapshot current costs so later cost edits do not rewrite past profit.
    const products = await client.product.findMany({
      where: {
        id: { in: [...new Set(sale.items.map((item) => item.productId))] },
      },
      select: { id: true, cost: true },
    });
    const costs = new Map(products.map(({ id, cost }) => [id, cost]));
    const created = await client.sale.create({
      data: {
        id: sale.id,
        folio: sale.folio.toString(),
        status: sale.status,
        customerId: sale.customerId,
        quoteId: sale.quoteId,
        createdById: sale.createdById,
        notes: sale.notes,
        subtotal: sale.subtotal.toDecimal(),
        discount: sale.discount.toDecimal(),
        tax: sale.tax.toDecimal(),
        total: sale.total.toDecimal(),
        items: {
          create: sale.items.map((item) => ({
            productId: item.productId,
            sizeId: item.sizeId,
            quantity: item.quantity.toDecimal(),
            unitPrice: item.unitPrice.toDecimal(),
            discount: item.discount.toDecimal(),
            tax: item.tax.toDecimal(),
            total: item.total.toDecimal(),
            unitCost: costs.get(item.productId) ?? null,
          })),
        },
      },
      select: {
        id: true,
        items: { select: { id: true, productId: true, quantity: true } },
      },
    });

    await client.inventoryMovement.createMany({
      data: created.items.map((item) => ({
        type: 'SALE_OUT',
        quantityChange: item.quantity.negated(),
        productId: item.productId,
        saleItemId: item.id,
        referenceType: 'SALE',
        referenceId: created.id,
        createdById: sale.createdById,
      })),
    });

    if (sale.payment) {
      await client.payment.create({
        data: {
          saleId: created.id,
          method: sale.payment.method,
          amount: sale.payment.amount.toDecimal(),
          status: sale.payment.status,
          createdById: sale.payment.createdById,
          paidAt: sale.payment.paidAt,
        },
        select: { id: true },
      });
    }
  }

  async existsForQuote(
    quoteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const sale = await (tx ?? this.prisma).sale.findUnique({
      where: { quoteId },
      select: { id: true },
    });
    return sale !== null;
  }

  async findForCancellation(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleAggregate | null> {
    const record = await (tx ?? this.prisma).sale.findUnique({
      where: { id },
      select: cancellationSelect,
    });
    if (!record) return null;
    return new SaleAggregate({
      id: record.id,
      folio: record.folio,
      status: record.status,
      customerId: record.customerId,
      quoteId: record.quoteId,
      createdById: record.createdById,
      notes: record.notes,
      subtotal: new Money(record.subtotal),
      discount: new Money(record.discount),
      tax: new Money(record.tax),
      total: new Money(record.total),
      items: record.items.map(
        (item) =>
          new SaleItem({
            id: item.id,
            productId: item.productId,
            sizeId: item.sizeId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            tax: item.tax,
            total: item.total,
          }),
      ),
      payments: record.payments.map(
        (payment) =>
          new PaymentRecord({
            id: payment.id,
            saleId: record.id,
            amount: payment.amount.toFixed(2),
            method: payment.method,
            status: payment.status,
            paidAt: payment.paidAt,
            createdById: payment.createdById,
          }),
      ),
      cancellation:
        record.cancelledAt && record.cancelledById
          ? {
              cancelledAt: record.cancelledAt,
              cancelledById: record.cancelledById,
              reason: record.cancelReason ?? '',
            }
          : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async saveCancellation(
    sale: SaleAggregate,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const cancellation = sale.cancellation;
    if (!cancellation) throw new Error('La venta no tiene cancelación');
    const client = tx ?? this.prisma;
    await client.sale.update({
      where: { id: sale.id },
      data: {
        status: sale.status,
        cancelledAt: cancellation.cancelledAt,
        cancelledById: cancellation.cancelledById,
        cancelReason: cancellation.reason,
      },
      select: { id: true },
    });
    await client.inventoryMovement.createMany({
      data: sale.items.map((item) => ({
        type: 'RETURN_IN',
        quantityChange: item.quantity.toDecimal(),
        productId: item.productId,
        saleItemId: item.id,
        referenceType: 'SALE_CANCEL',
        referenceId: sale.id,
        createdById: cancellation.cancelledById,
        notes: cancellation.reason,
      })),
    });
    await client.payment.updateMany({
      where: { saleId: sale.id, status: 'PAID' },
      data: { status: 'REFUNDED' },
    });
  }
}
