import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../../../common/application/unit-of-work.port.js';
import { isValidSizeSelection } from '../../../catalog/sizes/size-selection.js';
import {
  IdempotencyKeyRaceException,
  IdempotencyKeyReuseException,
  InactiveProductException,
  SaleCustomerNotFoundException,
  SalePaymentMismatchException,
  SaleProductNotFoundException,
  SaleSizeSelectionException,
} from '../../domain/sale-exceptions.js';
import {
  SaleAggregate,
  SaleItem,
  type PaymentMethod,
} from '../../domain/sale.aggregate.js';
import {
  IDEMPOTENCY_STORE_PORT,
  type IdempotencyStorePort,
} from '../ports/idempotency-store.port.js';
import {
  SALE_CATALOG_PORT,
  type SaleCatalogPort,
} from '../ports/sale-catalog.port.js';
import {
  SALE_QUERY_PORT,
  type SaleDetailView,
  type SaleQueryPort,
} from '../ports/sale-query.port.js';
import { RegisterSaleUseCase } from './register-sale.use-case.js';

export const CREATE_SALE_SCOPE = 'sales.create';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface CreateSaleCommand {
  idempotencyKey: string;
  actorId: string;
  customerId?: string;
  notes?: string;
  items: Array<{
    productId: string;
    sizeId?: string;
    quantity: number;
    discount?: number;
    tax?: number;
  }>;
  payment: { method: PaymentMethod; amount: number };
}

export interface CreateSaleResult {
  sale: SaleDetailView;
  /** True when an earlier identical request's stored response is returned. */
  replayed: boolean;
}

/** Key-order independent JSON so equivalent bodies hash the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class CreateSaleUseCase {
  constructor(
    private readonly registerSale: RegisterSaleUseCase,
    @Inject(SALE_CATALOG_PORT)
    private readonly catalog: SaleCatalogPort,
    @Inject(SALE_QUERY_PORT)
    private readonly saleQuery: SaleQueryPort,
    @Inject(IDEMPOTENCY_STORE_PORT)
    private readonly idempotency: IdempotencyStorePort,
    @Inject(UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(command: CreateSaleCommand): Promise<CreateSaleResult> {
    const requestHash = createHash('sha256')
      .update(
        canonical({
          customerId: command.customerId,
          notes: command.notes,
          items: command.items,
          payment: command.payment,
        }),
      )
      .digest('hex');
    // Resolved outside the sale transaction; it runs its own.
    const customerId =
      command.customerId ?? (await this.catalog.defaultCustomerId());

    // A concurrent duplicate that loses the insert race replays on the retry.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.unitOfWork.execute((tx) =>
          this.run(command, customerId, requestHash, tx),
        );
      } catch (error) {
        if (attempt === 0 && error instanceof IdempotencyKeyRaceException)
          continue;
        throw error;
      }
    }
  }

  private async run(
    command: CreateSaleCommand,
    customerId: string,
    requestHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CreateSaleResult> {
    const stored = await this.idempotency.find(
      CREATE_SALE_SCOPE,
      command.idempotencyKey,
      tx,
    );
    if (stored && stored.expiresAt.getTime() <= Date.now()) {
      await this.idempotency.remove(
        CREATE_SALE_SCOPE,
        command.idempotencyKey,
        tx,
      );
    } else if (stored) {
      if (
        stored.requestHash !== requestHash ||
        stored.userId !== command.actorId
      ) {
        throw new IdempotencyKeyReuseException(
          'La llave de idempotencia ya se usó con otra solicitud',
        );
      }
      return { sale: stored.responseBody as SaleDetailView, replayed: true };
    }

    if (!(await this.catalog.customerExists(customerId, tx))) {
      throw new SaleCustomerNotFoundException('Cliente inexistente');
    }
    const productIds = [
      ...new Set(command.items.map((item) => item.productId)),
    ];
    const products = await this.catalog.getProducts(productIds, tx);
    const items = command.items.map((input) => {
      const product = products.get(input.productId);
      if (!product) {
        throw new SaleProductNotFoundException('Producto inexistente');
      }
      if (!product.isActive) {
        throw new InactiveProductException('Producto inactivo');
      }
      if (!isValidSizeSelection(input.sizeId, product.activeSizeIds)) {
        throw new SaleSizeSelectionException('Talla inválida para el producto');
      }
      return new SaleItem({
        productId: input.productId,
        sizeId: input.sizeId,
        quantity: input.quantity,
        unitPrice: product.price,
        discount: input.discount,
        tax: input.tax,
      });
    });
    const totals = SaleAggregate.totalsOf(items);
    if (!totals.total.equals(command.payment.amount)) {
      throw new SalePaymentMismatchException(
        'El importe debe coincidir con el total de la venta',
      );
    }

    const sale = await this.registerSale.execute(
      {
        customerId,
        createdById: command.actorId,
        notes: command.notes?.trim() || null,
        items,
        totals,
        paymentMethod: command.payment.method,
      },
      tx,
    );
    const detail = await this.saleQuery.findDetail(sale.id, tx);
    if (!detail) throw new Error('Venta registrada no encontrada');
    await this.idempotency.saveCompleted(
      {
        scope: CREATE_SALE_SCOPE,
        key: command.idempotencyKey,
        requestHash,
        userId: command.actorId,
        responseStatusCode: 201,
        responseBody: detail,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
      tx,
    );
    return { sale: detail, replayed: false };
  }
}
