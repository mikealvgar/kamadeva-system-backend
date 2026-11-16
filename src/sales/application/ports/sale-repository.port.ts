import { Prisma } from '../../../generated/prisma/client.js';
import type { SaleAggregate } from '../../domain/sale.aggregate.js';

export const SALE_REPOSITORY_PORT = Symbol('SALE_REPOSITORY_PORT');

export interface SaleRepositoryPort {
  /** Persist sale, lines, SALE_OUT movements and payment. */
  save(sale: SaleAggregate, tx?: Prisma.TransactionClient): Promise<void>;
  existsForQuote(
    quoteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean>;
  /** Load a sale with line ids and payments, ready to cancel. */
  findForCancellation(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleAggregate | null>;
  /** Persist cancellation fields, RETURN_IN movements and refunded payments. */
  saveCancellation(
    sale: SaleAggregate,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
