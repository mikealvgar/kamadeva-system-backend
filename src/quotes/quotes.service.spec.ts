import { randomUUID } from 'node:crypto';
import { Prisma, type QuoteStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuotesService } from './quotes.service.js';
import type { QuoteRecord } from './quote-records.js';

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomUUID: vi.fn(),
}));

const decimal = (value: string | number) => new Prisma.Decimal(value);
const now = new Date('2026-09-20T12:00:00Z');
const customer = {
  id: 'customer',
  name: 'Ana',
  phone: null,
  email: null,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const product = { id: 'product', sku: 'SKU', name: 'Producto', imageUrl: null };
function quote(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'quote',
    folio: 'COT-20260920-ABCDEF',
    status: 'DRAFT',
    customer,
    notes: 'Entrega',
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    subtotal: decimal('3126.25'),
    discount: decimal(100),
    tax: decimal(320),
    total: decimal('3346.25'),
    items: [
      {
        id: 'item',
        product,
        quantity: decimal('2.5'),
        unitPrice: decimal('1250.50'),
        discount: decimal(100),
        tax: decimal(320),
        total: decimal('3346.25'),
      },
    ],
    ...overrides,
  };
}
function dbError(code: string, target?: string[]) {
  return new Prisma.PrismaClientKnownRequestError('database failure', {
    code,
    clientVersion: '7.10.0',
    meta: { target },
  });
}

