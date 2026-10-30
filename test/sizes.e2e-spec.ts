import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { PRODUCT_IMAGES } from '../src/catalog/products/product-images.service.js';
import type { SizeDto } from '../src/catalog/sizes/dto/size.dto.js';
import type { ProductDto } from '../src/catalog/products/dto/product.dto.js';
import type { QuoteDto } from '../src/quotes/dto/quote.dto.js';

const base = '/api/catalog/sizes';

describe('Sizes HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  let categoryId: string;
  let customerId: string;
  const users: string[] = [];
  const sizes: string[] = [];
  const products: string[] = [];
  const tokens: Record<string, string> = {};
  const http = () => request(app!.getHttpServer());
  // Names are global; keep them unique per test run.
  const name = (label: string) =>
    `${label}-${randomUUID().slice(0, 6)}`.toUpperCase();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRODUCT_IMAGES)
      .useValue({ upload: vi.fn() })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const jwt = new JwtService();
    for (const [key, role] of [
      ['admin', 'ADMIN'],
      ['seller', 'VENDEDOR'],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          name: 'Sizes test',
          email: `${randomUUID()}@sizes.test`,
          passwordHash: 'unused-test-hash',
          roles: { create: { role: { connect: { name: role } } } },
        },
      });
      users.push(user.id);
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: [role] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
    categoryId = (
      await prisma.category.create({
        data: { name: 'Ropa', slug: `sizes-${randomUUID()}` },
      })
    ).id;
    customerId = (
      await prisma.customer.create({ data: { name: 'Cliente tallas' } })
    ).id;
  });

  afterEach(async () => {
    if (!prisma) return;
    const sales = await prisma.sale.findMany({
      where: { customerId },
      select: { id: true },
    });
    const saleIds = sales.map(({ id }) => id);
    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: products } },
    });
    await prisma.payment.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.quote.deleteMany({ where: { customerId } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.size.deleteMany({ where: { id: { in: sizes } } });
    products.length = sizes.length = 0;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function createSize(body: object): Promise<SizeDto> {
    const response = await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send(body)
      .expect(201);
    const size = response.body as SizeDto;
    sizes.push(size.id);
    return size;
  }

  async function createProduct(tallaIds: string[]): Promise<ProductDto> {
    const response = await http()
      .post('/api/catalog/products')
      .set('Authorization', tokens.admin!)
      .send({
        codigoBarras: `SKU-${randomUUID()}`,
        articulo: 'Playera',
        precioVenta: 100,
        categoryId,
        tallaIds,
      })
      .expect(201);
    const product = response.body as ProductDto;
    products.push(product.id);
    return product;
  }

  async function createQuote(
    items: object[],
    expected = 201,
  ): Promise<QuoteDto> {
    const response = await http()
      .post('/api/quotes')
      .set('Authorization', tokens.seller!)
      .send({ customerId, items })
      .expect(expected);
    return response.body as QuoteDto;
  }

  it('creates normalized sizes and rejects duplicates regardless of case', async () => {
    const raw = name('m');
    const size = await createSize({
      name: ` ${raw.toLowerCase()} `,
      sortOrder: 20,
    });
    expect(size).toEqual({
      id: expect.any(String),
      name: raw,
      sortOrder: 20,
      isActive: true,
    });
    await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send({ name: raw.toLowerCase() })
      .expect(409);
    expect((await createSize({ name: name('g') })).sortOrder).toBe(0);
  });

  it('rejects invalid bodies', async () => {
    for (const body of [
      {},
      { name: ' ' },
      { name: 'x'.repeat(21) },
      { name: 1 },
      { name: 'M', sortOrder: -1 },
      { name: 'M', sortOrder: 1.5 },
      { name: 'M', sortOrder: 10001 },
      { name: 'M', isActive: false },
      { name: 'M', extra: true },
    ]) {
      await http()
        .post(base)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(400);
    }
  });

  it('lists active sizes ordered by sortOrder, includes inactive on request and gets by id', async () => {
    const late = await createSize({ name: name('a'), sortOrder: 9001 });
    const early = await createSize({ name: name('z'), sortOrder: 9000 });
    const hidden = await createSize({ name: name('h'), sortOrder: 9002 });
    await http()
      .patch(`${base}/${hidden.id}`)
      .set('Authorization', tokens.admin!)
      .send({ isActive: false })
      .expect(200);

    const active = (
      await http().get(base).set('Authorization', tokens.seller!).expect(200)
    ).body as SizeDto[];
    const ids = active.map(({ id }) => id);
    expect(ids).not.toContain(hidden.id);
    expect(ids.indexOf(early.id)).toBeLessThan(ids.indexOf(late.id));

    const all = (
      await http()
        .get(`${base}?includeInactive=true`)
        .set('Authorization', tokens.seller!)
        .expect(200)
    ).body as SizeDto[];
    expect(all.map(({ id }) => id)).toContain(hidden.id);

    await http()
      .get(`${base}/${early.id}`)
      .set('Authorization', tokens.seller!)
      .expect(200, early);
    await http()
      .get(`${base}/${randomUUID()}`)
      .set('Authorization', tokens.seller!)
      .expect(404);
    await http()
      .get(`${base}/not-a-uuid`)
      .set('Authorization', tokens.seller!)
      .expect(400);
  });

  it('updates fields, rejects empty or duplicate updates and reports missing sizes', async () => {
    const size = await createSize({ name: name('s') });
    const other = await createSize({ name: name('o') });
    const renamed = name('r');
    await http()
      .patch(`${base}/${size.id}`)
      .set('Authorization', tokens.admin!)
      .send({ name: renamed.toLowerCase(), sortOrder: 5 })
      .expect(200, { ...size, name: renamed, sortOrder: 5 });
    await http()
      .patch(`${base}/${size.id}`)
      .set('Authorization', tokens.admin!)
      .send({})
      .expect(400);
    await http()
      .patch(`${base}/${size.id}`)
      .set('Authorization', tokens.admin!)
      .send({ name: other.name })
      .expect(409);
    await http()
      .patch(`${base}/${randomUUID()}`)
      .set('Authorization', tokens.admin!)
      .send({ sortOrder: 1 })
      .expect(404);
  });

  it('deletes unused sizes and returns 409 while a product uses one', async () => {
    const unused = await createSize({ name: name('u') });
    await http()
      .delete(`${base}/${unused.id}`)
      .set('Authorization', tokens.admin!)
      .expect(204);
    await http()
      .delete(`${base}/${unused.id}`)
      .set('Authorization', tokens.admin!)
      .expect(404);

    const used = await createSize({ name: name('x') });
    await createProduct([used.id]);
    await http()
      .delete(`${base}/${used.id}`)
      .set('Authorization', tokens.admin!)
      .expect(409);
    expect(await prisma.size.count({ where: { id: used.id } })).toBe(1);
  });

  it('enforces permissions', async () => {
    await http().get(base).expect(401);
    const size = await createSize({ name: name('p') });
    await http()
      .post(base)
      .set('Authorization', tokens.seller!)
      .send({ name: name('q') })
      .expect(403);
    await http()
      .patch(`${base}/${size.id}`)
      .set('Authorization', tokens.seller!)
      .send({ sortOrder: 1 })
      .expect(403);
    await http()
      .delete(`${base}/${size.id}`)
      .set('Authorization', tokens.seller!)
      .expect(403);
  });

  it('replaces the product size list on update', async () => {
    const m = await createSize({ name: name('m'), sortOrder: 2 });
    const g = await createSize({ name: name('g'), sortOrder: 1 });
    const product = await createProduct([m.id]);
    expect(product.tallas).toEqual([{ id: m.id, name: m.name }]);
    const response = await http()
      .patch(`/api/catalog/products/${product.id}`)
      .set('Authorization', tokens.admin!)
      .send({ tallaIds: [m.id, g.id] })
      .expect(200);
    expect((response.body as ProductDto).tallas).toEqual([
      { id: g.id, name: g.name },
      { id: m.id, name: m.name },
    ]);
    await http()
      .patch(`/api/catalog/products/${product.id}`)
      .set('Authorization', tokens.admin!)
      .send({ marca: 'Otra' })
      .expect(200)
      .expect(({ body }) =>
        expect((body as ProductDto).tallas).toHaveLength(2),
      );
  });

  it('validates quote line sizes against the product and carries the size into the sale', async () => {
    const m = await createSize({ name: name('m') });
    const g = await createSize({ name: name('g') });
    const foreign = await createSize({ name: name('f') });
    const sized = await createProduct([m.id, g.id]);
    const plain = await createProduct([]);

    await createQuote([{ productId: sized.id, quantity: 1 }], 400);
    await createQuote(
      [{ productId: sized.id, sizeId: foreign.id, quantity: 1 }],
      400,
    );
    await createQuote(
      [{ productId: plain.id, sizeId: m.id, quantity: 1 }],
      400,
    );
    await http()
      .patch(`${base}/${g.id}`)
      .set('Authorization', tokens.admin!)
      .send({ isActive: false })
      .expect(200);
    await createQuote(
      [{ productId: sized.id, sizeId: g.id, quantity: 1 }],
      400,
    );
    expect(await prisma.quote.count({ where: { customerId } })).toBe(0);

    const quote = await createQuote([
      { productId: sized.id, sizeId: m.id, quantity: 1 },
      { productId: plain.id, quantity: 1 },
    ]);
    // Line order is not part of the contract; match lines by product.
    expect(
      Object.fromEntries(
        quote.items.map(({ product, size }) => [product.id, size]),
      ),
    ).toEqual({ [sized.id]: { id: m.id, name: m.name }, [plain.id]: null });

    await http()
      .delete(`${base}/${m.id}`)
      .set('Authorization', tokens.admin!)
      .expect(409);

    for (const product of [sized, plain]) {
      await prisma.inventoryMovement.create({
        data: { productId: product.id, type: 'PURCHASE_IN', quantityChange: 5 },
      });
    }
    await http()
      .post(`/api/quotes/${quote.id}/pay`)
      .set('Authorization', tokens.seller!)
      .send({ method: 'CASH', amount: Number(quote.total) })
      .expect(200);
    const saleItems = await prisma.saleItem.findMany({
      where: { sale: { quoteId: quote.id } },
      select: { productId: true, sizeId: true },
    });
    expect(saleItems).toEqual(
      expect.arrayContaining([
        { productId: sized.id, sizeId: m.id },
        { productId: plain.id, sizeId: null },
      ]),
    );
  });
});
