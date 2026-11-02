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
  nombre: 'Ana',
  telefono: null,
  correo: null,
  activo: true,
  esPredeterminado: false,
  fechaCreacion: now,
  fechaActualizacion: now,
};
const product = {
  id: 'product',
  codigoBarras: 'SKU',
  nombre: 'Producto',
  imageUrl: null,
  precioVenta: decimal('1250.50'),
  precioCompra: decimal('700.00'),
  activo: true,
};

function quote(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'quote',
    folio: 1,
    estado: 'DRAFT',
    cliente: customer,
    notas: 'Entrega',
    fechaVencimiento: null,
    fechaCreacion: now,
    fechaActualizacion: now,
    subtotal: decimal('3126.25'),
    descuento: decimal(100),
    total: decimal('3026.25'),
    items: [
      {
        id: 'item',
        producto: product,
        talla: { id: 'size', nombre: 'M' },
        cantidad: decimal('2.5'),
        precioUnitario: decimal('1250.50'),
        descuento: decimal(100),
        total: decimal('3026.25'),
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
    customer: { findUnique: vi.fn(), count: vi.fn() },
    product: { findMany: vi.fn(), count: vi.fn() },
    quote: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    quoteItem: { deleteMany: vi.fn() },
    sale: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    inventoryMovement: { groupBy: vi.fn(), createMany: vi.fn() },
  };
  const prisma = { ...tx, $transaction: vi.fn() };
  const service = new QuotesService(prisma as unknown as PrismaService);
  const input = {
    customerId: 'customer',
    items: [{ productId: 'product', quantity: 2.5, discount: 100 }],
  };
  const payment = { method: 'CASH' as const, amount: 3026.25 };

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
    tx.customer.count.mockResolvedValue(1);
    tx.product.count.mockResolvedValue(1);
    tx.product.findMany.mockResolvedValue([product]);
    tx.quote.findFirst.mockResolvedValue(null);
    tx.quote.findUnique.mockResolvedValue(quote());
    tx.quote.findMany.mockResolvedValue([quote()]);
    tx.quote.create.mockResolvedValue(quote());
    tx.quote.update.mockResolvedValue(quote());
    tx.quoteItem.deleteMany.mockResolvedValue({ count: 1 });

    const saleRecord = {
      id: 'sale',
      folio: 1,
      estado: 'COMPLETED',
      metodoPago: 'CASH',
      fechaPago: now,
      subtotal: decimal('3126.25'),
      descuento: decimal(100),
      total: decimal('3026.25'),
      notas: 'Entrega',
      fechaCreacion: now,
      fechaActualizacion: now,
      cliente: customer,
      cotizacionId: 'quote',
    };
    tx.sale.findFirst.mockResolvedValue(null);
    tx.sale.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; cotizacionId?: string } }) =>
        Promise.resolve(where.id ? saleRecord : null),
    );
    tx.sale.create.mockResolvedValue({
      id: 'sale',
      items: [{ id: 'sale-item', productoId: 'product', cantidad: decimal('2.5') }],
    });
    tx.inventoryMovement.groupBy.mockResolvedValue([
      { productoId: 'product', _sum: { cambioExistencias: decimal(10) } },
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it('creates a draft using product prices, exact totals, author and a server folio', async () => {
    const result = await service.create(
      { ...input, notes: ' Entrega ', expiresAt: '2026-09-21T00:00:00Z' },
      'actor',
    );
    expect(tx.quote.findFirst).toHaveBeenCalledWith({
      orderBy: { folio: 'desc' },
      select: { folio: true },
    });
    expect(tx.quote.create.mock.calls[0]![0].data).toEqual({
      id: expect.any(String),
      estado: 'DRAFT',
      clienteId: 'customer',
      creadoPorId: 'actor',
      notas: 'Entrega',
      fechaVencimiento: new Date('2026-09-21T00:00:00Z'),
      subtotal: decimal('3126.25'),
      descuento: decimal(100),
      total: decimal('3026.25'),
      items: {
        create: [
          {
            id: undefined,
            productoId: 'product',
            tallaId: null,
            cantidad: decimal('2.5'),
            precioUnitario: decimal('1250.50'),
            descuento: decimal(100),
            total: decimal('3026.25'),
          },
        ],
      },
    });
    expect(result).toMatchObject({
      folio: 'C-000001',
      canPay: true,
      subtotal: '3126.25',
      total: '3026.25',
      customer: { id: 'customer' },
      items: [{ product: { id: 'product' }, quantity: '2.500', unitPrice: '1250.50' }],
    });
  });

  it('rounds fractional cents per line and sums the stored amounts without floating point drift', async () => {
    tx.product.findMany.mockResolvedValue([
      { ...product, precioVenta: decimal('0.10') },
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
      descuento: decimal(0),
      fechaVencimiento: null,
      notas: null,
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
    tx.customer.count.mockResolvedValue(0);
    await expect(service.create(input, 'actor')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.update('quote', { customerId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 });
    tx.customer.count.mockResolvedValue(1);
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
    'maps a %s folio collision to 409 without retrying',
    async (action) => {
      const create = action === 'create' ? tx.quote.create : tx.sale.create;
      create.mockRejectedValueOnce(dbError('P2002', ['folio']));
      const run =
        action === 'create'
          ? service.create(input, 'actor')
          : service.pay('quote', payment, 'actor');
      await expect(run).rejects.toMatchObject({
        status: 409,
        message: 'No se pudo generar un folio único',
      });
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
      await expect(service.create(input, 'actor')).rejects.toMatchObject({
        status: 409,
        message: 'No se pudo generar un folio único',
      });
    },
  );

  it('maps other unique constraints on pay to an already-converted conflict', async () => {
    tx.sale.create.mockRejectedValue(dbError('P2002', ['cotizacionId']));
    await expect(service.pay('quote', payment, 'actor')).rejects.toMatchObject({
      status: 409,
      message: 'La cotización ya fue convertida',
    });
  });

  it('updates draft metadata and replaces items when provided', async () => {
    await service.update('quote', { notes: ' ', customerId: 'customer' });
    expect(tx.quote.update.mock.calls[0]![0].data).toEqual(
      expect.objectContaining({
        notas: null,
      }),
    );
    tx.product.findMany.mockResolvedValue([{ ...product, precioVenta: decimal(10) }]);
    await service.update('quote', {
      items: [{ productId: 'product', quantity: 3 }],
    });
    expect(tx.quoteItem.deleteMany).toHaveBeenCalledWith({
      where: { cotizacionId: 'quote' },
    });
    expect(tx.quote.update.mock.calls[1]![0].data).toEqual(
      expect.objectContaining({
        subtotal: decimal(30),
        descuento: decimal(0),
        total: decimal(30),
      }),
    );
  });

  it('rejects an empty update', async () => {
    await expect(service.update('quote', {})).rejects.toMatchObject({
      status: 400,
    });
    expect(tx.quote.update).not.toHaveBeenCalled();
  });

  it.each([
    'SENT',
    'CONVERTED',
    'ACCEPTED',
    'CANCELLED',
    'EXPIRED',
    'REJECTED',
  ] as const)('forbids edit, send and delete in %s', async (estado) => {
    tx.quote.findUnique.mockResolvedValue(quote({ estado }));
    await expect(
      service.update('quote', { notes: 'edit' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.send('quote')).rejects.toMatchObject({ status: 409 });
    await expect(service.delete('quote')).rejects.toMatchObject({
      status: 409,
    });
    expect(tx.quote.delete).not.toHaveBeenCalled();
  });

  it('sends a draft without sale, payment or inventory effects and deletes drafts', async () => {
    tx.quote.update.mockResolvedValue(quote({ estado: 'SENT' }));
    expect(await service.send('quote')).toMatchObject({
      status: 'SENT',
      canPay: true,
    });
    expect(tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'SENT' }) }),
    );
    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.createMany).not.toHaveBeenCalled();
    await service.delete('quote');
    expect(tx.quote.delete).toHaveBeenCalledWith({
      where: { id: 'quote' },
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
    async (estado, fechaVencimiento, canPay) => {
      tx.quote.findUnique.mockResolvedValue(quote({ estado, fechaVencimiento }));
      expect(await service.findById('quote')).toMatchObject({ canPay });
    },
  );

  it('combines list filters and sorts newest first', async () => {
    expect(
      await service.findAll({
        status: 'DRAFT',
        customerId: 'customer',
      }),
    ).toHaveLength(1);
    expect(tx.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          estado: 'DRAFT',
          clienteId: 'customer',
        },
        orderBy: { fechaCreacion: 'desc' },
      }),
    );
    tx.quote.findMany.mockResolvedValue([]);
    expect(await service.findAll()).toEqual([]);
  });

  it.each(['DRAFT', 'SENT'] as const)(
    'pays %s preserving original prices and totals and creates the entire conversion',
    async (estado) => {
      tx.quote.findUnique.mockResolvedValue(
        quote({
          estado,
          fechaVencimiento: estado === 'DRAFT' ? null : new Date(now.getTime() + 1),
        }),
      );
      const result = await service.pay('quote', payment, 'actor');
      expect(result).toMatchObject({
        id: 'sale',
        status: 'COMPLETED',
        quoteId: 'quote',
        total: '3026.25',
      });
      expect(result).not.toHaveProperty('items');
      expect(tx.sale.create.mock.calls[0]![0].data).toEqual(
        expect.objectContaining({
          estado: 'COMPLETED',
          metodoPago: 'CASH',
          clienteId: 'customer',
          cotizacionId: 'quote',
          creadoPorId: 'actor',
          notas: 'Entrega',
          subtotal: decimal('3126.25'),
          descuento: decimal(100),
          total: decimal('3026.25'),
          items: {
            create: [
              expect.objectContaining({
                productoId: 'product',
                tallaId: 'size',
                cantidad: decimal('2.5'),
                precioUnitario: decimal('1250.50'),
                descuento: decimal(100),
                total: decimal('3026.25'),
                costoUnitario: decimal('700.00'),
              }),
            ],
          },
        }),
      );
      expect(tx.inventoryMovement.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            tipo: 'SALE_OUT',
            cambioExistencias: decimal('-2.5'),
            productoId: 'product',
            renglonVentaId: 'sale-item',
            tipoReferencia: 'SALE',
            referenciaId: 'sale',
            creadoPorId: 'actor',
          }),
        ],
      });
      expect(tx.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'quote' },
          data: expect.objectContaining({ estado: 'CONVERTED' }),
        }),
      );
    },
  );

  it.each([new Date(now.getTime() - 1), now])(
    'blocks expiration %s before any conversion effects',
    async (fechaVencimiento) => {
      tx.quote.findUnique.mockResolvedValue(quote({ fechaVencimiento }));
      await expect(
        service.pay('quote', payment, 'actor'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'La cotización ha expirado',
      });
      expect(tx.sale.create).not.toHaveBeenCalled();
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
  ] as const)('rejects payment for %s', async (estado) => {
    tx.quote.findUnique.mockResolvedValue(quote({ estado }));
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

  it.each([0, 3026.24, 3026.26])(
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
      quote({
        items: [...original.items, ...original.items],
        subtotal: decimal('6252.50'),
        total: decimal('6052.50'),
      }),
    );
    tx.inventoryMovement.groupBy.mockResolvedValue([
      { productoId: 'product', _sum: { cambioExistencias: decimal(4) } },
    ]);
    await expect(service.pay('quote', { ...payment, amount: 6052.50 }, 'actor')).rejects.toMatchObject({
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
    tx.product.count.mockResolvedValue(0);
    await expect(service.pay('quote', payment, 'actor')).rejects.toMatchObject({
      status: 404,
    });
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it.each(['sale', 'inventoryMovement', 'quote'] as const)(
    'propagates %s failures out of the transaction for rollback',
    async (model) => {
      const failure = new Error('injected failure');
      const method =
        model === 'quote'
          ? tx.quote.update
          : model === 'inventoryMovement'
            ? tx.inventoryMovement.createMany
            : tx.sale.create;
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
