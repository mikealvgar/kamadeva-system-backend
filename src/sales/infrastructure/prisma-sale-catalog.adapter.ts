import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CustomersService } from '../../customers/customers.service.js';
import type {
  SaleCatalogPort,
  SellableProduct,
} from '../application/ports/sale-catalog.port.js';

@Injectable()
export class PrismaSaleCatalogAdapter implements SaleCatalogPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  async getProducts(
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, SellableProduct>> {
    const products = await (tx ?? this.prisma).product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        precioVenta: true,
        activo: true,
      },
    });
    return new Map(
      products.map((product) => [
        product.id,
        {
          price: product.precioVenta,
          isActive: product.activo,
          activeSizeIds: new Set<string>(),
        },
      ]),
    );
  }

  async customerExists(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const customer = await (tx ?? this.prisma).customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    return customer !== null;
  }

  async defaultCustomerId(): Promise<string> {
    return (await this.customers.ensureDefaultCustomer()).id;
  }
}
