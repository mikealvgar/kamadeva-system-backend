import { Prisma } from '../../../generated/prisma/client.js';

export const INVENTORY_QUERY_PORT = Symbol('INVENTORY_QUERY_PORT');

export interface InventoryQueryPort {
  getStockForProducts(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>>;
}
