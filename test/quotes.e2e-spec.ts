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
import type { QuoteDto, SaleDto } from '../src/quotes/dto/quote.dto.js';

vi.mock('node:crypto', async (importOriginal) => {
  const crypto = await importOriginal<typeof import('node:crypto')>();
  return { ...crypto, randomUUID: vi.fn(crypto.randomUUID) };
});

const base = '/api/quotes';
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
    items: [{ productId, quantity: 2.5, discount: 100, tax: 320 }],
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
    for (const [key, role, isActive] of [
      ['admin', 'ADMIN', true],
      ['seller', 'VENDEDOR', true],
      ['inactive', 'ADMIN', false],
      ['noRole', null, true],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          name: 'Quotes test',
          email: `${randomUUID()}@quotes.test`,
          passwordHash: 'unused',
          isActive,
          ...(role
            ? { roles: { create: { role: { connect: { name: role } } } } }
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
        data: { name: 'Ana', email: 'ana@quotes.test' },
      })
    ).id;
    otherCustomerId = (await prisma.customer.create({ data: { name: 'Otra' } }))
      .id;
    categoryId = (
      await prisma.category.create({
        data: { name: 'Quotes', slug: randomUUID() },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: 'Producto',
          sku: randomUUID(),
          categoryId,
          price: '1250.50',
          imageUrl: 'https://example.test/product.png',
        },
      })
    ).id;
    otherProductId = (
      await prisma.product.create({
        data: { name: 'Otro', sku: randomUUID(), categoryId, price: '10.00' },
      })
    ).id;
    await prisma.inventoryMovement.createMany({
      data: [productId, otherProductId].map((id) => ({
        productId: id,
        type: 'PURCHASE_IN',
        quantityChange: '20.000',
      })),
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!prisma || !customerId) return;
    const customerIds = [customerId, otherCustomerId];
    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: [productId, otherProductId] } },
    });
    await prisma.payment.deleteMany({
      where: { sale: { customerId: { in: customerIds } } },
    });
    await prisma.sale.deleteMany({
      where: { customerId: { in: customerIds } },
    });
    await prisma.quote.deleteMany({
      where: { customerId: { in: customerIds } },
    });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.userRole.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function create(
    input: object = body(),
    token = auth(),
  ): Promise<QuoteDto> {
    const response = await http()
      .post(base)
      .set('Authorization', token)
      .send(input)
      .expect(201);
    return response.body as QuoteDto;
  }
  async function stock(id = productId): Promise<string> {
    const result = await prisma.inventoryMovement.aggregate({
      where: { productId: id },
      _sum: { quantityChange: true },
    });
    return (result._sum.quantityChange ?? new Prisma.Decimal(0)).toFixed(3);
  }
  async function expectNoConversion(
    id: string,
    status = 'DRAFT',
  ): Promise<void> {
    expect(await prisma.sale.count({ where: { quoteId: id } })).toBe(0);
    expect(
      await prisma.saleItem.count({ where: { sale: { customerId } } }),
    ).toBe(0);
    expect(
      await prisma.payment.count({ where: { sale: { customerId } } }),
    ).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: {
          productId: { in: [productId, otherProductId] },
          type: 'SALE_OUT',
        },
      }),
    ).toBe(0);
    expect(
      (await prisma.quote.findUniqueOrThrow({ where: { id } })).status,
    ).toBe(status);
  }

  it('creates a complete public draft with exact decimals and persisted prices', async () => {
    const input = body();
    const result = await create(input);
    expect(result).toEqual({
      id: expect.any(String),
      folio: expect.stringMatching(/^COT-\d{8}-[0-9A-F]{6}$/),
      status: 'DRAFT',
      customer: {
        id: customerId,
        name: 'Ana',
        phone: null,
        email: 'ana@quotes.test',
        isActive: true,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      items: [
        {
          id: expect.any(String),
          product: {
            id: productId,
            name: 'Producto',
            sku: expect.any(String),
            imageUrl: 'https://example.test/product.png',
          },
          quantity: '2.500',
          unitPrice: '1250.50',
          discount: '100.00',
          tax: '320.00',
          total: '3346.25',
        },
      ],
      subtotal: '3126.25',
      discount: '100.00',
      tax: '320.00',
      total: '3346.25',
      notes: 'Entrega',
      expiresAt: input.expiresAt,
      canPay: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(
      (await prisma.quote.findUniqueOrThrow({ where: { id: result.id } }))
        .createdById,
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
      data: { price: '0.10' },
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
      tax: '0.00',
      discount: '0.00',
      expiresAt: null,
      notes: null,
      canPay: true,
    });
    expect(result.items.map((item) => item.total)).toEqual(['0.02', '0.02']);
  });

  it('retries a real PostgreSQL quote folio collision once', async () => {
    const first = await create();
    vi.mocked(randomUUID).mockReturnValueOnce(
      `${first.folio.slice(-6).toLowerCase()}00-0000-4000-8000-000000000000`,
    );
    const second = await create();
    expect(second.folio).not.toBe(first.folio);
    expect(await prisma.quote.count({ where: { customerId } })).toBe(2);
    expect(
      await prisma.quoteItem.count({ where: { quote: { customerId } } }),
    ).toBe(2);
  });

  it('retries a real PostgreSQL sale folio collision without duplicate effects', async () => {
    const first = await create();
    const paid = await http()
      .post(`${base}/${first.id}/pay`)
      .set('Authorization', auth())
      .send({ method: 'CASH', amount: Number(first.total) })
      .expect(200);
    const firstSale = paid.body as SaleDto;
    const second = await create();
    vi.mocked(randomUUID).mockReturnValueOnce(
      `${firstSale.folio.slice(-6).toLowerCase()}00-0000-4000-8000-000000000000`,
    );
    const retried = await http()
      .post(`${base}/${second.id}/pay`)
      .set('Authorization', auth())
      .send({ method: 'CASH', amount: Number(second.total) })
      .expect(200);
    expect((retried.body as SaleDto).folio).not.toBe(firstSale.folio);
    expect(await prisma.sale.count({ where: { customerId } })).toBe(2);
    expect(
      await prisma.payment.count({ where: { sale: { customerId } } }),
    ).toBe(2);
    expect(await stock()).toBe('15.000');
  });

  it('lists newest first with combined status, customer and case-insensitive folio filters', async () => {
    const first = await create();
    const second = await create({ ...body(), customerId: otherCustomerId });
    await prisma.quote.update({
      where: { id: first.id },
      data: { createdAt: new Date('2020-01-01'), status: 'SENT' },
    });
    const all = await http().get(base).set('Authorization', auth()).expect(200);
    expect((all.body as QuoteDto[]).map((item) => item.id)).toEqual([
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
      expect((response.body as QuoteDto[]).map((item) => item.id)).toEqual([
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
      data: { price: '15.00' },
    });
    const metadata = await http()
      .patch(`${base}/${original.id}`)
      .set('Authorization', auth())
      .send({ notes: ' ', customerId: otherCustomerId, expiresAt: future() })
      .expect(200);
    expect(metadata.body).toMatchObject({
      notes: null,
      customer: { id: otherCustomerId },
      total: original.total,
      items: original.items,
    });
    const updated = await http()
      .patch(`${base}/${original.id}`)
      .set('Authorization', auth())
      .send({
        items: [
          { productId, quantity: 3 },
          { productId: otherProductId, quantity: 2, discount: 1, tax: 2 },
        ],
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      subtotal: '65.00',
      discount: '1.00',
      tax: '2.00',
      total: '66.00',
    });
    expect(
      (updated.body as QuoteDto).items.map((item) => item.unitPrice).sort(),
    ).toEqual(['10.00', '15.00']);
    expect(
      await prisma.quoteItem.count({ where: { id: original.items[0]!.id } }),
    ).toBe(0);
    expect(
      await prisma.quoteItem.count({ where: { quoteId: original.id } }),
    ).toBe(2);
  });

  it('sends without conversion effects, rejects another send or edit, and has no approval endpoint', async () => {
    const original = await create();
    const sent = await http()
      .post(`${base}/${original.id}/send`)
      .set('Authorization', auth())
      .expect(200);
    expect(sent.body).toMatchObject({ status: 'SENT', canPay: true });
    await expectNoConversion(original.id, 'SENT');
    expect(await stock()).toBe('20.000');
    await http()
      .post(`${base}/${original.id}/send`)
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
          .post(`${base}/${original.id}/send`)
          .set('Authorization', auth())
          .expect(200);
      await prisma.product.update({
        where: { id: productId },
        data: { price: '999.99' },
      });
      const paid = await http()
        .post(`${base}/${original.id}/pay`)
        .set('Authorization', auth())
        .send({ method: 'CASH', amount: Number(original.total) })
        .expect(200);
      const sale = paid.body as SaleDto;
      expect(Object.keys(sale).sort()).toEqual(
        [
          'id',
          'folio',
          'status',
          'customer',
          'quoteId',
          'subtotal',
          'discount',
          'tax',
          'total',
          'notes',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
      expect(sale).toMatchObject({
        folio: expect.stringMatching(/^VEN-\d{8}-[0-9A-F]{6}$/),
        status: 'COMPLETED',
        quoteId: original.id,
        customer: original.customer,
        subtotal: original.subtotal,
        discount: original.discount,
        tax: original.tax,
        total: original.total,
        notes: original.notes,
      });
      const record = await prisma.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { items: true, payments: true },
      });
      expect(record.items).toHaveLength(1);
      expect(record.items[0]!.unitPrice.toFixed(2)).toBe('1250.50');
      expect(record.items[0]!.quantity.toFixed(3)).toBe('2.500');
      expect(record.items[0]!.total.toFixed(2)).toBe(original.total);
      expect(record.payments).toHaveLength(1);
      expect(record.payments[0]).toMatchObject({
        status: 'PAID',
        method: 'CASH',
        createdById: actors.seller,
        paidAt: expect.any(Date),
      });
      expect(record.payments[0]!.amount.toFixed(2)).toBe(original.total);
      const movements = await prisma.inventoryMovement.findMany({
        where: { referenceId: sale.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        type: 'SALE_OUT',
        productId,
        saleItemId: record.items[0]!.id,
        referenceType: 'SALE',
        referenceId: sale.id,
        createdById: actors.seller,
      });
      expect(movements[0]!.quantityChange.toFixed(3)).toBe('-2.500');
      expect(await stock()).toBe('17.500');
      expect(
        (
          await http()
            .get(`${base}/${original.id}`)
            .set('Authorization', auth())
            .expect(200)
        ).body,
      ).toMatchObject({ status: 'CONVERTED', canPay: false });
      await http()
        .post(`${base}/${original.id}/pay`)
        .set('Authorization', auth())
        .send({ method: 'CASH', amount: Number(original.total) })
        .expect(409);
      await http()
        .post(`${base}/${original.id}/send`)
        .set('Authorization', auth())
        .expect(409);
      await http()
        .patch(`${base}/${original.id}`)
        .set('Authorization', auth())
        .send({ notes: 'edit' })
        .expect(409);
      expect(await stock()).toBe('17.500');
      expect(await prisma.payment.count({ where: { saleId: sale.id } })).toBe(
        1,
      );
    },
  );

  it.each(['CARD', 'TRANSFER', 'OTHER'] satisfies PaymentMethod[])(
    'records full payments using %s',
    async (method) => {
      const original = await create();
      const result = await http()
        .post(`${base}/${original.id}/pay`)
        .set('Authorization', tokens.admin!)
        .send({ method, amount: Number(original.total) })
        .expect(200);
      expect(
        await prisma.payment.findFirstOrThrow({
          where: { saleId: (result.body as SaleDto).id },
        }),
      ).toMatchObject({ method, status: 'PAID', createdById: actors.admin });
    },
  );

  it.each(['DRAFT', 'SENT'] as const)(
    'blocks expired %s with no sale, payment or inventory effects',
    async (status) => {
      const original = await create();
      await prisma.quote.update({
        where: { id: original.id },
        data: { status, expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (
          await http()
            .get(`${base}/${original.id}`)
            .set('Authorization', auth())
            .expect(200)
        ).body,
      ).toMatchObject({ canPay: false, status });
      const listed = await http()
        .get(base)
        .query({ customerId })
        .set('Authorization', auth())
        .expect(200);
      expect((listed.body as QuoteDto[])[0]!.canPay).toBe(false);
      const result = await http()
        .post(`${base}/${original.id}/pay`)
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
      .post(`${base}/${original.id}/pay`)
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
      .post(`${base}/${original.id}/pay`)
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
      .post(`${base}/${original.id}/pay`)
      .set('Authorization', auth())
      .send({
        method: 'CASH',
        amount: Number((changed.body as QuoteDto).total),
      })
      .expect(200);
    expect(await stock()).toBe('0.000');
    expect(await stock(otherProductId)).toBe('0.000');
    expect(
      await prisma.inventoryMovement.count({
        where: {
          type: 'SALE_OUT',
          productId: { in: [productId, otherProductId] },
        },
      }),
    ).toBe(2);
  });

  it('allows only one successful simultaneous payment of the same quote', async () => {
    const original = await create();
    const results = await Promise.all(
      [1, 2].map(() =>
        http()
          .post(`${base}/${original.id}/pay`)
          .set('Authorization', auth())
          .send({ method: 'CASH', amount: Number(original.total) }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await prisma.sale.count({ where: { quoteId: original.id } })).toBe(
      1,
    );
    expect(
      await prisma.payment.count({ where: { sale: { quoteId: original.id } } }),
    ).toBe(1);
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
          .post(`${base}/${original.id}/pay`)
          .set('Authorization', auth())
          .send({ method: 'CASH', amount: Number(original.total) }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await stock()).toBe('5.000');
    expect(await prisma.sale.count({ where: { customerId } })).toBe(1);
    expect(
      await prisma.quote.count({ where: { customerId, status: 'CONVERTED' } }),
    ).toBe(1);
  });

  it.each(['payment', 'quote'] as const)(
    'rolls back all database writes if %s fails late in conversion',
    async (failureStage) => {
      const original = await create();
      const transaction = prisma.$transaction.bind(prisma);
      const options = {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      };
      const spy = vi.spyOn(prisma, '$transaction').mockImplementation((async (
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        transaction(async (tx) => {
          if (failureStage === 'payment')
            vi.spyOn(tx.payment, 'create').mockRejectedValueOnce(
              new Error('Injected payment failure'),
            );
          else
            vi.spyOn(tx.quote, 'update').mockRejectedValueOnce(
              new Error('Injected conversion failure'),
            );
          return operation(tx);
        }, options)) as typeof prisma.$transaction);
      try {
        await http()
          .post(`${base}/${original.id}/pay`)
          .set('Authorization', auth())
          .send({ method: 'CASH', amount: Number(original.total) })
          .expect(500);
      } finally {
        spy.mockRestore();
      }
      await expectNoConversion(original.id);
      expect(await stock()).toBe('20.000');
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
      await prisma.quoteItem.count({ where: { quoteId: original.id } }),
    ).toBe(0);
    await http()
      .delete(`${base}/${original.id}`)
      .set('Authorization', tokens.admin!)
      .expect(404);
    const sent = await create();
    await http()
      .post(`${base}/${sent.id}/send`)
      .set('Authorization', auth())
      .expect(200);
    await http()
      .delete(`${base}/${sent.id}`)
      .set('Authorization', tokens.admin!)
      .expect(409);
    await http()
      .post(`${base}/${sent.id}/pay`)
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
    expect(await prisma.quote.count({ where: { customerId } })).toBe(0);
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
        .post(`${base}/${original.id}/pay`)
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
        .post(`${base}/${id}/send`)
        .set('Authorization', auth())
        .expect(status);
      await http()
        .post(`${base}/${id}/pay`)
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
      ['post', `${base}/${original.id}/send`],
      ['post', `${base}/${original.id}/pay`],
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
      [`${base}/{id}/send`, 'post', '200'],
      [`${base}/{id}/pay`, 'post', '200'],
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
        'status',
        'customer',
        'items',
        'subtotal',
        'discount',
        'tax',
        'total',
        'notes',
        'expiresAt',
        'canPay',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(
      response.body.components.schemas.CustomerDto.properties.isDefault,
    ).toBeUndefined();
  });
});
