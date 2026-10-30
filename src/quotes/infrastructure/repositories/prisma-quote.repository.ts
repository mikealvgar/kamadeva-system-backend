import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteItem } from '../../domain/entities/quote-item.entity.js';
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
    return this.prisma.quote.findMany({
      where: {
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.customerId ? { customerId: filter.customerId } : {}),
        ...(filter.search?.trim()
          ? { folio: { contains: filter.search.trim(), mode: 'insensitive' } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: quoteSelect,
    });
  }

  async save(quote: QuoteAggregate, tx?: Prisma.TransactionClient): Promise<QuoteRecord> {
    const client = this.getClient(tx);
    return client.quote.create({
      data: {
        folio: quote.folio.toString(),
        status: quote.status,
        customerId: quote.customerId,
        createdById: quote.createdById,
        notes: quote.notes,
        expiresAt: quote.expiresAt,
        subtotal: quote.subtotal.toDecimal(),
        discount: quote.discount.toDecimal(),
        tax: quote.tax.toDecimal(),
        total: quote.total.toDecimal(),
        items: {
          create: quote.items.map((item) => ({
            productId: item.productId,
            sizeId: item.sizeId,
            quantity: item.quantity.toDecimal(),
            unitPrice: item.unitPrice.toDecimal(),
            discount: item.discount.toDecimal(),
            tax: item.tax.toDecimal(),
            total: item.total.toDecimal(),
          })),
        },
      },
      select: quoteSelect,
    });
  }

  async update(
    quote: QuoteAggregate,
    tx?: Prisma.TransactionClient,
    partialData?: Prisma.QuoteUncheckedUpdateInput,
    selectClause: Prisma.QuoteSelect = quoteSelect,
  ): Promise<QuoteRecord> {
    const client = this.getClient(tx);
    const data: Prisma.QuoteUncheckedUpdateInput = partialData ?? {
      status: quote.status,
      customerId: quote.customerId,
      notes: quote.notes,
      expiresAt: quote.expiresAt,
      subtotal: quote.subtotal.toDecimal(),
      discount: quote.discount.toDecimal(),
      tax: quote.tax.toDecimal(),
      total: quote.total.toDecimal(),
      items: {
        deleteMany: {},
        create: quote.items.map((item) => ({
          productId: item.productId,
          sizeId: item.sizeId,
          quantity: item.quantity.toDecimal(),
          unitPrice: item.unitPrice.toDecimal(),
          discount: item.discount.toDecimal(),
          tax: item.tax.toDecimal(),
          total: item.total.toDecimal(),
        })),
      },
    };
    return client.quote.update({
      where: { id: quote.id },
      data,
      select: selectClause,
    }) as never;
  }

  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.quote.delete({
      where: { id },
      select: { id: true },
    });
  }

  async requireCustomerExists(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    const customer = await client.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new CustomerNotFoundException('Cliente inexistente');
    }
  }

  async requireProductsExist(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    const products = await client.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new ProductNotFoundException('Producto inexistente');
    }
  }

  async getProductPrices(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>> {
    const client = this.getClient(tx);
    const products = await client.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, price: true },
    });
    return new Map(products.map((p) => [p.id, p.price]));
  }

  async getActiveProductSizes(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Set<string>>> {
    const client = this.getClient(tx);
    const links = await client.productSize.findMany({
      where: { productId: { in: productIds }, size: { isActive: true } },
      select: { productId: true, sizeId: true },
    });
    const result = new Map<string, Set<string>>();
    for (const { productId, sizeId } of links) {
      const sizes = result.get(productId) ?? new Set<string>();
      sizes.add(sizeId);
      result.set(productId, sizes);
    }
    return result;
  }

  private toDomain(record: QuoteRecord): QuoteAggregate {
    const items = record.items.map(
      (item) =>
        new QuoteItem({
          id: item.id,
          productId: item.product.id,
          sizeId: item.size?.id ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
        }),
    );

    return new QuoteAggregate({
      id: record.id,
      folio: record.folio,
      status: record.status,
      customerId: record.customer.id,
      notes: record.notes,
      expiresAt: record.expiresAt,
      items,
      subtotal: record.subtotal as never,
      discount: record.discount as never,
      tax: record.tax as never,
      total: record.total as never,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
