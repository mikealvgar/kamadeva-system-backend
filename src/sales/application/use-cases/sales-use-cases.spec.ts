import { Prisma } from '../../../generated/prisma/client.js';
import type { FolioSequencePort } from '../../../common/application/folio-sequence.port.js';
import type { UnitOfWorkPort } from '../../../common/application/unit-of-work.port.js';
import { Folio, type FolioSeries } from '../../../common/domain/folio.js';
import { Money } from '../../../common/domain/money.js';
import {
  IdempotencyKeyRaceException,
  IdempotencyKeyReuseException,
  InactiveProductException,
  InsufficientStockException,
  SaleCustomerNotFoundException,
  SaleNotCancellableException,
  SaleNotFoundException,
  SalePaymentMismatchException,
  SaleProductNotFoundException,
  SaleSizeSelectionException,
} from '../../domain/sale-exceptions.js';
import { SaleAggregate, SaleItem } from '../../domain/sale.aggregate.js';
import type {
  IdempotencyStorePort,
  StoredIdempotentResponse,
} from '../ports/idempotency-store.port.js';
import type { InventoryQueryPort } from '../ports/inventory-query.port.js';
import type {
  SaleCatalogPort,
  SellableProduct,
} from '../ports/sale-catalog.port.js';
import type {
  SaleDetailView,
  SalePage,
  SaleQueryPort,
} from '../ports/sale-query.port.js';
import type { SaleRepositoryPort } from '../ports/sale-repository.port.js';
import { CancelSaleUseCase } from './cancel-sale.use-case.js';
import {
  CREATE_SALE_SCOPE,
  CreateSaleUseCase,
  type CreateSaleCommand,
} from './create-sale.use-case.js';
import { RegisterSaleUseCase } from './register-sale.use-case.js';

const decimal = (value: string | number) => new Prisma.Decimal(value);

class FakeSaleRepo implements SaleRepositoryPort {
  sales = new Map<string, SaleAggregate>();
  cancellations: SaleAggregate[] = [];

  async save(sale: SaleAggregate): Promise<void> {
    this.sales.set(sale.id, sale);
  }
  async existsForQuote(quoteId: string): Promise<boolean> {
    return [...this.sales.values()].some((sale) => sale.quoteId === quoteId);
  }
  async findForCancellation(id: string): Promise<SaleAggregate | null> {
    return this.sales.get(id) ?? null;
  }
  async saveCancellation(sale: SaleAggregate): Promise<void> {
    this.cancellations.push(sale);
  }
}

class FakeInventory implements InventoryQueryPort {
  stock = new Map<string, Prisma.Decimal>([
    ['plain', decimal(10)],
    ['sized', decimal(5)],
  ]);
  async getStockForProducts(ids: string[]) {
    return new Map(ids.map((id) => [id, this.stock.get(id) ?? decimal(0)]));
  }
}

class FakeFolios implements FolioSequencePort {
  counters = new Map<FolioSeries, number>();
  async next(series: FolioSeries): Promise<Folio> {
    const value = (this.counters.get(series) ?? 0) + 1;
    this.counters.set(series, value);
    return Folio.fromSequence(series, value);
  }
}

class FakeCatalog implements SaleCatalogPort {
  products = new Map<string, SellableProduct>([
    [
      'plain',
      { price: decimal('100.00'), isActive: true, activeSizeIds: new Set() },
    ],
    [
      'sized',
      {
        price: decimal('299.00'),
        isActive: true,
        activeSizeIds: new Set(['m']),
      },
    ],
    [
      'inactive',
      { price: decimal('1.00'), isActive: false, activeSizeIds: new Set() },
    ],
  ]);
  customers = new Set(['customer', 'default']);
  defaultRequests = 0;
  async getProducts(ids: string[]) {
    return new Map(
      ids.flatMap((id) => {
        const product = this.products.get(id);
        return product ? [[id, product] as const] : [];
      }),
    );
  }
  async customerExists(id: string) {
    return this.customers.has(id);
  }
  async defaultCustomerId() {
    this.defaultRequests++;
    return 'default';
  }
}

/** Renders a minimal detail from the fake repository. */
class FakeQuery implements SaleQueryPort {
  constructor(private readonly repo: FakeSaleRepo) {}
  async findDetail(id: string): Promise<SaleDetailView | null> {
    const sale = this.repo.sales.get(id);
    if (!sale) return null;
    return {
      id: sale.id,
      folio: sale.folio.toString(),
      status: sale.status,
      customer: sale.customerId ? { id: sale.customerId, name: 'C' } : null,
      createdBy: null,
      quoteId: sale.quoteId,
      notes: sale.notes,
      subtotal: sale.subtotal.toString(),
      discount: sale.discount.toString(),
      tax: sale.tax.toString(),
      total: sale.total.toString(),
      items: [],
      payments: [],
      cancelledAt: sale.cancellation?.cancelledAt.toISOString() ?? null,
      cancelledBy: null,
      cancelReason: sale.cancellation?.reason ?? null,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
    };
  }
  async list(): Promise<SalePage> {
    return { data: [], total: 0, page: 1, pageSize: 20 };
  }
}

