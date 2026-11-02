import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Prisma, type PaymentMethod } from '../src/generated/prisma/client.js';
import { setupApp } from '../src/setup-app.js';

interface QuoteItemResponse {
  id: string;
  producto: {
    id: string;
    nombre: string;
    codigoBarras: string;
    urlImagen: string | null;
  };
  talla: { id: string; nombre: string } | null;
  cantidad: string;
  precioUnitario: string;
  descuento: string;
  impuesto: string;
  total: string;
}

interface QuoteCustomerResponse {
  id: string;
  nombre: string;
  phone: string | null;
  correo: string | null;
  activo: boolean;
  fechaCreacion: string;
  fechaActualizacion: string;
}

interface QuoteResponse {
  id: string;
  folio: string;
  estado: string;
  cliente: QuoteCustomerResponse;
  productos: QuoteItemResponse[];
  subtotal: string;
  descuento: string;
  impuesto: string;
  total: string;
  notas: string | null;
  fechaVencimiento: string | null;
  puedePagar: boolean;
  fechaCreacion: string;
  fechaActualizacion: string;
}

interface SaleQuoteResponse {
  id: string;
  folio: string;
  estado: string;
  cliente: QuoteCustomerResponse;
  cotizacionId: string | null;
  subtotal: string;
  descuento: string;
  impuesto: string;
  total: string;
  notas: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
}

const base = '/api/cotizaciones';
const future = () => new Date(Date.now() + 86400000).toISOString();

