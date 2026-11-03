import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteItem } from '../../domain/entities/quote-item.entity.js';
import { Money, Quantity } from '../../../common/domain/money.js';
import { Folio } from '../../../common/domain/folio.js';
import {
  CustomerNotFoundException,
  ProductNotFoundException,
} from '../../domain/exceptions/quote-exceptions.js';
import {
  quoteSelect,
  type QuoteRecord,
} from '../../quote-records.js';
import type {
  QuoteQueryFilter,
  QuoteRepositoryPort,
} from '../../application/ports/quote-repository.port.js';

@Injectable()
export class PrismaQuoteRepository implements QuoteRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<QuoteAggregate | null> {
    const client = this.getClient(tx);
    const record = await client.quote.findUnique({
      where: { id },
      select: quoteSelect,
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findRecordById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<QuoteRecord | null> {
    const client = this.getClient(tx);
    return client.quote.findUnique({
      where: { id },
      select: quoteSelect,
    });
  }

  async findAll(filter: QuoteQueryFilter = {}): Promise<QuoteAggregate[]> {
    const records = await this.findAllRecords(filter);
    return records.map((r) => this.toDomain(r));
  }

  async findAllRecords(filter: QuoteQueryFilter = {}): Promise<QuoteRecord[]> {
    let folioFilter: number | undefined = undefined;
    if (filter.search) {
      const trimmed = filter.search.trim();
      const match = trimmed.match(/^(?:c-?)?0*(\d+)$/i);
      folioFilter = match ? parseInt(match[1], 10) : -1;
    }
    return this.prisma.quote.findMany({
      where: {
        ...(filter.status ? { estado: filter.status as never } : {}),
        ...(filter.customerId ? { clienteId: filter.customerId } : {}),
        ...(folioFilter !== undefined ? { folio: folioFilter } : {}),
      },
      orderBy: { fechaCreacion: 'desc' },
      select: quoteSelect,
    });
  }

  async save(quote: QuoteAggregate, tx?: Prisma.TransactionClient): Promise<QuoteRecord> {
    const client = this.getClient(tx);
    return client.quote.create({
      data: {
        ...(quote.id ? { id: quote.id } : {}),
        estado: quote.status,
        clienteId: quote.customerId,
        creadoPorId: quote.createdById,
        notas: quote.notes,
        fechaVencimiento: quote.expiresAt,
        subtotal: quote.subtotal.toDecimal(),
        descuento: quote.discount.toDecimal(),
        total: quote.total.toDecimal(),
        items: {
          create: quote.items.map((item) => ({
            id: item.id,
            productoId: item.productId,
            tallaId: item.sizeId ?? null,
            cantidad: item.quantity.toDecimal(),
            precioUnitario: item.unitPrice.toDecimal(),
            descuento: item.discount.toDecimal(),
            total: item.total.toDecimal(),
          })),
        },
      },
      select: quoteSelect,
    });
  }

  async update(quote: QuoteAggregate, tx?: Prisma.TransactionClient): Promise<QuoteRecord> {
    const client = this.getClient(tx);
    await client.quoteItem.deleteMany({ where: { cotizacionId: quote.id } });
    return client.quote.update({
      where: { id: quote.id },
      data: {
        clienteId: quote.customerId,
        estado: quote.status,
        notas: quote.notes,
        fechaVencimiento: quote.expiresAt,
        subtotal: quote.subtotal.toDecimal(),
        descuento: quote.discount.toDecimal(),
        total: quote.total.toDecimal(),
        items: {
          create: quote.items.map((item) => ({
            id: item.id,
            productoId: item.productId,
            tallaId: item.sizeId ?? null,
            cantidad: item.quantity.toDecimal(),
            precioUnitario: item.unitPrice.toDecimal(),
            descuento: item.discount.toDecimal(),
            total: item.total.toDecimal(),
          })),
        },
      },
      select: quoteSelect,
    });
  }

  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.quote.delete({ where: { id } });
  }

  async findExpiredQuotes(now: Date): Promise<QuoteAggregate[]> {
    const records = await this.prisma.quote.findMany({
      where: {
        estado: { in: ['DRAFT', 'SENT'] },
        fechaVencimiento: { lt: now },
      },
      select: quoteSelect,
    });
    return records.map((r) => this.toDomain(r));
  }

  async requireCustomerExists(customerId: string): Promise<void> {
    const count = await this.prisma.customer.count({
      where: { id: customerId, activo: true },
    });
    if (count === 0) throw new CustomerNotFoundException(customerId);
  }

  async requireProductsExist(productIds: string[], tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    const count = await client.product.count({
      where: { id: { in: productIds }, activo: true },
    });
    if (count !== productIds.length) {
      throw new ProductNotFoundException('Uno o más productos no existen o están inactivos');
    }
  }

  async getProductPrices(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>> {
    const client = this.getClient(tx);
    const products = await client.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, precioVenta: true },
    });
    return new Map(products.map((p) => [p.id, p.precioVenta]));
  }

  async getActiveProductSizes(
    productIds: string[],
    _tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Set<string>>> {
    return new Map(productIds.map((id) => [id, new Set<string>()]));
  }

  private toDomain(record: QuoteRecord): QuoteAggregate {
    const folioStr =
      typeof record.folio === 'number'
        ? Folio.fromSequence('C', record.folio).toString()
        : String(record.folio);
    return new QuoteAggregate({
      id: record.id,
      folio: folioStr,
      status: record.estado,
      customerId: record.cliente.id,
      createdById: null,
      notes: record.notas,
      expiresAt: record.fechaVencimiento,
      subtotal: new Money(record.subtotal),
      discount: new Money(record.descuento),
      tax: Money.zero(),
      total: new Money(record.total),
      createdAt: record.fechaCreacion,
      updatedAt: record.fechaActualizacion,
      items: record.items.map(
        (i) =>
          new QuoteItem({
            id: i.id,
            productId: i.producto.id,
            sizeId: i.talla?.id ?? null,
            quantity: new Quantity(i.cantidad),
            unitPrice: new Money(i.precioUnitario),
            discount: new Money(i.descuento),
            tax: Money.zero(),
          }),
      ),
    });
  }
}
