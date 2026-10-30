import { Prisma } from '../../../generated/prisma/client.js';
import type { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';

export const QUOTE_REPOSITORY_PORT = Symbol('QUOTE_REPOSITORY_PORT');

export interface QuoteQueryFilter {
  status?: string;
  customerId?: string;
  search?: string;
}

export interface QuoteRepositoryPort {
  findById(id: string, tx?: Prisma.TransactionClient): Promise<QuoteAggregate | null>;
  findAll(filter?: QuoteQueryFilter): Promise<QuoteAggregate[]>;
  save(quote: QuoteAggregate, tx?: Prisma.TransactionClient): Promise<unknown>;
  update(
    quote: QuoteAggregate,
    tx?: Prisma.TransactionClient,
    partialData?: unknown,
    selectClause?: unknown,
  ): Promise<unknown>;
  delete(id: string, tx?: Prisma.TransactionClient): Promise<void>;
  requireCustomerExists(customerId: string, tx?: Prisma.TransactionClient): Promise<void>;
  requireProductsExist(productIds: string[], tx?: Prisma.TransactionClient): Promise<void>;
  getProductPrices(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>>;
  /** Active size ids per product; products without active sizes are absent. */
  getActiveProductSizes(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Set<string>>>;
}
