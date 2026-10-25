import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { SaleAggregate } from '../../domain/entities/sale.aggregate.js';
import { saleSelect, type SaleRecord } from '../../quote-records.js';
import type { SaleRepositoryPort } from '../../application/ports/sale-repository.port.js';
import type { InventoryQueryPort } from '../../application/ports/quote-repository.port.js';

@Injectable()
export class PrismaSaleRepository implements SaleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  async findByQuoteId(
    quoteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleAggregate | null> {
    const client = this.getClient(tx);
    const sale = await client.sale.findUnique({
      where: { quoteId },
      select: saleSelect,
    });
    if (!sale) return null;
    return sale as never;
  }

  async save(
    sale: SaleAggregate,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleRecord> {
    const client = this.getClient(tx);
    const created = await client.sale.create({
      data: {
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
            quantity: item.quantity.toDecimal(),
            unitPrice: item.unitPrice.toDecimal(),
            discount: item.discount.toDecimal(),
            tax: item.tax.toDecimal(),
            total: item.total.toDecimal(),
          })),
        },
      },
      select: {
        ...saleSelect,
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

    return created;
  }

  async recordInventoryDeductions(
    items: Array<{
      productId: string;
      quantity: Prisma.Decimal;
      saleId: string;
      createdById: string;
      saleItemId?: string;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    await client.inventoryMovement.createMany({
      data: items.map((item) => ({
        type: 'SALE_OUT',
        quantityChange: item.quantity.negated(),
        productId: item.productId,
        referenceType: 'SALE',
        referenceId: item.saleId,
        createdById: item.createdById,
      })),
    });
  }

  async findRecordById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleRecord | null> {
    const client = this.getClient(tx);
    return client.sale.findUnique({
      where: { id },
      select: saleSelect,
    });
  }
}

@Injectable()
export class PrismaInventoryQueryAdapter implements InventoryQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getStockForProducts(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>> {
    const client = tx ?? this.prisma;
    const stock = await client.inventoryMovement.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { quantityChange: true },
    });
    return new Map(
      stock.map((row) => [
        row.productId,
        row._sum.quantityChange ?? new Prisma.Decimal(0),
      ]),
    );
  }
}