describe('Quotes HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  let customerId: string;
  let otherCustomerId: string;
  let categoryId: string;
  let productId: string;
  let otherProductId: string;
  const userIds: string[] = [];
  const tokens: Record<string, string> = {};
  const actors: Record<string, string> = {};
  const http = () => request(app!.getHttpServer());
  const auth = () => tokens.seller!;
  const body = () => ({
    customerId,
    expiresAt: future(),
    notes: ' Entrega ',
    items: [{ productId, quantity: 2.5, discount: 100 }],
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const jwt = new JwtService();
    for (const [key, role, activo] of [
      ['admin', 'ADMIN', true],
      ['seller', 'VENDEDOR', true],
      ['inactive', 'ADMIN', false],
      ['noRole', null, true],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          nombre: 'Quotes test',
          email: `${randomUUID()}@quotes.test`,
          passwordHash: 'unused',
          activo,
          ...(role
            ? { rol: { connect: { nombre: role } } }
            : {}),
        },
      });
      userIds.push(user.id);
      actors[key] = user.id;
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: role ? [role] : [] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
  });

  beforeEach(async () => {
    customerId = (
      await prisma.customer.create({
        data: { nombre: 'Ana', correo: 'ana@quotes.test' },
      })
    ).id;
    otherCustomerId = (await prisma.customer.create({ data: { nombre: 'Otra' } }))
      .id;
    categoryId = (
      await prisma.category.create({
        data: { descripcion: `Quotes-${randomUUID().slice(0, 8)}` },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          nombre: 'Producto',
          codigoBarras: randomUUID().slice(0, 16),
          categoriaId: categoryId,
          precioVenta: '1250.50',
          imageUrl: 'https://example.test/product.png',
        },
      })
    ).id;
    otherProductId = (
      await prisma.product.create({
        data: { nombre: 'Otro', codigoBarras: randomUUID().slice(0, 16), categoriaId: categoryId, precioVenta: '10.00' },
      })
    ).id;
    await prisma.inventoryMovement.createMany({
      data: [productId, otherProductId].map((id) => ({
        productoId: id,
        tipo: 'PURCHASE_IN',
        cambioExistencias: '20.000',
      })),
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!prisma || !customerId) return;
    const customerIds = [customerId, otherCustomerId];
    await prisma.inventoryMovement.deleteMany({
      where: { productoId: { in: [productId, otherProductId] } },
    });
    const sales = await prisma.sale.findMany({
      where: { clienteId: { in: customerIds } },
      select: { id: true },
    });
    const saleIds = sales.map((s) => s.id);
    await prisma.saleItem.deleteMany({
      where: { ventaId: { in: saleIds } },
    });
    await prisma.sale.deleteMany({
      where: { id: { in: saleIds } },
    });
    await prisma.quoteItem.deleteMany({
      where: { cotizacion: { clienteId: { in: customerIds } } },
    });
    await prisma.quote.deleteMany({
      where: { clienteId: { in: customerIds } },
    });
    await prisma.product.deleteMany({ where: { categoriaId: categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function create(
    input: object = body(),
    token = auth(),
  ): Promise<QuoteResponse> {
    const response = await http()
      .post(base)
      .set('Authorization', token)
      .send(input)
      .expect(201);
    return response.body as QuoteResponse;
  }
  async function counter(prefix: 'C' | 'V'): Promise<number> {
    const seq = prefix === 'C' ? 'quotes_folio_seq' : 'sales_folio_seq';
    const rows = await prisma.$queryRawUnsafe<Array<{ last_value: bigint | number; is_called: boolean }>>(
      `SELECT last_value, is_called FROM ${seq}`,
    );
    if (!rows[0]?.is_called) return 0;
    return Number(rows[0].last_value);
  }
  const folioNumber = (folio: string) => Number(folio.slice(2));

  async function stock(id = productId): Promise<string> {
    const result = await prisma.inventoryMovement.aggregate({
      where: { productoId: id },
      _sum: { cambioExistencias: true },
    });
    return (result._sum.cambioExistencias ?? new Prisma.Decimal(0)).toFixed(3);
  }
  async function expectNoConversion(
    id: string,
    status = 'DRAFT',
  ): Promise<void> {
    expect(await prisma.sale.count({ where: { cotizacionId: id } })).toBe(0);
    expect(
      await prisma.saleItem.count({ where: { venta: { clienteId: customerId } } }),
    ).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: {
          productoId: { in: [productId, otherProductId] },
          tipo: 'SALE_OUT',
        },
      }),
    ).toBe(0);
    expect(
      (await prisma.quote.findUniqueOrThrow({ where: { id } })).estado,
    ).toBe(status);
  }

  it('creates a complete public draft with exact decimals and persisted prices', async () => {
    const input = body();
    const result = await create(input);
    expect(result).toEqual({
      id: expect.any(String),
      folio: expect.stringMatching(/^C-\d{6,}$/),
      estado: 'DRAFT',
      cliente: {
        id: customerId,
        nombre: 'Ana',
        phone: null,
        telefono: null,
        correo: 'ana@quotes.test',
        activo: true,
        esPredeterminado: false,
        fechaCreacion: expect.any(String),
        fechaActualizacion: expect.any(String),
      },
      productos: [
        {
          id: expect.any(String),
          producto: {
            id: productId,
            nombre: 'Producto',
            codigoBarras: expect.any(String),
            urlImagen: 'https://example.test/product.png',
          },
          talla: null,
          cantidad: '2.500',
          precioUnitario: '1250.50',
          descuento: '100.00',
          impuesto: '0.00',
          total: '3026.25',
        },
      ],
      subtotal: '3126.25',
      descuento: '100.00',
      impuesto: '0.00',
      total: '3026.25',
      notas: 'Entrega',
      fechaVencimiento: input.expiresAt,
      puedePagar: true,
      fechaCreacion: expect.any(String),
      fechaActualizacion: expect.any(String),
    });
    expect(
      (await prisma.quote.findUniqueOrThrow({ where: { id: result.id } }))
        .creadoPorId,
    ).toBe(actors.seller);
    expect(
      (
        await http()
          .get(`${base}/${result.id}`)
          .set('Authorization', auth())
          .expect(200)
      ).body,
    ).toEqual(result);
    await expectNoConversion(result.id);
    expect(await stock()).toBe('20.000');
  });

  it('rounds each fractional line and sums exact persisted totals', async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { precioVenta: '0.10' },
    });
    const result = await create({
      customerId,
      items: [
        { productId, quantity: 0.15 },
        { productId, quantity: 0.15 },
      ],
    });
    expect(result).toMatchObject({
      subtotal: '0.04',
      total: '0.04',
      impuesto: '0.00',
      descuento: '0.00',
      fechaVencimiento: null,
      notas: null,
      puedePagar: true,
    });
    expect(result.productos.map((item) => item.total)).toEqual(['0.02', '0.02']);
  });

  it('issues consecutive quote and sale folios from the counters', async () => {
    const quotesBefore = await counter('C');
    const salesBefore = await counter('V');
    const first = await create();
    const second = await create();
    expect([first.folio, second.folio].map(folioNumber)).toEqual([
      quotesBefore + 1,
      quotesBefore + 2,
    ]);
    expect(first.folio).toBe(`C-${String(quotesBefore + 1).padStart(6, '0')}`);
    const sales: SaleQuoteResponse[] = [];
    for (const original of [first, second]) {
      const paid = await http()
        .post(`${base}/${original.id}/pagar`)
        .set('Authorization', auth())
        .send({ method: 'CASH', amount: Number(original.total) })
        .expect(200);
      sales.push(paid.body as SaleQuoteResponse);
    }
    expect(sales.map(({ folio }) => folioNumber(folio))).toEqual([
      salesBefore + 1,
      salesBefore + 2,
    ]);
    expect(await counter('C')).toBe(quotesBefore + 2);
    expect(await counter('V')).toBe(salesBefore + 2);
  });

  it('issues unique gapless folios to concurrent quote creations', async () => {
    const before = await counter('C');
    const created = await Promise.all(
      Array.from({ length: 4 }, () =>
        http().post(base).set('Authorization', auth()).send(body()),
      ),
    );
    expect(created.map(({ status }) => status)).toEqual([201, 201, 201, 201]);
    const numbers = created
      .map(({ body: quote }) => folioNumber((quote as QuoteResponse).folio))
      .sort((a, b) => a - b);
    expect(numbers).toEqual([before + 1, before + 2, before + 3, before + 4]);
    expect(await counter('C')).toBe(before + 4);
  });

  it('returns 409 on a folio collision without consuming the number', async () => {
    const existing = await create();
    const value = folioNumber(existing.folio);
    await prisma.$executeRawUnsafe(
      `SELECT setval('quotes_folio_seq', ${value - 1}, true)`,
    );
    try {
      const response = await http()
        .post(base)
        .set('Authorization', auth())
        .send(body())
        .expect(409);
      expect(response.body.message).toBe('No se pudo generar un folio único');
      expect(await prisma.quote.count({ where: { clienteId: customerId } })).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(
        `SELECT setval('quotes_folio_seq', ${value}, true)`,
      );
    }
  });

  it('lists newest first with combined status, customer and case-insensitive folio filters', async () => {
    const first = await create();
    const second = await create({ ...body(), customerId: otherCustomerId });
    await prisma.quote.update({
      where: { id: first.id },
      data: { fechaCreacion: new Date('2020-01-01'), estado: 'SENT' },
    });
    const all = await http().get(base).set('Authorization', auth()).expect(200);
    expect((all.body as QuoteResponse[]).map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
    for (const query of [
      { status: 'SENT' },
      { customerId },
      { search: first.folio.toLowerCase() },
      {
        status: 'SENT',
        customerId,
        search: first.folio.slice(-6).toLowerCase(),
      },
    ]) {
      const response = await http()
        .get(base)
        .query(query)
        .set('Authorization', auth())
        .expect(200);
      expect((response.body as QuoteResponse[]).map((item) => item.id)).toEqual([
        first.id,
      ]);
    }
    expect(
      (
        await http()
          .get(base)
          .query({ search: randomUUID() })
          .set('Authorization', auth())
          .expect(200)
      ).body,
    ).toEqual([]);
  });

  it('edits draft metadata without repricing and fully replaces items using current prices', async () => {
    const original = await create();
    await prisma.product.update({
      where: { id: productId },
      data: { precioVenta: '15.00' },
    });
    const metadata = await http()
      .patch(`${base}/${original.id}`)
      .set('Authorization', auth())
      .send({ notes: ' ', customerId: otherCustomerId, expiresAt: future() })
      .expect(200);
    expect(metadata.body).toMatchObject({
      notas: null,
      cliente: { id: otherCustomerId },
      total: original.total,
      productos: original.productos,
    });
    const updated = await http()
      .patch(`${base}/${original.id}`)
      .set('Authorization', auth())
      .send({
        items: [
          { productId, quantity: 3 },
          { productId: otherProductId, quantity: 2, discount: 1 },
        ],
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      subtotal: '65.00',
      descuento: '1.00',
      impuesto: '0.00',
      total: '64.00',
    });
    expect(
      (updated.body as QuoteResponse).productos.map((item) => item.precioUnitario).sort(),
    ).toEqual(['10.00', '15.00']);
    expect(
      await prisma.quoteItem.count({ where: { id: original.productos[0]!.id } }),
    ).toBe(0);
    expect(
      await prisma.quoteItem.count({ where: { cotizacionId: original.id } }),
    ).toBe(2);
  });

  it('sends without conversion effects, rejects another send or edit, and has no approval endpoint', async () => {
    const original = await create();
    const sent = await http()
      .post(`${base}/${original.id}/enviar`)
      .set('Authorization', auth())
      .expect(200);
    expect(sent.body).toMatchObject({ estado: 'SENT', puedePagar: true });
    await expectNoConversion(original.id, 'SENT');
    expect(await stock()).toBe('20.000');
    await http()
      .post(`${base}/${original.id}/enviar`)
      .set('Authorization', auth())
      .expect(409);
    await http()
      .patch(`${base}/${original.id}`)
      .set('Authorization', auth())
      .send({ notes: 'edit' })
      .expect(409);
    await http()
      .post(`${base}/${original.id}/approve`)
      .set('Authorization', auth())
      .expect(404);
  });

  it.each(['DRAFT', 'SENT'] as const)(
    'pays %s and atomically records sale, items, paid payment, movements and conversion',
    async (status) => {
      const original = await create({
        ...body(),
        ...(status === 'DRAFT' ? { expiresAt: undefined } : {}),
      });
      if (status === 'SENT')
        await http()
          .post(`${base}/${original.id}/enviar`)
          .set('Authorization', auth())
          .expect(200);
      await prisma.product.update({
        where: { id: productId },
        data: { precioVenta: '999.99' },
      });
      const paid = await http()
        .post(`${base}/${original.id}/pagar`)
        .set('Authorization', auth())
        .send({ method: 'CASH', amount: Number(original.total) })
        .expect(200);
      const sale = paid.body as SaleQuoteResponse;
      expect(Object.keys(sale).sort()).toEqual(
        [
          'id',
          'folio',
          'estado',
          'cliente',
          'cotizacionId',
          'subtotal',
          'descuento',
          'impuesto',
          'total',
          'notas',
          'fechaCreacion',
          'fechaActualizacion',
        ].sort(),
      );
      expect(sale).toMatchObject({
        folio: expect.stringMatching(/^V-\d{6,}$/),
        estado: 'COMPLETED',
        cotizacionId: original.id,
        cliente: original.cliente,
        subtotal: original.subtotal,
        descuento: original.descuento,
        impuesto: original.impuesto,
        total: original.total,
        notas: original.notas,
      });
      const record = await prisma.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { items: true },
      });
      expect(record.items).toHaveLength(1);
      expect(record.items[0]!.precioUnitario.toFixed(2)).toBe('1250.50');
      expect(record.items[0]!.cantidad.toFixed(3)).toBe('2.500');
      expect(record.items[0]!.total.toFixed(2)).toBe(original.total);
      expect(record).toMatchObject({
        estado: 'COMPLETED',
        metodoPago: 'CASH',
        creadoPorId: actors.seller,
        fechaPago: expect.any(Date),
      });
      expect(record.total.toFixed(2)).toBe(original.total);
      const movements = await prisma.inventoryMovement.findMany({
        where: { referenciaId: sale.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        tipo: 'SALE_OUT',
        productoId: productId,
        renglonVentaId: record.items[0]!.id,
        tipoReferencia: 'SALE',
        referenciaId: sale.id,
        creadoPorId: actors.seller,
      });
      expect(movements[0]!.cambioExistencias.toFixed(3)).toBe('-2.500');
      expect(await stock()).toBe('17.500');
      expect(
        (
          await http()
            .get(`${base}/${original.id}`)
            .set('Authorization', auth())
            .expect(200)
        ).body,
      ).toMatchObject({ estado: 'CONVERTED', puedePagar: false });
      await http()
        .post(`${base}/${original.id}/pagar`)
        .set('Authorization', auth())
        .send({ method: 'CASH', amount: Number(original.total) })
        .expect(409);
      await http()
        .post(`${base}/${original.id}/enviar`)
        .set('Authorization', auth())
        .expect(409);
      await http()
        .patch(`${base}/${original.id}`)
        .set('Authorization', auth())
        .send({ notes: 'edit' })
        .expect(409);
      expect(await stock()).toBe('17.500');
    },
  );

  it.each(['CARD', 'TRANSFER', 'OTHER'] satisfies PaymentMethod[])(
    'records full payments using %s',
    async (method) => {
      const original = await create();
      const result = await http()
        .post(`${base}/${original.id}/pagar`)
        .set('Authorization', tokens.admin!)
        .send({ method, amount: Number(original.total) })
        .expect(200);
      expect(
        await prisma.sale.findUniqueOrThrow({
          where: { id: (result.body as SaleQuoteResponse).id },
        }),
      ).toMatchObject({ metodoPago: method, estado: 'COMPLETED', creadoPorId: actors.admin });
    },
  );

  it.each(['DRAFT', 'SENT'] as const)(
    'blocks expired %s with no sale, payment or inventory effects',
    async (status) => {
      const original = await create();
      await prisma.quote.update({
        where: { id: original.id },
        data: { estado: status, fechaVencimiento: new Date(Date.now() - 1000) },
      });
      expect(
        (
          await http()
            .get(`${base}/${original.id}`)
            .set('Authorization', auth())
            .expect(200)
        ).body,
      ).toMatchObject({ puedePagar: false, estado: status });
      const listed = await http()
        .get(base)
        .query({ customerId })
        .set('Authorization', auth())
        .expect(200);
      expect((listed.body as QuoteResponse[])[0]!.puedePagar).toBe(false);
      const result = await http()
        .post(`${base}/${original.id}/pagar`)
        .set('Authorization', auth())
        .send({ method: 'CASH', amount: Number(original.total) })
        .expect(409);
      expect(result.body.message).toBe('La cotización ha expirado');
      await expectNoConversion(original.id, status);
      expect(await stock()).toBe('20.000');
    },
  );

  it('blocks insufficient combined stock for repeated product lines', async () => {
    const original = await create({
      customerId,
      items: [
        { productId, quantity: 11 },
        { productId, quantity: 11 },
      ],
    });
    const result = await http()
      .post(`${base}/${original.id}/pagar`)
      .set('Authorization', auth())
      .send({ method: 'CASH', amount: Number(original.total) })
      .expect(409);
    expect(result.body.message).toBe('Sin inventario suficiente');
    await expectNoConversion(original.id);
    expect(await stock()).toBe('20.000');
  });

  it('checks every product before writing and permits stock exactly equal to demand', async () => {
    const original = await create({
      customerId,
      items: [
        { productId, quantity: 20 },
        { productId: otherProductId, quantity: 21 },
      ],
    });
    await http()
      .post(`${base}/${original.id}/pagar`)
      .set('Authorization', auth())
      .send({ method: 'CASH', amount: Number(original.total) })
      .expect(409);
    await expectNoConversion(original.id);
    const changed = await http()
      .patch(`${base}/${original.id}`)
      .set('Authorization', auth())
      .send({
        items: [
          { productId, quantity: 20 },
          { productId: otherProductId, quantity: 20 },
        ],
      })
      .expect(200);
    await http()
      .post(`${base}/${original.id}/pagar`)
      .set('Authorization', auth())
      .send({
        method: 'CASH',
        amount: Number((changed.body as QuoteResponse).total),
      })
      .expect(200);
    expect(await stock()).toBe('0.000');
    expect(await stock(otherProductId)).toBe('0.000');
    expect(
      await prisma.inventoryMovement.count({
        where: {
          tipo: 'SALE_OUT',
          productoId: { in: [productId, otherProductId] },
        },
      }),
    ).toBe(2);
  });

  it('allows only one successful simultaneous payment of the same quote', async () => {
    const original = await create();
    const results = await Promise.all(
      [1, 2].map(() =>
        http()
          .post(`${base}/${original.id}/pagar`)
          .set('Authorization', auth())
          .send({ method: 'CASH', amount: Number(original.total) }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await prisma.sale.count({ where: { cotizacionId: original.id } })).toBe(
      1,
    );
    expect(await stock()).toBe('17.500');
  });

  it('prevents concurrent different quotes from overselling the same stock', async () => {
    const first = await create({
      customerId,
      items: [{ productId, quantity: 15 }],
    });
    const second = await create({
      customerId,
      items: [{ productId, quantity: 15 }],
    });
    const results = await Promise.all(
      [first, second].map((original) =>
        http()
          .post(`${base}/${original.id}/pagar`)
          .set('Authorization', auth())
          .send({ method: 'CASH', amount: Number(original.total) }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await stock()).toBe('5.000');
    expect(await prisma.sale.count({ where: { clienteId: customerId } })).toBe(1);
    expect(
      await prisma.quote.count({ where: { clienteId: customerId, estado: 'CONVERTED' } }),
    ).toBe(1);
  });

  it.each(['sale', 'quote'] as const)(
    'rolls back all database writes if %s fails late in conversion',
    async (failureStage) => {
      const original = await create();
      const salesBefore = await counter('V');
      const transaction = prisma.$transaction.bind(prisma);
      const options = {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      };
      const spy = vi.spyOn(prisma, '$transaction').mockImplementation((async (
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        transaction(async (tx) => {
          if (failureStage === 'sale')
            vi.spyOn(tx.sale, 'create').mockRejectedValueOnce(
              new Error('Injected sale failure'),
            );
          else
            vi.spyOn(tx.quote, 'update').mockRejectedValueOnce(
              new Error('Injected conversion failure'),
            );
          return operation(tx);
        }, options)) as typeof prisma.$transaction);
      try {
        await http()
          .post(`${base}/${original.id}/pagar`)
          .set('Authorization', auth())
          .send({ method: 'CASH', amount: Number(original.total) })
          .expect(500);
      } finally {
        spy.mockRestore();
      }
      await expectNoConversion(original.id);
      expect(await stock()).toBe('20.000');
      // The reserved folio rolled back with the transaction: no gap.
      expect(await counter('V')).toBeGreaterThanOrEqual(salesBefore);
      const paid = await http()
        .post(`${base}/${original.id}/pagar`)
        .set('Authorization', auth())
        .send({ method: 'CASH', amount: Number(original.total) })
        .expect(200);
      expect(folioNumber((paid.body as SaleQuoteResponse).folio)).toBeGreaterThan(salesBefore);
    },
  );

  it('deletes only drafts, cascading items and rejecting sent or converted quotes', async () => {
    const original = await create(body(), tokens.admin!);
    const response = await http()
      .delete(`${base}/${original.id}`)
      .set('Authorization', tokens.admin!)
      .expect(204);
    expect(response.text).toBe('');
    expect(
      await prisma.quoteItem.count({ where: { cotizacionId: original.id } }),
    ).toBe(0);
    await http()
      .delete(`${base}/${original.id}`)
      .set('Authorization', tokens.admin!)
      .expect(404);
    const sent = await create();
    await http()
      .post(`${base}/${sent.id}/enviar`)
      .set('Authorization', auth())
      .expect(200);
    await http()
      .delete(`${base}/${sent.id}`)
      .set('Authorization', tokens.admin!)
      .expect(409);
    await http()
      .post(`${base}/${sent.id}/pagar`)
      .set('Authorization', auth())
      .send({ method: 'CASH', amount: Number(sent.total) })
      .expect(200);
    await http()
      .delete(`${base}/${sent.id}`)
      .set('Authorization', tokens.admin!)
      .expect(409);
  });

  it('rejects invalid inputs, reserved fields, precision violations, overflow and nonfuture dates', async () => {
    for (const input of [
      {},
      { ...body(), customerId: 'invalid' },
      { ...body(), customerId: null },
      { ...body(), items: [] },
      { ...body(), items: null },
      { ...body(), items: [null] },
      { ...body(), notes: 'x'.repeat(501) },
      { ...body(), notes: null },
      ...[
        'folio',
        'status',
        'unitPrice',
        'subtotal',
        'discount',
        'tax',
        'total',
        'createdAt',
        'updatedAt',
        'createdById',
        'canPay',
      ].map((field) => ({ ...body(), [field]: 'forbidden' })),
      ...['invalid', '2026-02-30T00:00:00Z', '2000-01-01', null].map(
        (expiresAt) => ({ ...body(), expiresAt }),
      ),
      ...[
        { productId: 'invalid', quantity: 1 },
        { productId, quantity: 0 },
        { productId, quantity: -1 },
        { productId, quantity: 1.0001 },
        { productId, quantity: '1' },
        { productId, quantity: 100000000000 },
        { productId, quantity: 99999999999.999 },
        { productId, quantity: 1, discount: -1 },
        { productId, quantity: 1, tax: -1 },
        { productId, quantity: 1, discount: 0.001 },
        { productId, quantity: 1, tax: 0.001 },
        { productId, quantity: 1, discount: null },
        { productId, quantity: 1, tax: 10000000000 },
        { productId, quantity: 1, discount: 9999999999.99 },
        { productId, quantity: 1, unitPrice: 0 },
        { productId, quantity: 1, total: 0 },
      ].map((item) => ({ ...body(), items: [item] })),
    ])
      await http()
        .post(base)
        .set('Authorization', auth())
        .send(input)
        .expect(400);
    expect(await prisma.quote.count({ where: { clienteId: customerId } })).toBe(0);
  });

  it('rejects empty and invalid patches and invalid or mismatched payments without effects', async () => {
    const original = await create();
    for (const input of [
      {},
      { items: [] },
      { items: null },
      { customerId: null },
      { expiresAt: null },
      { expiresAt: '2000-01-01' },
      { notes: null },
      { total: 0 },
      { status: 'CONVERTED' },
    ])
      await http()
        .patch(`${base}/${original.id}`)
        .set('Authorization', auth())
        .send(input)
        .expect(400);
    for (const input of [
      {},
      { method: 'CREDIT', amount: 3346.25 },
      { method: 'CASH' },
      { method: 'CASH', amount: '3346.25' },
      { method: 'CASH', amount: -1 },
      { method: 'CASH', amount: 1.001 },
      { method: 'CASH', amount: 3346.24 },
      { method: 'CASH', amount: 3346.26 },
      { method: 'CASH', amount: 3346.25, status: 'PAID' },
    ])
      await http()
        .post(`${base}/${original.id}/pagar`)
        .set('Authorization', auth())
        .send(input)
        .expect(400);
    await expectNoConversion(original.id);
    expect(
      (
        await http()
          .get(`${base}/${original.id}`)
          .set('Authorization', auth())
          .expect(200)
      ).body,
    ).toEqual(original);
  });

  it('validates filters and route UUIDs and returns 404 for missing references', async () => {
    for (const query of [
      'status=INVALID',
      'customerId=invalid',
      'status=DRAFT&status=SENT',
      'search=a&search=b',
      'unknown=true',
    ])
      await http()
        .get(`${base}?${query}`)
        .set('Authorization', auth())
        .expect(400);
    await http()
      .get(base)
      .query({ customerId: randomUUID() })
      .set('Authorization', auth())
      .expect(404);
    await http()
      .post(base)
      .set('Authorization', auth())
      .send({ ...body(), customerId: randomUUID() })
      .expect(404);
    await http()
      .post(base)
      .set('Authorization', auth())
      .send({ ...body(), items: [{ productId: randomUUID(), quantity: 1 }] })
      .expect(404);
    const original = await create();
    for (const input of [
      { customerId: randomUUID() },
      { items: [{ productId: randomUUID(), quantity: 1 }] },
    ])
      await http()
        .patch(`${base}/${original.id}`)
        .set('Authorization', auth())
        .send(input)
        .expect(404);
    for (const [id, status] of [
      ['invalid', 400],
      [randomUUID(), 404],
    ] as const) {
      await http()
        .get(`${base}/${id}`)
        .set('Authorization', auth())
        .expect(status);
      await http()
        .patch(`${base}/${id}`)
        .set('Authorization', auth())
        .send({ notes: 'edit' })
        .expect(status);
      await http()
        .delete(`${base}/${id}`)
        .set('Authorization', tokens.admin!)
        .expect(status);
      await http()
        .post(`${base}/${id}/enviar`)
        .set('Authorization', auth())
        .expect(status);
      await http()
        .post(`${base}/${id}/pagar`)
        .set('Authorization', auth())
        .send({ method: 'CASH', amount: 1 })
        .expect(status);
    }
  });

  it('requires active authentication and enforces roles on all seven endpoints', async () => {
    const original = await create();
    for (const [method, path] of [
      ['post', base],
      ['get', base],
      ['get', `${base}/${original.id}`],
      ['patch', `${base}/${original.id}`],
      ['post', `${base}/${original.id}/enviar`],
      ['post', `${base}/${original.id}/pagar`],
      ['delete', `${base}/${original.id}`],
    ] as const) {
      for (const token of [
        undefined,
        'Bearer invalid',
        tokens.inactive,
        tokens.noRole,
      ]) {
        const operation = http()[method](path);
        if (token) operation.set('Authorization', token);
        await operation.expect(token === tokens.noRole ? 403 : 401);
      }
    }
    await http()
      .delete(`${base}/${original.id}`)
      .set('Authorization', auth())
      .expect(403);
    await expectNoConversion(original.id);
  });

  it('documents public DTOs, bearer authentication and all routes in Swagger', async () => {
    const response = await http().get('/api/docs-json').expect(200);
    for (const [path, method, status] of [
      [base, 'post', '201'],
      [base, 'get', '200'],
      [`${base}/{id}`, 'get', '200'],
      [`${base}/{id}`, 'patch', '200'],
      [`${base}/{id}`, 'delete', '204'],
      [`${base}/{id}/enviar`, 'post', '200'],
      [`${base}/{id}/pagar`, 'post', '200'],
    ] as const) {
      const operation = response.body.paths[path][method];
      expect(operation.security).toEqual([{ bearer: [] }]);
      for (const code of [status, '400', '401', '403', '404', '409'])
        expect(operation.responses[code]).toBeDefined();
    }
    expect(response.body.paths[`${base}/{id}/approve`]).toBeUndefined();
    expect(
      Object.keys(response.body.components.schemas.QuoteDto.properties).sort(),
    ).toEqual(
      [
        'id',
        'folio',
        'estado',
        'cliente',
        'productos',
        'subtotal',
        'descuento',
        'impuesto',
        'total',
        'notas',
        'fechaVencimiento',
        'puedePagar',
        'fechaCreacion',
        'fechaActualizacion',
      ].sort(),
    );
    expect(
      response.body.components.schemas.CustomerDto.properties.isDefault,
    ).toBeUndefined();
  });
});
