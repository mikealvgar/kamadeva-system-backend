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
      by: ['productoId'],
      where: { productoId: { in: productIds } },
      _sum: { cambioExistencias: true },
    });
    return new Map(
      stock.map((row) => [
        row.productoId,
        row._sum.cambioExistencias ?? new Prisma.Decimal(0),
      ]),
    );
  }
}
