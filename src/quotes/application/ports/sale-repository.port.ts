import { Prisma } from '../../../generated/prisma/client.js';
import type { SaleAggregate } from '../../domain/entities/sale.aggregate.js';

export const SALE_REPOSITORY_PORT = Symbol('SALE_REPOSITORY_PORT');

export interface SaleRepositoryPort {
  save(sale: SaleAggregate, tx?: Prisma.TransactionClient): Promise<unknown>;
  findByQuoteId(
    quoteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleAggregate | null>;
  recordInventoryDeductions(
    items: Array<{
      productId: string;
      quantity: Prisma.Decimal;
      saleId: string;
      createdById: string;
      saleItemId?: string;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
