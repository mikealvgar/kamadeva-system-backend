import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type { QuoteDto } from '../src/quotes/dto/quote.dto.js';

interface SaleCustomerResponse {
  id: string;
  nombre: string;
}

interface SaleCreatedByResponse {
  id: string;
  nombre: string;
}

interface SaleItemResponse {
  id: string;
  producto: {
    id: string;
    codigoBarras: string;
    nombre: string;
  };
  talla: {
    id: string;
    nombre: string;
  } | null;
  cantidad: string;
  precioUnitario: string;
  descuento: string;
  impuesto: string;
  total: string;
}

interface SalePaymentResponse {
  id: string;
  metodo: string;
  monto: string;
  estado: string;
  fechaPago: string;
}

interface SaleDetailResponse {
  id: string;
  folio: string;
  estado: string;
  cliente: SaleCustomerResponse | null;
  creadoPor: SaleCreatedByResponse;
  cotizacionId: string | null;
  notas: string | null;
  subtotal: string;
  descuento: string;
  impuesto: string;
  total: string;
  productos: SaleItemResponse[];
  pagos: SalePaymentResponse[];
  fechaCancelacion: string | null;
  canceladoPor: SaleCreatedByResponse | null;
  motivoCancelacion: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
}

interface SaleSummaryResponse {
  id: string;
  folio: string;
  estado: string;
  total: string;
  metodoPago: string;
  cliente: SaleCustomerResponse | null;
  creadoPor: SaleCreatedByResponse;
  cotizacionId: string | null;
  fechaCreacion: string;
}

interface SalePageResponse {
  datos: SaleSummaryResponse[];
  total: number;
  pagina: number;
  limite: number;
}

const base = '/api/ventas';

