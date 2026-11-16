import { Prisma } from '../../../generated/prisma/client.js';

export const SALE_CATALOG_PORT = Symbol('SALE_CATALOG_PORT');

export interface SellableProduct {
  price: Prisma.Decimal;
  isActive: boolean;
  activeSizeIds: ReadonlySet<string>;
}

export interface SaleCatalogPort {
  /** Products found by id; missing ids are absent from the map. */
  getProducts(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, SellableProduct>>;
  customerExists(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean>;
  /** Default "Público general" customer for sales without a customer. */
  defaultCustomerId(): Promise<string>;
}
