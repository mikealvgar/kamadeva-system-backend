import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Money } from '../../common/domain/money.js';
import { Folio } from '../../common/domain/folio.js';
import type { SaleRepositoryPort } from '../application/ports/sale-repository.port.js';
import {
  PaymentRecord,
  SaleAggregate,
  SaleItem,
} from '../domain/sale.aggregate.js';

const cancellationSelect = {
  id: true,
  folio: true,
  estado: true,
  clienteId: true,
  cotizacionId: true,
  creadoPorId: true,
  notas: true,
  subtotal: true,
  descuento: true,
  total: true,
  metodoPago: true,
  fechaPago: true,
  fechaCancelacion: true,
  canceladoPorId: true,
  motivoCancelacion: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  items: {
    orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      productoId: true,
      tallaId: true,
      cantidad: true,
      precioUnitario: true,
      descuento: true,
      total: true,
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
    const products = await client.product.findMany({
      where: {
        id: { in: [...new Set(sale.items.map((item) => item.productId))] },
      },
      select: { id: true, precioCompra: true },
    });
    const costs = new Map(products.map(({ id, precioCompra }) => [id, precioCompra]));

    const created = await client.sale.create({
      data: {
        id: sale.id,
        estado: sale.status,
        metodoPago: sale.payment?.method ?? 'CASH',
        fechaPago: sale.payment?.paidAt ?? new Date(),
        clienteId: sale.customerId,
        cotizacionId: sale.quoteId,
        creadoPorId: sale.createdById,
        notas: sale.notes,
        subtotal: sale.subtotal.toDecimal(),
        descuento: sale.discount.toDecimal(),
        total: sale.total.toDecimal(),
        items: {
          create: sale.items.map((item) => ({
            id: item.id,
            productoId: item.productId,
            tallaId: item.sizeId,
            cantidad: item.quantity.toDecimal(),
            precioUnitario: item.unitPrice.toDecimal(),
            descuento: item.discount.toDecimal(),
            total: item.total.toDecimal(),
            costoUnitario: costs.get(item.productId) ?? null,
          })),
        },
      },
      select: {
        id: true,
        items: { select: { id: true, productoId: true, cantidad: true } },
      },
    });

    await client.inventoryMovement.createMany({
      data: created.items.map((item) => ({
        tipo: 'SALE_OUT',
        cambioExistencias: item.cantidad.negated(),
        productoId: item.productoId,
        renglonVentaId: item.id,
        tipoReferencia: 'SALE',
        referenciaId: created.id,
        creadoPorId: sale.createdById,
      })),
    });
  }

  async existsForQuote(
    quoteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const sale = await (tx ?? this.prisma).sale.findUnique({
      where: { cotizacionId: quoteId },
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
    const folioStr =
      typeof record.folio === 'number'
        ? Folio.fromSequence('V', record.folio).toString()
        : String(record.folio);
    return new SaleAggregate({
      id: record.id,
      folio: folioStr,
      status: record.estado,
      customerId: record.clienteId,
      quoteId: record.cotizacionId,
      createdById: record.creadoPorId,
      notes: record.notas,
      subtotal: new Money(record.subtotal),
      discount: new Money(record.descuento),
      tax: Money.zero(),
      total: new Money(record.total),
      items: record.items.map(
        (item) =>
          new SaleItem({
            id: item.id,
            productId: item.productoId,
            sizeId: item.tallaId,
            quantity: item.cantidad,
            unitPrice: item.precioUnitario,
            discount: item.descuento,
            tax: 0,
            total: item.total,
          }),
      ),
      payments: [
        new PaymentRecord({
          id: record.id,
          saleId: record.id,
          amount: record.total.toFixed(2),
          method: record.metodoPago,
          status: record.estado === 'CANCELLED' ? 'CANCELLED' : record.estado === 'REFUNDED' ? 'REFUNDED' : 'PAID',
          paidAt: record.fechaPago,
          createdById: record.creadoPorId,
        }),
      ],
      cancellation:
        record.fechaCancelacion && record.canceladoPorId
          ? {
              cancelledAt: record.fechaCancelacion,
              cancelledById: record.canceladoPorId,
              reason: record.motivoCancelacion ?? '',
            }
          : null,
      createdAt: record.fechaCreacion,
      updatedAt: record.fechaActualizacion,
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
        estado: sale.status,
        fechaCancelacion: cancellation.cancelledAt,
        canceladoPorId: cancellation.cancelledById,
        motivoCancelacion: cancellation.reason,
      },
      select: { id: true },
    });
    await client.inventoryMovement.createMany({
      data: sale.items.map((item) => ({
        tipo: 'RETURN_IN',
        cambioExistencias: item.quantity.toDecimal(),
        productoId: item.productId,
        renglonVentaId: item.id,
        tipoReferencia: 'SALE_CANCEL',
        referenciaId: sale.id,
        creadoPorId: cancellation.cancelledById,
        notas: cancellation.reason,
      })),
    });
  }
}
