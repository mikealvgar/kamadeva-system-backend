import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type { SaleDetailDto, SalePageDto } from '../src/sales/dto/sale.dto.js';
import type { QuoteDto } from '../src/quotes/dto/quote.dto.js';

const base = '/api/sales';

describe('Sales HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  let categoryId: string;
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
          name: `Sales ${key}`,
          email: `${randomUUID()}@sales.test`,
          passwordHash: 'unused-test-hash',
          ...(role
            ? { roles: { create: { role: { connect: { name: role } } } } }
            : {}),
        },
      });
      users[key] = user.id;
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: role ? [role] : [] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
  });

  beforeEach(async () => {
    categoryId = (
      await prisma.category.create({
        data: { name: 'Ventas', slug: `sales-${randomUUID()}` },
      })
    ).id;
    customerId = (await prisma.customer.create({ data: { name: 'Ana Pérez' } }))
      .id;
    sizeM = (
      await prisma.size.create({
        data: { name: `M-${randomUUID().slice(0, 8)}`.toUpperCase() },
      })
    ).id;
    const product = (data: object) =>
      prisma.product.create({
        data: { barcode: randomUUID(), categoryId, ...data } as never,
      });
    sizedId = (
      await product({
        name: 'Playera',
        price: '299.00',
        sizes: { create: { sizeId: sizeM } },
      })
    ).id;
    plainId = (await product({ name: 'Gorra', price: '100.00' })).id;
    inactiveId = (
      await product({ name: 'Viejo', price: '1.00', isActive: false })
    ).id;
    for (const [productId, quantity] of [
      [sizedId, 5],
      [plainId, 10],
      [inactiveId, 10],
    ] as const) {
      await prisma.inventoryMovement.create({
        data: { productId, type: 'PURCHASE_IN', quantityChange: quantity },
      });
    }
  });

  afterEach(async () => {
    if (!prisma) return;
    const productIds = [sizedId, plainId, inactiveId];
    const userIds = Object.values(users);
    const sales = await prisma.sale.findMany({
      where: { createdById: { in: userIds } },
      select: { id: true },
    });
    const saleIds = sales.map(({ id }) => id);
    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.idempotencyKey.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.payment.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.quote.deleteMany({ where: { customerId } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.size.deleteMany({ where: { id: sizeM } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const userIds = Object.values(users);
        await prisma.userRole.deleteMany({
          where: { userId: { in: userIds } },
        });
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
      { productId: plainId, quantity: 1, discount: 10, tax: 5 },
    ],
    payment: { method: 'CASH', amount: 693 },
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

  async function stock(productId: string): Promise<string> {
    const total = await prisma.inventoryMovement.aggregate({
      where: { productId },
      _sum: { quantityChange: true },
    });
    return total._sum.quantityChange?.toFixed(3) ?? '0.000';
  }

  async function sell(payload: object = body()): Promise<SaleDetailDto> {
    return (await post(payload).expect(201)).body as SaleDetailDto;
  }

  it('sells without a quote: server prices, stock out, paid payment and full detail', async () => {
    const sale = await sell(body({ notes: ' Mostrador ' }));
    expect(sale).toEqual({
      id: expect.any(String),
      folio: expect.stringMatching(/^V-\d{6,}$/),
      status: 'COMPLETED',
      customer: { id: customerId, name: 'Ana Pérez' },
      createdBy: { id: users.seller, name: 'Sales seller' },
      quoteId: null,
      notes: 'Mostrador',
      subtotal: '698.00',
      discount: '10.00',
      tax: '5.00',
      total: '693.00',
      items: expect.any(Array),
      payments: [
        {
          id: expect.any(String),
          method: 'CASH',
          amount: '693.00',
          status: 'PAID',
          paidAt: expect.any(String),
        },
      ],
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(
      Object.fromEntries(
        sale.items.map((item) => [
          item.product.id,
          [item.size?.id ?? null, item.quantity, item.unitPrice, item.total],
        ]),
      ),
    ).toEqual({
      [sizedId]: [sizeM, '2.000', '299.00', '598.00'],
      [plainId]: [null, '1.000', '100.00', '95.00'],
    });
    expect(await stock(sizedId)).toBe('3.000');
    expect(await stock(plainId)).toBe('9.000');
    expect(
      await prisma.inventoryMovement.count({
        where: {
          referenceId: sale.id,
          type: 'SALE_OUT',
          saleItemId: { not: null },
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
      where: { id: sale.customer!.id },
    });
    expect(stored.isDefault).toBe(true);
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
      body({ payment: { method: 'CRYPTO', amount: 693 } }),
      body({ payment: { method: 'CASH', amount: 1.001 } }),
      body({ payment: undefined }),
      body({ customerId: 'x' }),
      body({ notes: 'x'.repeat(501) }),
      body({ total: 1 }),
      // Business-rule 400s
      body({ payment: { method: 'CASH', amount: 692.99 } }),
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
      await prisma.sale.count({ where: { createdById: users.seller } }),
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
      await prisma.sale.count({ where: { createdById: users.seller } }),
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
      await prisma.sale.count({ where: { createdById: users.seller } }),
    ).toBe(1);
    expect(await stock(sizedId)).toBe('3.000');
  });

  it('creates exactly one sale for concurrent requests with the same key', async () => {
    const key = randomUUID();
    const responses = await Promise.all([post(body(), key), post(body(), key)]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0]!.body).toEqual(responses[1]!.body);
    expect(
      await prisma.sale.count({ where: { createdById: users.seller } }),
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
      await prisma.sale.count({ where: { createdById: users.seller } }),
    ).toBe(1);
  });

  it('cancels with stock returned and payment refunded; repeating changes nothing', async () => {
    const sale = await sell();
    const cancelled = await http()
      .post(`${base}/${sale.id}/cancel`)
      .set('Authorization', tokens.seller)
      .send({ reason: ' Cliente devolvió ' })
      .expect(200);
    expect(cancelled.body).toMatchObject({
      id: sale.id,
      folio: sale.folio,
      status: 'CANCELLED',
      cancelledAt: expect.any(String),
      cancelledBy: { id: users.seller, name: 'Sales seller' },
      cancelReason: 'Cliente devolvió',
      payments: [{ status: 'REFUNDED', amount: '693.00' }],
    });
    expect(await stock(sizedId)).toBe('5.000');
    expect(await stock(plainId)).toBe('10.000');
    // Stock is derived from movements, so the catalog shows it immediately.
    const product = await http()
      .get(`/api/catalog/products/${sizedId}`)
      .set('Authorization', tokens.seller)
      .expect(200);
    expect(product.body.stock).toBe('5.000');
    const returns = await prisma.inventoryMovement.findMany({
      where: { referenceId: sale.id, type: 'RETURN_IN' },
      select: { saleItemId: true, referenceType: true, createdById: true },
    });
    expect(returns).toHaveLength(2);
    expect(
      returns.every((m) => m.saleItemId && m.referenceType === 'SALE_CANCEL'),
    ).toBe(true);

    const repeated = await http()
      .post(`${base}/${sale.id}/cancel`)
      .set('Authorization', tokens.admin)
      .send({ reason: 'Otra vez' })
      .expect(200);
    expect(repeated.body).toEqual(cancelled.body);
    expect(
      await prisma.inventoryMovement.count({
        where: { referenceId: sale.id, type: 'RETURN_IN' },
      }),
    ).toBe(2);
  });

  it('applies concurrent cancellations once', async () => {
    const sale = await sell();
    const responses = await Promise.all(
      [tokens.seller, tokens.admin].map((token) =>
        http()
          .post(`${base}/${sale.id}/cancel`)
          .set('Authorization', token)
          .send({ reason: 'Duplicada' }),
      ),
    );
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await prisma.inventoryMovement.count({
        where: { referenceId: sale.id, type: 'RETURN_IN' },
      }),
    ).toBe(2);
    expect(await stock(plainId)).toBe('10.000');
  });

  it('validates cancellation input and reports missing sales', async () => {
    const sale = await sell();
    for (const payload of [{}, { reason: ' ' }, { reason: 'x'.repeat(501) }]) {
      await http()
        .post(`${base}/${sale.id}/cancel`)
        .set('Authorization', tokens.seller)
        .send(payload)
        .expect(400);
    }
    await http()
      .post(`${base}/${randomUUID()}/cancel`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'x' })
      .expect(404);
    await http()
      .post(`${base}/not-a-uuid/cancel`)
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
        .post('/api/quotes')
        .set('Authorization', tokens.seller)
        .send({
          customerId,
          items: [{ productId: plainId, quantity: 2 }],
        })
        .expect(201)
    ).body as QuoteDto;
    const paid = await http()
      .post(`/api/quotes/${quote.id}/pay`)
      .set('Authorization', tokens.seller)
      .send({ method: 'TRANSFER', amount: Number(quote.total) })
      .expect(200);
    const saleId = (paid.body as { id: string }).id;
    const detail = (
      await http()
        .get(`${base}/${saleId}`)
        .set('Authorization', tokens.seller)
        .expect(200)
    ).body as SaleDetailDto;
    expect(detail).toMatchObject({ quoteId: quote.id, total: '200.00' });
    await http()
      .post(`${base}/${saleId}/cancel`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'Error de captura' })
      .expect(200);
    expect(await stock(plainId)).toBe('10.000');
    expect(
      (await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } }))
        .status,
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
    ).body as SaleDetailDto;
    await http()
      .post(`${base}/${cash.id}/cancel`)
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
      ).body as SalePageDto;
    const mine = { customerId };

    const all = await list(mine);
    expect(all.data.map(({ id }) => id)).toEqual([byAdmin.id, cash.id]);
    expect(all).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(all.data[1]).toEqual({
      id: cash.id,
      folio: cash.folio,
      status: 'CANCELLED',
      total: '693.00',
      paymentMethod: 'CASH',
      customer: { id: customerId, name: 'Ana Pérez' },
      createdBy: { id: users.seller, name: 'Sales seller' },
      quoteId: null,
      createdAt: cash.createdAt,
    });

    expect((await list({ ...mine, status: 'CANCELLED' })).data).toHaveLength(1);
    expect(
      (await list({ ...mine, createdById: users.admin })).data[0]!.id,
    ).toBe(byAdmin.id);
    expect((await list({ folio: card.folio.toLowerCase() })).data).toEqual([
      expect.objectContaining({ id: card.id, paymentMethod: 'CARD' }),
    ]);
    const cardOnly = await list({
      createdById: users.seller,
      paymentMethod: 'CARD',
    });
    expect(cardOnly.data.map(({ id }) => id)).toEqual([card.id]);

    const page2 = await list({ ...mine, page: 2, pageSize: 1 });
    expect(page2).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(page2.data.map(({ id }) => id)).toEqual([cash.id]);

    const after = await list({ ...mine, startDate: byAdmin.createdAt });
    expect(after.data.map(({ id }) => id)).toEqual([byAdmin.id]);
    const before = await list({ ...mine, endDate: cash.createdAt });
    expect(before.data.map(({ id }) => id)).toEqual([cash.id]);

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
      .post(`${base}/${randomUUID()}/cancel`)
      .set('Authorization', tokens.noRole)
      .send({ reason: 'x' })
      .expect(403);
    await http().get(base).set('Authorization', tokens.admin).expect(200);
  });
});