class FakeIdempotency implements IdempotencyStorePort {
  records = new Map<string, StoredIdempotentResponse>();
  raceOnce = false;
  async find(scope: string, key: string) {
    return this.records.get(`${scope}:${key}`) ?? null;
  }
  async remove(scope: string, key: string) {
    this.records.delete(`${scope}:${key}`);
  }
  async saveCompleted(
    record: StoredIdempotentResponse & { scope: string; key: string },
  ) {
    if (this.raceOnce) {
      this.raceOnce = false;
      throw new IdempotencyKeyRaceException();
    }
    this.records.set(`${record.scope}:${record.key}`, record);
  }
}

class DirectUnitOfWork implements UnitOfWorkPort {
  async execute<T>(work: (tx?: Prisma.TransactionClient) => Promise<T>) {
    return work();
  }
}

describe('Sales use cases', () => {
  let repo: FakeSaleRepo;
  let inventory: FakeInventory;
  let folios: FakeFolios;
  let catalog: FakeCatalog;
  let idempotency: FakeIdempotency;
  let register: RegisterSaleUseCase;
  let createSale: CreateSaleUseCase;
  const command = (
    overrides: Partial<CreateSaleCommand> = {},
  ): CreateSaleCommand => ({
    idempotencyKey: 'key-1',
    actorId: 'seller',
    customerId: 'customer',
    items: [
      { productId: 'sized', sizeId: 'm', quantity: 2 },
      { productId: 'plain', quantity: 1, discount: 10, tax: 5 },
    ],
    payment: { method: 'CASH', amount: 693 },
    ...overrides,
  });

  beforeEach(() => {
    repo = new FakeSaleRepo();
    inventory = new FakeInventory();
    folios = new FakeFolios();
    catalog = new FakeCatalog();
    idempotency = new FakeIdempotency();
    register = new RegisterSaleUseCase(repo, inventory, folios);
    createSale = new CreateSaleUseCase(
      register,
      catalog,
      new FakeQuery(repo),
      idempotency,
      new DirectUnitOfWork(),
    );
  });

  describe('RegisterSaleUseCase', () => {
    const items = () => [
      new SaleItem({ productId: 'plain', quantity: 6, unitPrice: 1 }),
      new SaleItem({ productId: 'plain', quantity: 4, unitPrice: 1 }),
    ];

    it('records a completed, fully paid sale with a V- folio', async () => {
      const lines = items();
      const sale = await register.execute({
        customerId: 'customer',
        createdById: 'seller',
        items: lines,
        totals: SaleAggregate.totalsOf(lines),
        paymentMethod: 'CARD',
      });
      expect(sale.folio.toString()).toBe('V-000001');
      expect(sale.status).toBe('COMPLETED');
      expect(sale.payment).toMatchObject({
        method: 'CARD',
        status: 'PAID',
        saleId: sale.id,
      });
      expect(sale.payment!.amount.toString()).toBe('10.00');
      expect(repo.sales.get(sale.id)).toBe(sale);
    });

    it('sums repeated products against stock and reserves no folio on shortage', async () => {
      const lines = [
        ...items(),
        new SaleItem({ productId: 'plain', quantity: '0.001', unitPrice: 1 }),
      ];
      await expect(
        register.execute({
          customerId: null,
          createdById: 'seller',
          items: lines,
          totals: SaleAggregate.totalsOf(lines),
          paymentMethod: 'CASH',
        }),
      ).rejects.toThrow(InsufficientStockException);
      expect(folios.counters.size).toBe(0);
      expect(repo.sales.size).toBe(0);
    });
  });

  describe('CreateSaleUseCase', () => {
    it('prices lines from the catalog and stores the response for replay', async () => {
      const result = await createSale.execute(command());
      expect(result.replayed).toBe(false);
      expect(result.sale).toMatchObject({
        folio: 'V-000001',
        status: 'COMPLETED',
        subtotal: '698.00',
        discount: '10.00',
        tax: '5.00',
        total: '693.00',
        customer: { id: 'customer' },
      });
      const sale = repo.sales.get(result.sale.id)!;
      expect(sale.items.map((item) => item.sizeId)).toEqual(['m', null]);
      expect(sale.items.map((item) => item.unitPrice.toString())).toEqual([
        '299.00',
        '100.00',
      ]);
      expect(
        idempotency.records.get(`${CREATE_SALE_SCOPE}:key-1`),
      ).toMatchObject({
        userId: 'seller',
        responseStatusCode: 201,
        responseBody: result.sale,
      });
    });

    it('replays the same body without a second sale or folio', async () => {
      const first = await createSale.execute(command());
      // Same content with different key order hashes the same.
      const second = await createSale.execute(
        command({ payment: { amount: 693, method: 'CASH' } }),
      );
      expect(second).toEqual({ sale: first.sale, replayed: true });
      expect(repo.sales.size).toBe(1);
      expect(folios.counters.get('V')).toBe(1);
    });

    it.each([
      ['another body', command({ notes: 'otra' })],
      ['another user', command({ actorId: 'other-seller' })],
    ])('rejects a reused key with %s', async (_label, reused) => {
      await createSale.execute(command());
      await expect(createSale.execute(reused)).rejects.toThrow(
        IdempotencyKeyReuseException,
      );
      expect(repo.sales.size).toBe(1);
    });

    it('treats an expired key as unused', async () => {
      await createSale.execute(command());
      const stored = idempotency.records.get(`${CREATE_SALE_SCOPE}:key-1`)!;
      stored.expiresAt = new Date(Date.now() - 1);
      const again = await createSale.execute(command({ notes: 'otra' }));
      expect(again.replayed).toBe(false);
      expect(repo.sales.size).toBe(2);
    });

    it('retries once after losing the idempotency insert race', async () => {
      idempotency.raceOnce = true;
      const result = await createSale.execute(command());
      expect(result.replayed).toBe(false);
      expect(idempotency.records.size).toBe(1);
    });

    it('uses the default customer when none is supplied', async () => {
      const result = await createSale.execute(
        command({ customerId: undefined }),
      );
      expect(catalog.defaultRequests).toBe(1);
      expect(result.sale.customer).toMatchObject({ id: 'default' });
      await createSale.execute(command({ idempotencyKey: 'key-2' }));
      expect(catalog.defaultRequests).toBe(1);
    });

    it.each([
      [
        'missing customer',
        command({ customerId: 'missing' }),
        SaleCustomerNotFoundException,
      ],
      [
        'missing product',
        command({ items: [{ productId: 'missing', quantity: 1 }] }),
        SaleProductNotFoundException,
      ],
      [
        'inactive product',
        command({ items: [{ productId: 'inactive', quantity: 1 }] }),
        InactiveProductException,
      ],
      [
        'missing size',
        command({ items: [{ productId: 'sized', quantity: 1 }] }),
        SaleSizeSelectionException,
      ],
      [
        'size on a product without sizes',
        command({ items: [{ productId: 'plain', sizeId: 'm', quantity: 1 }] }),
        SaleSizeSelectionException,
      ],
      [
        'payment below total',
        command({ payment: { method: 'CASH', amount: 692.99 } }),
        SalePaymentMismatchException,
      ],
      [
        'insufficient stock',
        command({
          items: [{ productId: 'plain', quantity: 11 }],
          payment: { method: 'CASH', amount: 1100 },
        }),
        InsufficientStockException,
      ],
    ])('rejects %s without side effects', async (_label, input, error) => {
      await expect(createSale.execute(input)).rejects.toThrow(error);
      expect(repo.sales.size).toBe(0);
      expect(idempotency.records.size).toBe(0);
      expect(folios.counters.size).toBe(0);
    });
  });

  describe('CancelSaleUseCase', () => {
    let cancel: CancelSaleUseCase;
    beforeEach(() => {
      cancel = new CancelSaleUseCase(
        repo,
        new FakeQuery(repo),
        new DirectUnitOfWork(),
      );
    });

    it('cancels once and repeats without new side effects', async () => {
      const { sale } = await createSale.execute(command());
      const first = await cancel.execute(sale.id, {
        actorId: 'admin',
        reason: ' Devolución ',
      });
      expect(first).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Devolución',
      });
      const again = await cancel.execute(sale.id, {
        actorId: 'admin',
        reason: 'otra',
      });
      expect(again).toEqual(first);
      expect(repo.cancellations).toHaveLength(1);
    });

    it('reports a missing sale', async () => {
      await expect(
        cancel.execute('missing', { actorId: 'admin', reason: 'x' }),
      ).rejects.toThrow(SaleNotFoundException);
    });
  });
});

