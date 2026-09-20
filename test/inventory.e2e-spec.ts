import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type { InventoryMovementDto } from '../src/catalog/products/dto/inventory-movement.dto.js';

const globalPath = '/api/inventory/movements';
describe('Inventory HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const users: string[] = [];
  const products: string[] = [];
  let categoryId: string;
  const tokens: Record<string, string> = {};
  const http = () => request(app!.getHttpServer());
  const path = (id = products[0]!) => `/api/catalog/products/${id}/movements`;
  const post = (body: object, id = products[0]!) =>
    http().post(path(id)).set('Authorization', tokens.admin!).send(body);
  const get = (query: object = {}) =>
    http().get(globalPath).set('Authorization', tokens.seller!).query(query);

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
          name: 'Inventory test',
          email: `${randomUUID()}@inventory.test`,
          passwordHash: 'unused',
          isActive,
          ...(role
            ? { roles: { create: { role: { connect: { name: role } } } } }
            : {}),
        },
      });
      users.push(user.id);
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: role ? [role] : [] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
    const category = await prisma.category.create({
      data: { name: 'Inventory test', slug: `inventory-${randomUUID()}` },
    });
    categoryId = category.id;
  });
  beforeEach(async () => {
    for (let index = 0; index < 2; index++) {
      const product = await prisma.product.create({
        data: {
          name: 'Inventory test',
          sku: randomUUID(),
          price: 1,
          categoryId,
        },
      });
      products.push(product.id);
    }
  });
  afterEach(async () => {
    if (!prisma) return;
    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: products } },
    });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    products.length = 0;
  });
  afterAll(async () => {
    try {
      if (prisma) {
        if (categoryId)
          await prisma.category.delete({ where: { id: categoryId } });
        await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
    } finally {
      await app?.close();
    }
  });

  it.each(['PURCHASE_IN', 'RETURN_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])(
    'creates %s with derived sign, author and stock',
    async (type) => {
      const response = await post({
        type,
        quantity: 2.125,
        unitCost: 780.25,
        notes: ' Compra ',
      }).expect(201);
      const movement = response.body as InventoryMovementDto;
      const quantity = type === 'ADJUSTMENT_OUT' ? '-2.125' : '2.125';
      expect(movement).toEqual({
        id: expect.any(String),
        type,
        quantityChange: quantity,
        unitCost: '780.25',
        notes: 'Compra',
        referenceType: null,
        referenceId: null,
        createdAt: expect.any(String),
      });
      expect(
        await prisma.inventoryMovement.findUnique({
          where: { id: movement.id },
        }),
      ).toMatchObject({
        productId: products[0],
        createdById: users[0],
        saleItemId: null,
      });
      const detail = await http()
        .get(`/api/catalog/products/${products[0]}`)
        .set('Authorization', tokens.seller!)
        .expect(200);
      expect(detail.body.stock).toBe(quantity);
      const list = await http()
        .get('/api/catalog/products')
        .query({ categoryId })
        .set('Authorization', tokens.seller!)
        .expect(200);
      expect(list.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: products[0], stock: quantity }),
        ]),
      );
      const history = await http()
        .get(path())
        .set('Authorization', tokens.seller!)
        .expect(200);
      expect(history.body).toEqual([movement]);
    },
  );
  it('normalizes blank notes and omitted optional fields; accepts zero cost and minimum quantity', async () => {
    const first = await post({
      type: 'PURCHASE_IN',
      quantity: 0.001,
      notes: '   ',
    }).expect(201);
    expect(first.body).toMatchObject({
      quantityChange: '0.001',
      unitCost: null,
      notes: null,
    });
    const second = await post({
      type: 'RETURN_IN',
      quantity: 1,
      unitCost: 0,
    }).expect(201);
    expect(second.body).toMatchObject({ unitCost: '0.00', notes: null });
  });
  it('accepts maximum persisted precision without rounding', async () => {
    const result = await post({
      type: 'PURCHASE_IN',
      quantity: 99999999999.999,
      unitCost: 9999999999.99,
      notes: 'x'.repeat(500),
    }).expect(201);
    expect(result.body).toMatchObject({
      quantityChange: '99999999999.999',
      unitCost: '9999999999.99',
    });
  });
  it.each([
    { type: 'SALE_OUT' },
    { type: 'INVALID' },
    { type: null },
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 0.0001 },
    { quantity: 100000000000 },
    { quantity: '1' },
    { quantity: null },
    { unitCost: -1 },
    { unitCost: 0.001 },
    { unitCost: 10000000000 },
    { unitCost: '1' },
    { unitCost: null },
    { notes: 'x'.repeat(501) },
    { notes: 1 },
    { notes: null },
    { createdById: randomUUID() },
    { quantityChange: 1 },
    { referenceType: 'SALE' },
    { referenceId: randomUUID() },
    { saleItemId: randomUUID() },
  ])('rejects invalid body %j without persistence', async (override) => {
    await post({ type: 'PURCHASE_IN', quantity: 1, ...override }).expect(400);
    expect(
      await prisma.inventoryMovement.count({
        where: { productId: products[0] },
      }),
    ).toBe(0);
  });
  it('rejects missing required fields and invalid or missing products', async () => {
    for (const body of [{}, { type: 'PURCHASE_IN' }, { quantity: 1 }])
      await post(body).expect(400);
    await post({ type: 'PURCHASE_IN', quantity: 1 }, 'invalid').expect(400);
    await post({ type: 'PURCHASE_IN', quantity: 1 }, randomUUID()).expect(404);
    await get({ productId: randomUUID() }).expect(404);
  });
  it('lists globally, combines filters inclusively and returns empty results', async () => {
    const dates = [
      '2026-09-10T00:00:00.000Z',
      '2026-09-11T00:00:00.000Z',
      '2026-09-12T00:00:00.000Z',
    ];
    const ids: string[] = [];
    for (const [index, type] of [
      'PURCHASE_IN',
      'ADJUSTMENT_OUT',
      'SALE_OUT',
    ].entries()) {
      const movement = await prisma.inventoryMovement.create({
        data: {
          productId: products[index === 2 ? 1 : 0]!,
          type: type as 'PURCHASE_IN' | 'ADJUSTMENT_OUT' | 'SALE_OUT',
          quantityChange: index === 0 ? 1 : -1,
          createdAt: new Date(dates[index]!),
        },
      });
      ids.push(movement.id);
    }
    const all = await get().expect(200);
    expect(all.body.map((m: InventoryMovementDto) => m.id)).toEqual(
      [...ids].reverse(),
    );
    const combined = await get({
      productId: products[0],
      type: 'ADJUSTMENT_OUT',
      startDate: dates[1],
      endDate: dates[1],
    }).expect(200);
    expect(combined.body.map((m: InventoryMovementDto) => m.id)).toEqual([
      ids[1],
    ]);
    expect((await get({ startDate: dates[1] }).expect(200)).body).toHaveLength(
      2,
    );
    expect((await get({ endDate: dates[1] }).expect(200)).body).toHaveLength(2);
    expect((await get({ type: 'SALE_OUT' }).expect(200)).body).toHaveLength(1);
    expect(
      (await get({ productId: products[0] }).expect(200)).body,
    ).toHaveLength(2);
    expect((await get({ type: 'RETURN_IN' }).expect(200)).body).toEqual([]);
  });
  it.each([
    'productId=bad',
    'type=bad',
    'startDate=bad',
    'endDate=2026-02-30',
    'startDate=2026-13-01',
    'type=SALE_OUT&type=RETURN_IN',
    'startDate=2026-01-01&startDate=2026-02-01',
    'unknown=1',
  ])('rejects invalid query %s', async (query) => {
    await http()
      .get(`${globalPath}?${query}`)
      .set('Authorization', tokens.admin!)
      .expect(400);
  });
  it('returns an empty list for an existing product with no movements', async () => {
    expect((await get({ productId: products[0] }).expect(200)).body).toEqual(
      [],
    );
  });
  it('enforces authentication, active users and roles on both routes', async () => {
    for (const [method, endpoint] of [
      ['post', path()],
      ['get', globalPath],
    ] as const) {
      for (const token of [undefined, 'Bearer invalid', tokens.inactive]) {
        const operation = http()[method](endpoint);
        if (token) operation.set('Authorization', token);
        await operation.expect(401);
      }
      await http()
        [method](endpoint)
        .set('Authorization', tokens.noRole!)
        .expect(403);
      await http()
        [method](endpoint)
        .set('Authorization', tokens.seller!)
        .expect(method === 'get' ? 200 : 403);
    }
  });
  it('documents responses, permissions, filters and manual types in Swagger', async () => {
    const { body } = await http().get('/api/docs-json').expect(200);
    for (const [endpoint, method, success] of [
      ['/api/catalog/products/{id}/movements', 'post', '201'],
      [globalPath, 'get', '200'],
    ] as const) {
      const operation = body.paths[endpoint][method];
      expect(operation.security).toEqual([{ bearer: [] }]);
      for (const status of [success, '400', '401', '403', '404'])
        expect(operation.responses[status]).toBeDefined();
    }
    const schema = body.components.schemas.CreateInventoryMovementDto;
    expect(schema.required.sort()).toEqual(['quantity', 'type']);
    expect(schema.properties.type.enum).toEqual([
      'PURCHASE_IN',
      'RETURN_IN',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
    ]);
    expect(
      body.paths[globalPath].get.parameters
        .map((p: { name: string }) => p.name)
        .sort(),
    ).toEqual(['endDate', 'productId', 'startDate', 'type']);
    expect(
      body.components.schemas.InventoryMovementDto.properties.quantityChange
        .type,
    ).toBe('string');
  });
});
