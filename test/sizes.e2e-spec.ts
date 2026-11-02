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

interface SizeResponse {
  id: string;
  nombre: string;
  activo: boolean;
}

interface QuoteResponse {
  id: string;
  folio: number;
  total: string;
  subtotal: string;
  estado: string;
  productos: Array<{
    producto: { id: string };
    talla: { id: string; nombre: string } | null;
  }>;
}

const base = '/api/catalogo/tallas';

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
          nombre: `Sizes test ${key}`,
          email: `${randomUUID()}@sizes.test`,
          passwordHash: 'unused-test-hash',
          rol: { connect: { nombre: role } },
        },
      });
      users.push(user.id);
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: [role] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
    categoryId = (
      await prisma.category.create({
        data: { descripcion: `Ropa-${randomUUID().slice(0, 8)}` },
      })
    ).id;
    customerId = (
      await prisma.customer.create({ data: { nombre: 'Cliente tallas' } })
    ).id;
  });

  afterEach(async () => {
    if (!prisma) return;
    const sales = await prisma.sale.findMany({
      where: { clienteId: customerId },
      select: { id: true },
    });
    const saleIds = sales.map(({ id }) => id);
    await prisma.inventoryMovement.deleteMany({
      where: { productoId: { in: products } },
    });
    await prisma.saleItem.deleteMany({ where: { ventaId: { in: saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.quoteItem.deleteMany({ where: { cotizacion: { clienteId: customerId } } });
    await prisma.quote.deleteMany({ where: { clienteId: customerId } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.size.deleteMany({ where: { id: { in: sizes } } });
    products.length = sizes.length = 0;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function createSize(body: object): Promise<SizeResponse> {
    const response = await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send(body)
      .expect(201);
    const size = response.body as SizeResponse;
    sizes.push(size.id);
    return size;
  }

  async function createProduct(): Promise<{ id: string; nombre: string }> {
    const response = await http()
      .post('/api/productos')
      .set('Authorization', tokens.admin!)
      .send({
        codigoBarras: `SKU-${randomUUID().slice(0, 10)}`,
        nombre: 'Playera',
        precioVenta: 100,
        categoriaId: categoryId,
      })
      .expect(201);
    const product = response.body as { id: string; nombre: string };
    products.push(product.id);
    return product;
  }

  async function createQuote(
    items: object[],
    expected = 201,
  ): Promise<QuoteResponse> {
    const response = await http()
      .post('/api/cotizaciones')
      .set('Authorization', tokens.seller!)
      .send({ customerId, items })
      .expect(expected);
    return response.body as QuoteResponse;
  }

  it('creates normalized sizes and rejects duplicates regardless of case', async () => {
    const raw = name('m');
    const size = await createSize({
      name: ` ${raw.toLowerCase()} `,
    });
    expect(size).toEqual({
      id: expect.any(String),
      nombre: raw,
      activo: true,
    });
    await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send({ name: raw.toLowerCase() })
      .expect(409);
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
      { name: 'M', extra: true },
    ]) {
      await http()
        .post(base)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(400);
    }
  });

  it('lists active sizes ordered by nombre, includes inactive on request and gets by id', async () => {
    const s1 = await createSize({ name: name('b') });
    const s2 = await createSize({ name: name('c') });
    const hidden = await createSize({ name: name('a') });
    await http()
      .patch(`${base}/${hidden.id}`)
      .set('Authorization', tokens.admin!)
      .send({ activo: false })
      .expect(200);

    const active = (
      await http().get(base).set('Authorization', tokens.seller!).expect(200)
    ).body as SizeDto[];
    const ids = active.map(({ id }) => id);
    expect(ids).not.toContain(hidden.id);
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);

    const all = (
      await http()
        .get(`${base}?includeInactive=true`)
        .set('Authorization', tokens.seller!)
        .expect(200)
    ).body as SizeDto[];
    expect(all.map(({ id }) => id)).toContain(hidden.id);

    const getRes = await http()
      .get(`${base}/${s1.id}`)
      .set('Authorization', tokens.seller!)
      .expect(200);
    expect(getRes.body).toMatchObject({ id: s1.id, nombre: s1.nombre });
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
    const patchRes = await http()
      .patch(`${base}/${size.id}`)
      .set('Authorization', tokens.admin!)
      .send({ name: renamed.toLowerCase() })
      .expect(200);
    expect(patchRes.body).toMatchObject({ id: size.id, nombre: renamed });
    await http()
      .patch(`${base}/${size.id}`)
      .set('Authorization', tokens.admin!)
      .send({})
      .expect(400);
    await http()
      .patch(`${base}/${size.id}`)
      .set('Authorization', tokens.admin!)
      .send({ name: other.nombre })
      .expect(409);
    await http()
      .patch(`${base}/${randomUUID()}`)
      .set('Authorization', tokens.admin!)
      .send({ nombre: 'X' })
      .expect(404);
  });

  it('deletes unused sizes and returns 409 while a quote line uses one', async () => {
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
    const product = await createProduct();
    await createQuote([{ productId: product.id, sizeId: used.id, quantity: 1 }]);
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
      .send({ nombre: 'NEW' })
      .expect(403);
    await http()
      .delete(`${base}/${size.id}`)
      .set('Authorization', tokens.seller!)
      .expect(403);
  });

  it('carries the size into the sale when paying a quote', async () => {
    const m = await createSize({ name: name('m') });
    const plainProduct = await createProduct();
    const sizedProduct = await createProduct();

    const quote = await createQuote([
      { productId: sizedProduct.id, sizeId: m.id, quantity: 1 },
      { productId: plainProduct.id, quantity: 1 },
    ]);

    expect(
      Object.fromEntries(
        quote.productos.map(({ producto, talla }) => [producto.id, talla]),
      ),
    ).toEqual({ [sizedProduct.id]: { id: m.id, nombre: m.nombre }, [plainProduct.id]: null });

    for (const product of [sizedProduct, plainProduct]) {
      await prisma.inventoryMovement.create({
        data: { productoId: product.id, tipo: 'PURCHASE_IN', cambioExistencias: 5 },
      });
    }

    await http()
      .post(`/api/cotizaciones/${quote.id}/pagar`)
      .set('Authorization', tokens.seller!)
      .send({ method: 'CASH', amount: Number(quote.total) })
      .expect(200);

    const saleItems = await prisma.saleItem.findMany({
      where: { venta: { cotizacionId: quote.id } },
      select: { productoId: true, tallaId: true },
    });
    expect(saleItems).toEqual(
      expect.arrayContaining([
        { productoId: sizedProduct.id, tallaId: m.id },
        { productoId: plainProduct.id, tallaId: null },
      ]),
    );
  });
});
