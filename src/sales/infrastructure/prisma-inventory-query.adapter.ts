import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { InventoryQueryPort } from '../application/ports/inventory-query.port.js';

@Injectable()
export class PrismaInventoryQueryAdapter implements InventoryQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getStockForProducts(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>> {
    const stock = await (tx ?? this.prisma).inventoryMovement.groupBy({
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