describe('SaleAggregate', () => {
  const sale = (status: 'PENDING' | 'COMPLETED' | 'REFUNDED') =>
    new SaleAggregate({
      folio: 'V-000001',
      status,
      subtotal: Money.zero(),
      discount: Money.zero(),
      tax: Money.zero(),
      total: Money.zero(),
      items: [],
    });

  it('only cancels completed sales', () => {
    expect(() => sale('PENDING').cancel('a', 'r')).toThrow(
      SaleNotCancellableException,
    );
    expect(() => sale('REFUNDED').cancel('a', 'r')).toThrow(
      SaleNotCancellableException,
    );
    const completed = sale('COMPLETED');
    expect(completed.cancel('a', ' r ', new Date(0))).toBe(true);
    expect(completed.cancellation).toEqual({
      cancelledAt: new Date(0),
      cancelledById: 'a',
      reason: 'r',
    });
    expect(completed.cancel('b', 'again')).toBe(false);
    expect(completed.cancellation?.cancelledById).toBe('a');
  });

  it('computes line totals and rejects a discount above the line subtotal', () => {
    const line = new SaleItem({
      productId: 'p',
      quantity: '2.5',
      unitPrice: '1250.50',
      discount: 100,
      tax: 320,
    });
    expect(line.total.toString()).toBe('3346.25');
    expect(
      () =>
        new SaleItem({
          productId: 'p',
          quantity: 1,
          unitPrice: 1,
          discount: 2,
        }),
    ).toThrow('Importe fuera de rango');
    expect(SaleAggregate.totalsOf([line, line]).total.toString()).toBe(
      '6692.50',
    );
  });
});