describe('QuotesService', () => {
  const tx = {
    customer: { findUnique: vi.fn() },
    product: { findMany: vi.fn() },
    quote: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sale: { findUnique: vi.fn(), create: vi.fn() },
    inventoryMovement: { groupBy: vi.fn(), createMany: vi.fn() },
    payment: { create: vi.fn() },
  };
  const prisma = { ...tx, $transaction: vi.fn() };
  const service = new QuotesService(prisma as unknown as PrismaService);
  const input = {
    customerId: 'customer',
    items: [{ productId: 'product', quantity: 2.5, discount: 100, tax: 320 }],
  };
  const payment = { method: 'CASH' as const, amount: 3346.25 };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(randomUUID).mockReturnValue(
      'abcdef12-0000-4000-8000-000000000000',
    );
    prisma.$transaction.mockImplementation(
      async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
    );
    tx.customer.findUnique.mockResolvedValue(customer);
    tx.product.findMany.mockResolvedValue([
      { ...product, price: decimal('1250.50') },
    ]);
    tx.quote.findUnique.mockResolvedValue(quote());
    tx.quote.findMany.mockResolvedValue([quote()]);
    tx.quote.create.mockResolvedValue(quote());
    tx.quote.update.mockResolvedValue(quote());
    tx.sale.findUnique.mockResolvedValue(null);
    tx.sale.create.mockResolvedValue({
      ...quote(),
      id: 'sale',
      folio: 'VEN-20260920-ABCDEF',
      status: 'COMPLETED',
      quoteId: 'quote',
      items: [
        { id: 'sale-item', productId: 'product', quantity: decimal('2.5') },
      ],
    });
    tx.inventoryMovement.groupBy.mockResolvedValue([
      { productId: 'product', _sum: { quantityChange: decimal(10) } },
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it('creates a draft using product prices, exact totals, author and a server folio', async () => {
    const result = await service.create(
      { ...input, notes: ' Entrega ', expiresAt: '2026-09-21T00:00:00Z' },
      'actor',
    );
    expect(tx.quote.create.mock.calls[0]![0].data).toEqual({
      folio: 'COT-20260920-ABCDEF',
      status: 'DRAFT',
      customerId: 'customer',
      createdById: 'actor',
      notes: 'Entrega',
      expiresAt: new Date('2026-09-21T00:00:00Z'),
      subtotal: decimal('3126.25'),
      discount: decimal(100),
      tax: decimal(320),
      total: decimal('3346.25'),
      items: {
        create: [
          {
            productId: 'product',
            quantity: decimal('2.5'),
            unitPrice: decimal('1250.50'),
            discount: decimal(100),
            tax: decimal(320),
            total: decimal('3346.25'),
          },
        ],
      },
    });
    expect(result).toMatchObject({
      canPay: true,
      subtotal: '3126.25',
      total: '3346.25',
      customer: { id: 'customer' },
      items: [{ product, quantity: '2.500', unitPrice: '1250.50' }],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rounds fractional cents per line and sums the stored amounts without floating point drift', async () => {
    tx.product.findMany.mockResolvedValue([
      { ...product, price: decimal('0.10') },
    ]);
    await service.create(
      {
        customerId: 'customer',
        notes: ' ',
        items: [
          { productId: 'product', quantity: 0.15 },
          { productId: 'product', quantity: 0.15 },
        ],
      },
      'actor',
    );
    const data = tx.quote.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      subtotal: decimal('0.04'),
      total: decimal('0.04'),
      discount: decimal(0),
      tax: decimal(0),
      expiresAt: null,
      notes: null,
    });
    expect(
      data.items.create.map((item: { total: Prisma.Decimal }) =>
        item.total.toFixed(2),
      ),
    ).toEqual(['0.02', '0.02']);
  });

  it.each([
    ['quantity', 99999999999.999],
    ['discount', 9999999999.99],
    ['tax', 9999999999.99],
  ] as const)(
    'rejects calculated overflow or negative total from %s',
    async (key, value) => {
      await expect(
        service.create(
          { ...input, items: [{ ...input.items[0]!, [key]: value }] },
          'actor',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(tx.quote.create).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-09-19T00:00:00Z', now.toISOString(), 'invalid'])(
    'rejects nonfuture or unsupported date %s',
    async (expiresAt) => {
      await expect(
        service.create({ ...input, expiresAt }, 'actor'),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.update('quote', { expiresAt }),
      ).rejects.toMatchObject({ status: 400 });
      expect(tx.quote.create).not.toHaveBeenCalled();
      expect(tx.quote.update).not.toHaveBeenCalled();
    },
  );

  it('returns 404 for missing customers and products without writing', async () => {
    tx.customer.findUnique.mockResolvedValue(null);
    await expect(service.create(input, 'actor')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.findAll({ customerId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update('quote', { customerId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 });
    tx.customer.findUnique.mockResolvedValue(customer);
    tx.product.findMany.mockResolvedValue([]);
    await expect(service.create(input, 'actor')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.update('quote', { items: input.items }),
    ).rejects.toMatchObject({ status: 404 });
    expect(tx.quote.create).not.toHaveBeenCalled();
    expect(tx.quote.update).not.toHaveBeenCalled();
  });

  it.each(['create', 'pay'] as const)(
    'retries %s once with a new folio in a fresh transaction',
    async (action) => {
      const create = action === 'create' ? tx.quote.create : tx.sale.create;
      create.mockRejectedValueOnce(dbError('P2002', ['folio']));
      vi.mocked(randomUUID)
        .mockReturnValueOnce('aaaaaa12-0000-4000-8000-000000000000')
        .mockReturnValueOnce('bbbbbb12-0000-4000-8000-000000000000');
      if (action === 'create') await service.create(input, 'actor');
      else await service.pay('quote', payment, 'actor');
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(create.mock.calls.map((call) => call[0].data.folio)).toEqual([
        `${action === 'create' ? 'COT' : 'VEN'}-20260920-AAAAAA`,
        `${action === 'create' ? 'COT' : 'VEN'}-20260920-BBBBBB`,
      ]);
    },
  );

  it.each([{ index: 'quotes_folio_key' }, { fields: ['folio'] }])(
    'recognizes Prisma 7 adapter folio constraints %s',
    async (constraint) => {
      tx.quote.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('collision', {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: {
            driverAdapterError: {
              cause: { kind: 'UniqueConstraintViolation', constraint },
            },
          },
        }),
      );
      await service.create(input, 'actor');
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('stops after a second folio collision and does not retry other unique constraints', async () => {
    tx.quote.create.mockRejectedValue(dbError('P2002', ['folio']));
    await expect(service.create(input, 'actor')).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    prisma.$transaction.mockClear();
    tx.sale.create.mockRejectedValue(dbError('P2002', ['quoteId']));
    await expect(service.pay('quote', payment, 'actor')).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('updates draft metadata without repricing and replaces all items when provided', async () => {
    await service.update('quote', { notes: ' ', customerId: 'customer' });
    expect(tx.quote.update.mock.calls[0]![0].data).toEqual({
      notes: null,
      customerId: 'customer',
    });
    expect(tx.product.findMany).not.toHaveBeenCalled();
    tx.product.findMany.mockResolvedValue([{ ...product, price: decimal(10) }]);
    await service.update('quote', {
      items: [{ productId: 'product', quantity: 3 }],
    });
    expect(tx.quote.update.mock.calls[1]![0].data).toEqual({
      subtotal: decimal(30),
      discount: decimal(0),
      tax: decimal(0),
      total: decimal(30),
      items: {
        deleteMany: {},
        create: [
          {
            productId: 'product',
            quantity: decimal(3),
            unitPrice: decimal(10),
            discount: decimal(0),
            tax: decimal(0),
            total: decimal(30),
          },
        ],
      },
    });
  });

  it('rejects an empty update', async () => {
    await expect(service.update('quote', {})).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    'SENT',
    'CONVERTED',
    'ACCEPTED',
    'CANCELLED',
    'EXPIRED',
    'REJECTED',
  ] as const)('forbids edit, send and delete in %s', async (status) => {
    tx.quote.findUnique.mockResolvedValue(quote({ status }));
    await expect(
      service.update('quote', { notes: 'edit' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.send('quote')).rejects.toMatchObject({ status: 409 });
    await expect(service.delete('quote')).rejects.toMatchObject({
      status: 409,
    });
    expect(tx.quote.update).not.toHaveBeenCalled();
    expect(tx.quote.delete).not.toHaveBeenCalled();
  });

  it('sends a draft without sale, payment or inventory effects and deletes drafts', async () => {
    tx.quote.update.mockResolvedValue(quote({ status: 'SENT' }));
    expect(await service.send('quote')).toMatchObject({
      status: 'SENT',
      canPay: true,
    });
    expect(tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SENT' } }),
    );
    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.createMany).not.toHaveBeenCalled();
    await service.delete('quote');
    expect(tx.quote.delete).toHaveBeenCalledWith({
      where: { id: 'quote' },
      select: { id: true },
    });
  });

  it.each<[QuoteStatus, Date | null, boolean]>([
    ['DRAFT', null, true],
    ['SENT', new Date(now.getTime() + 1), true],
    ['CONVERTED', null, false],
    ['DRAFT', new Date(now.getTime() - 1), false],
    ['SENT', now, false],
    ['ACCEPTED', null, false],
  ])(
    'calculates canPay for %s with expiration %s',
    async (status, expiresAt, canPay) => {
      tx.quote.findUnique.mockResolvedValue(quote({ status, expiresAt }));
      expect(await service.findById('quote')).toMatchObject({ canPay });
    },
  );

  it('combines list filters, sorts newest first and serializes empty lists', async () => {
    expect(
      await service.findAll({
        status: 'DRAFT',
        customerId: 'customer',
        search: ' abc ',
      }),
    ).toHaveLength(1);
    expect(tx.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'DRAFT',
          customerId: 'customer',
          folio: { contains: 'abc', mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    tx.quote.findMany.mockResolvedValue([]);
    expect(await service.findAll()).toEqual([]);
  });

  it.each(['DRAFT', 'SENT'] as const)(
    'pays %s preserving original prices and totals and creates the entire conversion',
    async (status) => {
      tx.quote.findUnique.mockResolvedValue(
        quote({
          status,
          expiresAt: status === 'DRAFT' ? null : new Date(now.getTime() + 1),
        }),
      );
      const result = await service.pay('quote', payment, 'actor');
      expect(result).toMatchObject({
        id: 'sale',
        status: 'COMPLETED',
        quoteId: 'quote',
        total: '3346.25',
      });
      expect(result).not.toHaveProperty('items');
      expect(result).not.toHaveProperty('createdById');
      expect(tx.sale.create.mock.calls[0]![0].data).toEqual({
        folio: 'VEN-20260920-ABCDEF',
        status: 'COMPLETED',
        customerId: 'customer',
        quoteId: 'quote',
        createdById: 'actor',
        notes: 'Entrega',
        subtotal: decimal('3126.25'),
        discount: decimal(100),
        tax: decimal(320),
        total: decimal('3346.25'),
        items: {
          create: [
            {
              productId: 'product',
              quantity: decimal('2.5'),
              unitPrice: decimal('1250.50'),
              discount: decimal(100),
              tax: decimal(320),
              total: decimal('3346.25'),
            },
          ],
        },
      });
      expect(tx.product.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['product'] } },
        select: { id: true },
      });
      expect(tx.inventoryMovement.createMany).toHaveBeenCalledWith({
        data: [
          {
            type: 'SALE_OUT',
            quantityChange: decimal('-2.5'),
            productId: 'product',
            saleItemId: 'sale-item',
            referenceType: 'SALE',
            referenceId: 'sale',
            createdById: 'actor',
          },
        ],
      });
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: {
          saleId: 'sale',
          method: 'CASH',
          amount: decimal('3346.25'),
          status: 'PAID',
          createdById: 'actor',
          paidAt: now,
        },
        select: { id: true },
      });
      expect(tx.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote' },
        data: { status: 'CONVERTED' },
        select: { id: true },
      });
    },
  );

  it.each([new Date(now.getTime() - 1), now])(
    'blocks expiration %s before any conversion effects',
    async (expiresAt) => {
      tx.quote.findUnique.mockResolvedValue(quote({ expiresAt }));
      await expect(
        service.pay('quote', payment, 'actor'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'La cotización ha expirado',
      });
      expect(tx.sale.create).not.toHaveBeenCalled();
      expect(tx.payment.create).not.toHaveBeenCalled();
      expect(tx.inventoryMovement.createMany).not.toHaveBeenCalled();
      expect(tx.quote.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    'CONVERTED',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED',
    'CANCELLED',
  ] as const)('rejects payment for %s', async (status) => {
    tx.quote.findUnique.mockResolvedValue(quote({ status }));
    await expect(service.pay('quote', payment, 'actor')).rejects.toMatchObject({
      status: 409,
    });
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it('rejects a preexisting conversion even if draft status is inconsistent', async () => {
    tx.sale.findUnique.mockResolvedValue({ id: 'previous' });
    await expect(service.pay('quote', payment, 'actor')).rejects.toMatchObject({
      status: 409,
    });
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it.each([0, 3346.24, 3346.26])(
    'rejects mismatched payment %s',
    async (amount) => {
      await expect(
        service.pay('quote', { ...payment, amount }, 'actor'),
      ).rejects.toMatchObject({ status: 400 });
      expect(tx.sale.create).not.toHaveBeenCalled();
    },
  );

  it('sums repeated product quantities and returns a generic stock conflict', async () => {
    const original = quote();
    tx.quote.findUnique.mockResolvedValue(
      quote({ items: [...original.items, ...original.items] }),
    );
    tx.inventoryMovement.groupBy.mockResolvedValue([
      { productId: 'product', _sum: { quantityChange: decimal(4) } },
    ]);
    await expect(service.pay('quote', payment, 'actor')).rejects.toMatchObject({
      status: 409,
      message: 'Sin inventario suficiente',
    });
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it('treats no movements as zero stock and verifies product existence', async () => {
    tx.inventoryMovement.groupBy.mockResolvedValue([]);
    await expect(service.pay('quote', payment, 'actor')).rejects.toMatchObject({
      status: 409,
    });
    tx.product.findMany.mockResolvedValue([]);
    await expect(service.pay('quote', payment, 'actor')).rejects.toMatchObject({
      status: 404,
    });
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it.each(['sale', 'inventoryMovement', 'payment', 'quote'] as const)(
    'propagates %s failures out of the transaction for rollback',
    async (model) => {
      const failure = new Error('injected failure');
      const method =
        model === 'quote'
          ? tx.quote.update
          : model === 'inventoryMovement'
            ? tx.inventoryMovement.createMany
            : tx[model].create;
      method.mockRejectedValue(failure);
      await expect(service.pay('quote', payment, 'actor')).rejects.toBe(
        failure,
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      if (model !== 'quote') expect(tx.quote.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['P2025', 404],
    ['P2003', 409],
  ] as const)('maps %s', async (code, status) => {
    tx.quote.delete.mockRejectedValue(dbError(code));
    await expect(service.delete('quote')).rejects.toMatchObject({ status });
  });

  it('returns 404 for missing quotes across operations', async () => {
    tx.quote.findUnique.mockResolvedValue(null);
    for (const operation of [
      () => service.findById('missing'),
      () => service.update('missing', { notes: 'x' }),
      () => service.send('missing'),
      () => service.delete('missing'),
      () => service.pay('missing', payment, 'actor'),
    ]) {
      await expect(operation()).rejects.toMatchObject({ status: 404 });
    }
  });
});