describe('Sales HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  let categoriaId: string;
  let customerId: string;
  let sizeM: string;
  let sizedId: string;
  let plainId: string;
  let inactiveId: string;
  const users: Record<'admin' | 'seller' | 'noRole', string> = {} as never;
  const tokens: Record<'admin' | 'seller' | 'noRole', string> = {} as never;
  const http = () => request(app!.getHttpServer());

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
    for (const [key, role] of [
      ['admin', 'ADMIN'],
      ['seller', 'VENDEDOR'],
      ['noRole', null],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          nombre: `Sales ${key}`,
          email: `${randomUUID()}@sales.test`,
          passwordHash: 'unused-test-hash',
          ...(role
            ? { rol: { connect: { nombre: role } } }
            : {}),
        },
      });
      users[key] = user.id;
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: role ? [role] : [] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
  });

  beforeEach(async () => {
    categoriaId = (
      await prisma.category.create({
        data: { descripcion: `Ventas-${randomUUID().slice(0, 8)}` },
      })
    ).id;
    customerId = (await prisma.customer.create({ data: { nombre: 'Ana Pérez' } }))
      .id;
    sizeM = (
      await prisma.size.create({
        data: { nombre: `M-${randomUUID().slice(0, 8)}`.toUpperCase() },
      })
    ).id;
    const product = (data: { nombre: string; precioVenta: string; activo?: boolean }) =>
      prisma.product.create({
        data: {
          codigoBarras: randomUUID().slice(0, 20),
          categoriaId,
          ...data,
        },
      });
    sizedId = (
      await product({
        nombre: 'Playera',
        precioVenta: '299.00',
      })
    ).id;
    plainId = (await product({ nombre: 'Gorra', precioVenta: '100.00' })).id;
    inactiveId = (
      await product({ nombre: 'Viejo', precioVenta: '1.00', activo: false })
    ).id;
    for (const [productoId, quantity] of [
      [sizedId, 5],
      [plainId, 10],
      [inactiveId, 10],
    ] as const) {
      await prisma.inventoryMovement.create({
        data: {
          productoId,
          tipo: 'PURCHASE_IN',
          cambioExistencias: quantity,
        },
      });
    }
  });

  afterEach(async () => {
    if (!prisma) return;
    const productIds = [sizedId, plainId, inactiveId];
    const userIds = Object.values(users);
    const sales = await prisma.sale.findMany({
      where: { creadoPorId: { in: userIds } },
      select: { id: true },
    });
    const saleIds = sales.map(({ id }) => id);
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: [
          { productoId: { in: productIds } },
          { referenciaId: { in: saleIds } },
        ],
      },
    });
    await prisma.idempotencyKey.deleteMany({
      where: { usuarioId: { in: userIds } },
    });
    await prisma.saleItem.deleteMany({ where: { ventaId: { in: saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.quote.deleteMany({ where: { clienteId: customerId } });
    await prisma.product.deleteMany({ where: { categoriaId } });
    await prisma.size.deleteMany({ where: { id: sizeM } });
    await prisma.category.deleteMany({ where: { id: categoriaId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const userIds = Object.values(users);
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  const body = (overrides: object = {}) => ({
    customerId,
    items: [
      { productId: sizedId, sizeId: sizeM, quantity: 2 },
      { productId: plainId, quantity: 1, discount: 10 },
    ],
    payment: { method: 'CASH', amount: 688 },
    ...overrides,
  });

  const post = (
    payload: object,
    key: string | null = randomUUID(),
    token: string = tokens.seller,
  ) => {
    const req = http().post(base).set('Authorization', token);
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(payload);
  };

  async function stock(productoId: string): Promise<string> {
    const total = await prisma.inventoryMovement.aggregate({
      where: { productoId },
      _sum: { cambioExistencias: true },
    });
    return total._sum.cambioExistencias?.toFixed(3) ?? '0.000';
  }

  async function sell(payload: object = body()): Promise<SaleDetailResponse> {
    return (await post(payload).expect(201)).body as SaleDetailResponse;
  }

  it('sells without a quote: server prices, stock out, paid payment and full detail', async () => {
    const sale = await sell(body({ notes: ' Mostrador ' }));
    expect(sale).toEqual({
      id: expect.any(String),
      folio: expect.stringMatching(/^V-\d{6,}$/),
      estado: 'COMPLETED',
      cliente: { id: customerId, nombre: 'Ana Pérez' },
      creadoPor: { id: users.seller, nombre: 'Sales seller' },
      cotizacionId: null,
      notas: 'Mostrador',
      subtotal: '698.00',
      descuento: '10.00',
      impuesto: '0.00',
      total: '688.00',
      productos: expect.any(Array),
      pagos: [
        {
          id: expect.any(String),
          metodo: 'CASH',
          monto: '688.00',
          estado: 'PAID',
          fechaPago: expect.any(String),
        },
      ],
      fechaCancelacion: null,
      canceladoPor: null,
      motivoCancelacion: null,
      fechaCreacion: expect.any(String),
      fechaActualizacion: expect.any(String),
    });
    expect(
      Object.fromEntries(
        sale.productos.map((item) => [
          item.producto.id,
          [item.talla?.id ?? null, item.cantidad, item.precioUnitario, item.total],
        ]),
      ),
    ).toEqual({
      [sizedId]: [sizeM, '2.000', '299.00', '598.00'],
      [plainId]: [null, '1.000', '100.00', '90.00'],
    });
    expect(await stock(sizedId)).toBe('3.000');
    expect(await stock(plainId)).toBe('9.000');
    expect(
      await prisma.inventoryMovement.count({
        where: {
          referenciaId: sale.id,
          tipo: 'SALE_OUT',
          renglonVentaId: { not: null },
        },
      }),
    ).toBe(2);
    await http()
      .get(`${base}/${sale.id}`)
      .set('Authorization', tokens.seller)
      .expect(200, sale);
  });

  it('uses the default customer when none is sent', async () => {
    const sale = await sell(body({ customerId: undefined }));
    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: sale.cliente!.id },
    });
    expect(stored.esPredeterminado).toBe(true);
  });

  it('rejects invalid headers and bodies with 400 without writing', async () => {
    await post(body(), null).expect(400);
    await post(body(), 'not-a-uuid').expect(400);
    for (const payload of [
      {},
      body({ items: [] }),
      body({ items: [{ productId: plainId, quantity: 0 }] }),
      body({ items: [{ productId: plainId, quantity: 1.0001 }] }),
      body({ items: [{ productId: plainId, quantity: 1, unitPrice: 1 }] }),
      body({ payment: { method: 'CRYPTO', amount: 688 } }),
      body({ payment: { method: 'CASH', amount: 1.001 } }),
      body({ payment: undefined }),
      body({ customerId: 'x' }),
      body({ notes: 'x'.repeat(501) }),
      body({ total: 1 }),
      // Business-rule 400s
      body({ payment: { method: 'CASH', amount: 687.99 } }),
      body({ items: [{ productId: sizedId, quantity: 1 }] }),
      body({ items: [{ productId: plainId, sizeId: sizeM, quantity: 1 }] }),
      body({
        items: [{ productId: plainId, quantity: 1, discount: 100.01 }],
        payment: { method: 'CASH', amount: 0 },
      }),
    ]) {
      await post(payload).expect(400);
    }
    expect(
      await prisma.sale.count({ where: { creadoPorId: users.seller } }),
    ).toBe(0);
    expect(await stock(plainId)).toBe('10.000');
  });

  it('returns 404 for missing customer or product and 409 for inactive product or shortage', async () => {
    await post(body({ customerId: randomUUID() })).expect(404);
    await post(
      body({
        items: [{ productId: randomUUID(), quantity: 1 }],
        payment: { method: 'CASH', amount: 1 },
      }),
    ).expect(404);
    await post(
      body({
        items: [{ productId: inactiveId, quantity: 1 }],
        payment: { method: 'CASH', amount: 1 },
      }),
    ).expect(409);
    // Repeated lines draw from the same stock: 6 + 5 > 10.
    const shortage = await post(
      body({
        items: [
          { productId: plainId, quantity: 6 },
          { productId: plainId, quantity: 5 },
        ],
        payment: { method: 'CASH', amount: 1100 },
      }),
    ).expect(409);
    expect(shortage.body.message).toBe('Sin inventario suficiente');
    expect(
      await prisma.sale.count({ where: { creadoPorId: users.seller } }),
    ).toBe(0);
    expect(await stock(plainId)).toBe('10.000');
  });

  it('replays a repeated key with the same body and rejects a different body or user', async () => {
    const key = randomUUID();
    const first = await post(body(), key).expect(201);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    const replay = await post(body(), key).expect(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    // Upper-case form of the same key is the same key.
    await post(body(), key.toUpperCase()).expect(201);

    const reused = await post(body({ notes: 'otra' }), key).expect(409);
    expect(reused.body.message).toBe(
      'La llave de idempotencia ya se usó con otra solicitud',
    );
    await post(body(), key, tokens.admin).expect(409);
    expect(
      await prisma.sale.count({ where: { creadoPorId: users.seller } }),
    ).toBe(1);
    expect(await stock(sizedId)).toBe('3.000');
  });

  it('creates exactly one sale for concurrent requests with the same key', async () => {
    const key = randomUUID();
    const responses = await Promise.all([post(body(), key), post(body(), key)]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0]!.body).toEqual(responses[1]!.body);
    expect(
      await prisma.sale.count({ where: { creadoPorId: users.seller } }),
    ).toBe(1);
    expect(await stock(sizedId)).toBe('3.000');
  });

  it('sells the last unit only once under concurrent requests', async () => {
    const last = {
      items: [{ productId: sizedId, sizeId: sizeM, quantity: 5 }],
      payment: { method: 'CARD', amount: 1495 },
    };
    const responses = await Promise.all([post(body(last)), post(body(last))]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await stock(sizedId)).toBe('0.000');
    expect(
      await prisma.sale.count({ where: { creadoPorId: users.seller } }),
    ).toBe(1);
  });

  it('cancels with stock returned and payment refunded; repeating changes nothing', async () => {
    const sale = await sell();
    const cancelled = await http()
      .post(`${base}/${sale.id}/cancelar`)
      .set('Authorization', tokens.seller)
      .send({ reason: ' Cliente devolvió ' })
      .expect(200);
    expect(cancelled.body).toMatchObject({
      id: sale.id,
      folio: sale.folio,
      estado: 'CANCELLED',
      fechaCancelacion: expect.any(String),
      canceladoPor: { id: users.seller, nombre: 'Sales seller' },
      motivoCancelacion: 'Cliente devolvió',
      pagos: [{ estado: 'REFUNDED', monto: '688.00' }],
    });
    expect(await stock(sizedId)).toBe('5.000');
    expect(await stock(plainId)).toBe('10.000');
    // Stock is derived from movements, so the catalog shows it immediately.
    const product = await http()
      .get(`/api/productos/${sizedId}`)
      .set('Authorization', tokens.seller)
      .expect(200);
    expect(product.body.existencias).toBe('5.000');
    const returns = await prisma.inventoryMovement.findMany({
      where: { referenciaId: sale.id, tipo: 'RETURN_IN' },
      select: { renglonVentaId: true, tipoReferencia: true, creadoPorId: true },
    });
    expect(returns).toHaveLength(2);
    expect(
      returns.every((m) => m.renglonVentaId && m.tipoReferencia === 'SALE_CANCEL'),
    ).toBe(true);

    const repeated = await http()
      .post(`${base}/${sale.id}/cancelar`)
      .set('Authorization', tokens.admin)
      .send({ reason: 'Otra vez' })
      .expect(200);
    expect(repeated.body).toEqual(cancelled.body);
    expect(
      await prisma.inventoryMovement.count({
        where: { referenciaId: sale.id, tipo: 'RETURN_IN' },
      }),
    ).toBe(2);
  });

  it('applies concurrent cancellations once', async () => {
    const sale = await sell();
    const responses = await Promise.all(
      [tokens.seller, tokens.admin].map((token) =>
        http()
          .post(`${base}/${sale.id}/cancelar`)
          .set('Authorization', token)
          .send({ reason: 'Duplicada' }),
      ),
    );
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await prisma.inventoryMovement.count({
        where: { referenciaId: sale.id, tipo: 'RETURN_IN' },
      }),
    ).toBe(2);
    expect(await stock(plainId)).toBe('10.000');
  });

  it('validates cancellation input and reports missing sales', async () => {
    const sale = await sell();
    for (const payload of [{}, { reason: ' ' }, { reason: 'x'.repeat(501) }]) {
      await http()
        .post(`${base}/${sale.id}/cancelar`)
        .set('Authorization', tokens.seller)
        .send(payload)
        .expect(400);
    }
    await http()
      .post(`${base}/${randomUUID()}/cancelar`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'x' })
      .expect(404);
    await http()
      .post(`${base}/not-a-uuid/cancelar`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'x' })
      .expect(400);
    await http()
      .get(`${base}/${randomUUID()}`)
      .set('Authorization', tokens.seller)
      .expect(404);
  });

  it('cancels a sale that came from a quote and keeps the quote converted', async () => {
    const quote = (
      await http()
        .post('/api/cotizaciones')
        .set('Authorization', tokens.seller)
        .send({
          customerId,
          items: [{ productId: plainId, quantity: 2 }],
        })
        .expect(201)
    ).body as QuoteDto;
    const paid = await http()
      .post(`/api/cotizaciones/${quote.id}/pagar`)
      .set('Authorization', tokens.seller)
      .send({ method: 'TRANSFER', amount: Number(quote.total) })
      .expect(200);
    const saleId = (paid.body as { id: string }).id;
    const detail = (
      await http()
        .get(`${base}/${saleId}`)
        .set('Authorization', tokens.seller)
        .expect(200)
    ).body as SaleDetailResponse;
    expect(detail).toMatchObject({ cotizacionId: quote.id, total: '200.00' });
    await http()
      .post(`${base}/${saleId}/cancelar`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'Error de captura' })
      .expect(200);
    expect(await stock(plainId)).toBe('10.000');
    expect(
      (await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } }))
        .estado,
    ).toBe('CONVERTED');
  });

  it('lists newest first with filters and pagination', async () => {
    const cash = await sell();
    const card = await sell(
      body({
        customerId: undefined,
        items: [{ productId: plainId, quantity: 1 }],
        payment: { method: 'CARD', amount: 100 },
      }),
    );
    const byAdmin = (
      await post(
        body({
          items: [{ productId: plainId, quantity: 2 }],
          payment: { method: 'CASH', amount: 200 },
        }),
        randomUUID(),
        tokens.admin,
      ).expect(201)
    ).body as SaleDetailResponse;
    await http()
      .post(`${base}/${cash.id}/cancelar`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'x' })
      .expect(200);

    const list = async (query: Record<string, string | number>) =>
      (
        await http()
          .get(base)
          .query(query)
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as SalePageResponse;
    const mine = { customerId };

    const all = await list(mine);
    expect(all.datos.map(({ id }) => id)).toEqual([byAdmin.id, cash.id]);
    expect(all).toMatchObject({ total: 2, pagina: 1, limite: 20 });
    expect(all.datos[1]).toEqual({
      id: cash.id,
      folio: cash.folio,
      estado: 'CANCELLED',
      total: '688.00',
      metodoPago: 'CASH',
      cliente: { id: customerId, nombre: 'Ana Pérez' },
      creadoPor: { id: users.seller, nombre: 'Sales seller' },
      cotizacionId: null,
      fechaCreacion: cash.fechaCreacion,
    });

    expect((await list({ ...mine, status: 'CANCELLED' })).datos).toHaveLength(1);
    expect(
      (await list({ ...mine, createdById: users.admin })).datos[0]!.id,
    ).toBe(byAdmin.id);
    expect((await list({ folio: card.folio.toLowerCase() })).datos).toEqual([
      expect.objectContaining({ id: card.id, metodoPago: 'CARD' }),
    ]);
    const cardOnly = await list({
      createdById: users.seller,
      paymentMethod: 'CARD',
    });
    expect(cardOnly.datos.map(({ id }) => id)).toEqual([card.id]);

    const page2 = await list({ ...mine, page: 2, pageSize: 1 });
    expect(page2).toMatchObject({ total: 2, pagina: 2, limite: 1 });
    expect(page2.datos.map(({ id }) => id)).toEqual([cash.id]);

    const after = await list({ ...mine, startDate: byAdmin.fechaCreacion });
    expect(after.datos.map(({ id }) => id)).toEqual([byAdmin.id]);
    const before = await list({ ...mine, endDate: cash.fechaCreacion });
    expect(before.datos.map(({ id }) => id)).toEqual([cash.id]);

    for (const query of [
      { startDate: '2026-10-02T00:00:00Z', endDate: '2026-10-01T00:00:00Z' },
      { startDate: 'ayer' },
      { page: 0 },
      { page: 1.5 },
      { pageSize: 101 },
      { status: 'DONE' },
      { paymentMethod: 'CRYPTO' },
      { customerId: 'x' },
      { unknown: 1 },
    ]) {
      await http()
        .get(base)
        .query(query)
        .set('Authorization', tokens.seller)
        .expect(400);
    }
  });

  it('requires authentication and a sales role', async () => {
    await http().get(base).expect(401);
    await http()
      .post(base)
      .set('Idempotency-Key', randomUUID())
      .send(body())
      .expect(401);
    await http().get(base).set('Authorization', tokens.noRole).expect(403);
    await post(body(), randomUUID(), tokens.noRole).expect(403);
    await http()
      .post(`${base}/${randomUUID()}/cancelar`)
      .set('Authorization', tokens.noRole)
      .send({ reason: 'x' })
      .expect(403);
    await http().get(base).set('Authorization', tokens.admin).expect(200);
  });
});
