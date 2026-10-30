import { Test } from '@nestjs/testing';
import { BadGatewayException, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { PRODUCT_IMAGES } from '../src/catalog/products/product-images.service.js';
import type { ProductDto } from '../src/catalog/products/dto/product.dto.js';
import type { InventoryMovementDto } from '../src/catalog/products/dto/inventory-movement.dto.js';

const base = '/api/catalog/products';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
const imageLimit = 5 * 1024 * 1024;

describe('Products HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const users: string[] = [];
  const categories: string[] = [];
  const products: string[] = [];
  const quotes: string[] = [];
  const sales: string[] = [];
  const customers: string[] = [];
  const sizes: Record<
    's5' | 's6' | 's7' | 'inactive',
    { id: string; name: string }
  > = {} as never;
  const tokens: Record<string, string> = {};
  const uploader = { upload: vi.fn() };
  const http = () => request(app!.getHttpServer());
  const defaults = () => ({
    codigoBarras: `CB-${randomUUID()}`,
    articulo: 'Anillo',
    precioVenta: 1250.5,
    categoryId: categories[0],
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRODUCT_IMAGES)
      .useValue(uploader)
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    // Keep one listener for the suite instead of reopening a port per request.
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
          name: 'Products test',
          email: `${randomUUID()}@products.test`,
          passwordHash: 'unused-test-hash',
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
    for (const name of ['Anillos', 'Collares']) {
      const category = await prisma.category.create({
        data: { name, slug: `products-${randomUUID()}` },
      });
      categories.push(category.id);
    }
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    // sortOrder deliberately differs from name order.
    for (const [key, sortOrder, isActive] of [
      ['s7', 1, true],
      ['s5', 2, true],
      ['s6', 3, true],
      ['inactive', 4, false],
    ] as const) {
      sizes[key] = await prisma.size.create({
        data: { name: `${key}-${suffix}`.toUpperCase(), sortOrder, isActive },
        select: { id: true, name: true },
      });
    }
  });

  beforeEach(() => {
    uploader.upload.mockReset();
    uploader.upload.mockResolvedValue(
      'https://res.cloudinary.com/test/image/upload/v1/product.png',
    );
  });
  afterEach(async () => {
    if (!prisma) return;
    await prisma.quoteItem.deleteMany({
      where: { productId: { in: products } },
    });
    await prisma.saleItem.deleteMany({
      where: { productId: { in: products } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: products } },
    });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.quote.deleteMany({ where: { id: { in: quotes } } });
    await prisma.sale.deleteMany({ where: { id: { in: sales } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers } } });
    products.length = quotes.length = sales.length = customers.length = 0;
  });
  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.category.deleteMany({ where: { id: { in: categories } } });
        await prisma.size.deleteMany({
          where: { id: { in: Object.values(sizes).map(({ id }) => id) } },
        });
        await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function create(overrides: object = {}): Promise<ProductDto> {
    const response = await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send({ ...defaults(), ...overrides })
      .expect(201);
    const product = response.body as ProductDto;
    products.push(product.id);
    return product;
  }

  it('creates all public fields with normalized input, exact money and nested category', async () => {
    const product = await create({
      articulo: ' Anillo de plata ',
      descripcion: ' Talla 8 ',
      codigoBarras: ' an-r-001 ',
      marca: ' Kamadeva ',
      tallaIds: [sizes.s5.id, sizes.s6.id, sizes.s7.id],
      precioCompra: 780.25,
    });
    const category = await prisma.category.findUniqueOrThrow({
      where: { id: categories[0] },
    });
    expect(product).toEqual({
      id: expect.any(String),
      articulo: 'Anillo de plata',
      descripcion: 'Talla 8',
      codigoBarras: 'AN-R-001',
      marca: 'Kamadeva',
      tallas: [sizes.s7, sizes.s5, sizes.s6],
      precioCompra: '780.25',
      precioVenta: '1250.50',
      stock: '0.000',
      stockMinimo: null,
      imageUrl: null,
      isActive: true,
      categoria: { id: category.id, name: category.name, slug: category.slug },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const stored = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(stored).toMatchObject({
      name: product.articulo,
      barcode: product.codigoBarras,
      brand: product.marca,
    });
    expect(stored).not.toHaveProperty('stock');
    expect(stored).not.toHaveProperty('tallas');
    expect(
      await prisma.productSize.count({ where: { productId: product.id } }),
    ).toBe(3);
  });

  it('lets only ADMIN set stock through product registration and records every change', async () => {
    const response = await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send({ ...defaults(), precioCompra: 10, stock: 4.25 })
      .expect(201);
    const product = response.body as ProductDto;
    products.push(product.id);
    expect(product.stock).toBe('4.250');
    const initial = await prisma.inventoryMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(initial).toHaveLength(1);
    expect({
      type: initial[0]!.type,
      quantityChange: initial[0]!.quantityChange.toFixed(3),
      unitCost: initial[0]!.unitCost?.toFixed(2),
      referenceType: initial[0]!.referenceType,
      createdById: initial[0]!.createdById,
    }).toEqual({
      type: 'ADJUSTMENT_IN',
      quantityChange: '4.250',
      unitCost: '10.00',
      referenceType: 'PRODUCT_INITIAL_STOCK',
      createdById: users[0],
    });

    const changed = await http()
      .patch(`${base}/${product.id}`)
      .set('Authorization', tokens.admin!)
      .send({ stock: 2 })
      .expect(200);
    expect(changed.body.stock).toBe('2.000');
    await http()
      .patch(`${base}/${product.id}`)
      .set('Authorization', tokens.seller!)
      .send({ stock: 8 })
      .expect(403);
    const movements = await prisma.inventoryMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(2);
    expect({
      type: movements[1]!.type,
      quantityChange: movements[1]!.quantityChange.toFixed(3),
      referenceType: movements[1]!.referenceType,
    }).toEqual({
      type: 'ADJUSTMENT_OUT',
      quantityChange: '-2.250',
      referenceType: 'PRODUCT_STOCK_EDIT',
    });
  });

  it('normalizes blank optional fields to public nulls and an empty size list to []', async () => {
    const product = await create({
      descripcion: ' ',
      marca: ' ',
      tallaIds: [],
      precioCompra: 0,
      precioVenta: 0.01,
    });
    expect(product).toMatchObject({
      descripcion: null,
      marca: null,
      tallas: [],
      precioCompra: '0.00',
      precioVenta: '0.01',
    });
    expect(
      await prisma.productSize.count({ where: { productId: product.id } }),
    ).toBe(0);
    expect((await create()).tallas).toEqual([]);
  });

  it('creates products without a category and filters them', async () => {
    // undefined is dropped from the JSON body, so no categoryId is sent.
    const product = await create({ categoryId: undefined });
    expect(product.categoria).toBeNull();
    const listed = (
      await http()
        .get(`${base}?sinCategoria=true`)
        .set('Authorization', tokens.admin!)
        .expect(200)
    ).body as ProductDto[];
    expect(listed.map(({ id }) => id)).toContain(product.id);
    expect(listed.every(({ categoria }) => categoria === null)).toBe(true);
    const categorized = await create();
    await http()
      .patch(`${base}/${categorized.id}`)
      .set('Authorization', tokens.admin!)
      .send({ categoryId: null })
      .expect(200)
      .expect(({ body }) => expect(body.categoria).toBeNull());
  });

  it('returns 409 for a duplicate barcode regardless of case, including concurrent creation', async () => {
    await create({ codigoBarras: 'SAME-CODE' });
    await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send({ ...defaults(), codigoBarras: ' same-code ' })
      .expect(409);
    const racingValue = randomUUID();
    const responses = await Promise.all(
      [1, 2].map(() =>
        http()
          .post(base)
          .set('Authorization', tokens.admin!)
          .send({ ...defaults(), codigoBarras: racingValue }),
      ),
    );
    for (const response of responses)
      if (response.status === 201)
        products.push((response.body as ProductDto).id);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
  });

  it('rejects missing categories for create and update, and missing products', async () => {
    await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send({ ...defaults(), categoryId: randomUUID() })
      .expect(404);
    const product = await create();
    await http()
      .patch(`${base}/${product.id}`)
      .set('Authorization', tokens.admin!)
      .send({ categoryId: randomUUID() })
      .expect(404);
    for (const method of ['get', 'patch', 'delete'] as const) {
      const operation = http()
        [method](`${base}/${randomUUID()}`)
        .set('Authorization', tokens.admin!);
      if (method === 'patch') operation.send({ articulo: 'Missing' });
      await operation.expect(404);
    }
    await http()
      .get(`${base}/${randomUUID()}/movements`)
      .set('Authorization', tokens.admin!)
      .expect(404);
    await http()
      .post(`${base}/${randomUUID()}/image`)
      .set('Authorization', tokens.admin!)
      .attach('file', png, 'image.png')
      .expect(404);
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it('rejects invalid input, duplicate trimmed sizes, precision overflow and internal fields', async () => {
    for (const body of [
      { codigoBarras: '' },
      { codigoBarras: ' ' },
      { codigoBarras: null },
      { sku: 'OLD-FIELD' },
      { articulo: ' ' },
      { articulo: 'x'.repeat(201) },
      { descripcion: 1 },
      { descripcion: 'x'.repeat(501) },
      { codigoBarras: 'x'.repeat(65) },
      { marca: 'x'.repeat(101) },
      { tallas: ['8'] },
      { tallaIds: [sizes.s5.id, sizes.s5.id] },
      { tallaIds: ['8'] },
      { tallaIds: sizes.s5.id },
      { tallaIds: null },
      { tallaIds: [sizes.inactive.id] },
      { tallaIds: [randomUUID()] },
      { precioVenta: 0 },
      { precioVenta: -1 },
      { precioVenta: 1.001 },
      { precioVenta: 10000000000 },
      { precioVenta: '1250.50' },
      { precioVenta: null },
      { stockMinimo: -1 },
      { stockMinimo: 1.0001 },
      { stockMinimo: '1' },
      { precioCompra: -1 },
      { precioCompra: 1.001 },
      { precioCompra: 10000000000 },
      { categoryId: 'bad' },
      { stock: -1 },
      { stock: 1.0001 },
      { stock: '10' },
      { imageUrl: 'https://image.test' },
      { name: 'Internal' },
      { isActive: false },
    ])
      await http()
        .post(base)
        .set('Authorization', tokens.admin!)
        .send({ ...defaults(), ...body })
        .expect(400);
    for (const field of ['codigoBarras', 'articulo', 'precioVenta']) {
      const body: Record<string, unknown> = defaults();
      delete body[field];
      await http()
        .post(base)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(400);
    }
  });

  it('filters by category, active status, article and barcode in name order', async () => {
    const z = await create({
      articulo: 'Zafiro',
      codigoBarras: 'MixedCode123',
    });
    const a = await create({ articulo: 'Anillo ORO' });
    const other = await create({
      articulo: 'Collar',
      categoryId: categories[1],
    });
    await http()
      .patch(`${base}/${z.id}`)
      .set('Authorization', tokens.admin!)
      .send({ isActive: false })
      .expect(200);
    for (const [query, expected] of [
      ['', [a.id, other.id]],
      ['?includeInactive=false', [a.id, other.id]],
      ['?includeInactive=true', [a.id, other.id, z.id]],
      [`?categoryId=${categories[0]}&includeInactive=true`, [a.id, z.id]],
      ['?search=oro', [a.id]],
      ['?search=mixedcode&includeInactive=true', [z.id]],
      ['?search=missing', []],
    ] as const) {
      const response = await http()
        .get(base + query)
        .set('Authorization', tokens.seller!)
        .expect(200);
      const results = (response.body as ProductDto[]).filter(({ id }) =>
        products.includes(id),
      );
      expect(results.map(({ id }) => id)).toEqual(expected);
    }
  });

  it('derives fractional positive and negative stock and rejects client-supplied quantityChange', async () => {
    const product = await create();
    const other = await create({ articulo: 'Sin movimientos' });
    const newest = new Date('2026-09-13T12:00:00Z');
    const incoming = await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        type: 'PURCHASE_IN',
        quantityChange: '2.125',
        unitCost: '780.25',
        referenceType: 'test',
        referenceId: 'purchase',
        notes: 'Entrada',
        createdAt: new Date('2026-09-12T12:00:00Z'),
      },
    });
    const outgoing = await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        type: 'SALE_OUT',
        quantityChange: '-5.250',
        createdAt: newest,
      },
    });
    await http()
      .patch(`${base}/${product.id}`)
      .set('Authorization', tokens.admin!)
      .send({ isActive: false })
      .expect(200);
    const detail = await http()
      .get(`${base}/${product.id}`)
      .set('Authorization', tokens.seller!)
      .expect(200);
    expect(detail.body.stock).toBe('-3.125');
    const list = await http()
      .get(`${base}?includeInactive=true`)
      .set('Authorization', tokens.seller!)
      .expect(200);
    expect(
      (list.body as ProductDto[]).find(({ id }) => id === product.id)?.stock,
    ).toBe('-3.125');
    expect(
      (list.body as ProductDto[]).find(({ id }) => id === other.id)?.stock,
    ).toBe('0.000');
    const response = await http()
      .get(`${base}/${product.id}/movements`)
      .set('Authorization', tokens.seller!)
      .expect(200);
    const movements = response.body as InventoryMovementDto[];
    expect(movements).toEqual([
      {
        id: outgoing.id,
        type: 'SALE_OUT',
        quantityChange: '-5.250',
        unitCost: null,
        referenceType: null,
        referenceId: null,
        notes: null,
        createdAt: newest.toISOString(),
      },
      {
        id: incoming.id,
        type: 'PURCHASE_IN',
        quantityChange: '2.125',
        unitCost: '780.25',
        referenceType: 'test',
        referenceId: 'purchase',
        notes: 'Entrada',
        createdAt: '2026-09-12T12:00:00.000Z',
      },
    ]);
    await http()
      .post(`${base}/${product.id}/movements`)
      .set('Authorization', tokens.admin!)
      .send({ quantityChange: 10 })
      .expect(400);
  });

  it('updates public fields and category, preserves stock and rejects invalid patches', async () => {
    const product = await create({
      codigoBarras: '111',
      marca: 'Original',
      tallaIds: [sizes.s7.id],
      precioCompra: 10,
    });
    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        type: 'RETURN_IN',
        quantityChange: '1.001',
      },
    });
    const target = `${base}/${product.id}`;
    const response = await http()
      .patch(target)
      .set('Authorization', tokens.admin!)
      .send({
        articulo: ' Artículo nuevo ',
        descripcion: ' ',
        codigoBarras: ' new-code ',
        marca: '',
        tallaIds: [],
        precioCompra: null,
        precioVenta: 9999999999.99,
        categoryId: categories[1],
        isActive: false,
      })
      .expect(200);
    expect(response.body).toMatchObject({
      articulo: 'Artículo nuevo',
      descripcion: null,
      codigoBarras: 'NEW-CODE',
      marca: null,
      tallas: [],
      precioCompra: null,
      precioVenta: '9999999999.99',
      categoria: { id: categories[1] },
      isActive: false,
      stock: '1.001',
    });
    for (const body of [
      {},
      { codigoBarras: null },
      { codigoBarras: ' ' },
      { articulo: null },
      { precioVenta: null },
      { isActive: null },
      { isActive: 'false' },
      { tallas: ['8'] },
      { tallaIds: [sizes.s5.id, sizes.s5.id] },
      { tallaIds: [sizes.inactive.id] },
      { stock: -1 },
      { stock: 1.0001 },
      { stock: '99' },
      { imageUrl: 'https://image.test' },
    ]) {
      await http()
        .patch(target)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(400);
    }
    expect(
      (await http().get(target).set('Authorization', tokens.admin!).expect(200))
        .body,
    ).toEqual(response.body);
  });

  it('rejects duplicate barcode updates without changing the product', async () => {
    await create({ codigoBarras: 'TAKEN-777' });
    const product = await create();
    for (const body of [
      { codigoBarras: ' taken-777 ' },
      { codigoBarras: 'TAKEN-777' },
    ])
      await http()
        .patch(`${base}/${product.id}`)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(409);
    expect(
      (
        await http()
          .get(`${base}/${product.id}`)
          .set('Authorization', tokens.admin!)
          .expect(200)
      ).body,
    ).toEqual(product);
  });

  it.each(['quote', 'sale', 'movement'] as const)(
    'blocks deletion with %s references',
    async (reference) => {
      const product = await create();
      if (reference === 'movement') {
        await prisma.inventoryMovement.create({
          data: {
            productId: product.id,
            type: 'ADJUSTMENT_IN',
            quantityChange: '1',
          },
        });
      } else if (reference === 'quote') {
        const customer = await prisma.customer.create({
          data: { name: 'Test customer' },
        });
        customers.push(customer.id);
        const quote = await prisma.quote.create({
          data: {
            folio: randomUUID(),
            customerId: customer.id,
            subtotal: 1,
            tax: 0,
            total: 1,
            items: {
              create: {
                productId: product.id,
                quantity: 1,
                unitPrice: 1,
                total: 1,
              },
            },
          },
        });
        quotes.push(quote.id);
      } else {
        const sale = await prisma.sale.create({
          data: {
            folio: randomUUID(),
            subtotal: 1,
            tax: 0,
            total: 1,
            items: {
              create: {
                productId: product.id,
                quantity: 1,
                unitPrice: 1,
                total: 1,
              },
            },
          },
        });
        sales.push(sale.id);
      }
      await http()
        .delete(`${base}/${product.id}`)
        .set('Authorization', tokens.admin!)
        .expect(409);
      expect(
        await prisma.product.findUnique({ where: { id: product.id } }),
      ).not.toBeNull();
    },
  );

  it('deletes an unreferenced product with no body and returns 404 on repetition', async () => {
    const product = await create();
    await http()
      .delete(`${base}/${product.id}`)
      .set('Authorization', tokens.admin!)
      .expect(204)
      .expect('');
    await http()
      .delete(`${base}/${product.id}`)
      .set('Authorization', tokens.admin!)
      .expect(404);
  });

  it('uploads and replaces an image through the provider, persists the URL and keeps old URL on failure', async () => {
    const product = await create();
    const target = `${base}/${product.id}/image`;
    for (const version of [1, 2]) {
      const url = `https://res.cloudinary.com/test/image/upload/v${version}/product.png`;
      uploader.upload.mockResolvedValue(url);
      const response = await http()
        .post(target)
        .set('Authorization', tokens.admin!)
        .attach('file', png, 'image.png')
        .expect(200);
      expect(response.body).toMatchObject({
        id: product.id,
        imageUrl: url,
        stock: '0.000',
      });
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
          .imageUrl,
      ).toBe(url);
    }
    expect(uploader.upload).toHaveBeenLastCalledWith(
      product.id,
      png,
      'image/png',
    );
    uploader.upload.mockRejectedValue(
      new BadGatewayException('No se pudo subir la imagen'),
    );
    await http()
      .post(target)
      .set('Authorization', tokens.admin!)
      .attach('file', png, 'image.png')
      .expect(502);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))
        .imageUrl,
    ).toContain('/v2/');
  });

  it('validates file presence, signature, MIME, count and size before calling the provider', async () => {
    const product = await create();
    const target = `${base}/${product.id}/image`;
    const post = () => http().post(target).set('Authorization', tokens.admin!);
    await post().expect(400);
    await post().attach('other', png, 'image.png').expect(400);
    await post()
      .attach('file', Buffer.from('not an image'), 'image.png')
      .expect(400);
    await post()
      .attach('file', png, {
        filename: 'image.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
    await post()
      .attach('file', png, 'one.png')
      .attach('file', png, 'two.png')
      .expect(400);
    await post()
      .attach(
        'file',
        Buffer.concat([png, Buffer.alloc(imageLimit + 1 - png.length)]),
        'large.png',
      )
      .expect(400);
    await post()
      .attach(
        'file',
        Buffer.concat([png, Buffer.alloc(imageLimit * 2 - png.length)]),
        'larger.png',
      )
      .expect(400);
    await post()
      .field('extra', 'value')
      .attach('file', png, 'image.png')
      .expect(400);
    expect(uploader.upload).not.toHaveBeenCalled();
    await post()
      .attach(
        'file',
        Buffer.concat([png, Buffer.alloc(imageLimit - png.length)]),
        'exact-limit.png',
      )
      .expect(200);
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it('validates UUIDs and filters', async () => {
    for (const query of [
      'categoryId=bad',
      'includeInactive=1',
      'includeInactive=true&includeInactive=false',
      'search=a&search=b',
      'unknown=1',
    ])
      await http()
        .get(`${base}?${query}`)
        .set('Authorization', tokens.admin!)
        .expect(400);
    for (const method of ['get', 'patch', 'delete'] as const) {
      const operation = http()
        [method](`${base}/bad`)
        .set('Authorization', tokens.admin!);
      if (method === 'patch') operation.send({ articulo: 'X' });
      await operation.expect(400);
    }
    await http()
      .get(`${base}/bad/movements`)
      .set('Authorization', tokens.admin!)
      .expect(400);
    await http()
      .post(`${base}/bad/image`)
      .set('Authorization', tokens.admin!)
      .attach('file', png, 'image.png')
      .expect(400);
  });

  it('enforces authentication, active users and roles on all seven routes', async () => {
    const product = await create();
    for (const [method, path] of [
      ['post', base],
      ['get', base],
      ['get', `${base}/${product.id}`],
      ['get', `${base}/${product.id}/movements`],
      ['patch', `${base}/${product.id}`],
      ['delete', `${base}/${product.id}`],
      ['post', `${base}/${product.id}/image`],
    ] as const) {
      for (const token of [undefined, 'Bearer invalid', tokens.inactive]) {
        const operation = http()[method](path);
        if (token) operation.set('Authorization', token);
        await operation.expect(401);
      }
      await http()
        [method](path)
        .set('Authorization', tokens.noRole!)
        .expect(403);
      await http()
        [method](path)
        .set('Authorization', tokens.seller!)
        .expect(method === 'get' ? 200 : 403);
    }
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it('documents public schemas, money strings, filters, permissions and multipart in Swagger', async () => {
    const response = await http().get('/api/docs-json').expect(200);
    for (const [path, method, statuses] of [
      [base, 'post', ['201', '400', '401', '403', '404', '409']],
      [base, 'get', ['200', '400', '401', '403']],
      [`${base}/{id}`, 'get', ['200', '400', '401', '403', '404']],
      [`${base}/{id}/movements`, 'get', ['200', '400', '401', '403', '404']],
      [`${base}/{id}`, 'patch', ['200', '400', '401', '403', '404', '409']],
      [`${base}/{id}`, 'delete', ['204', '400', '401', '403', '404', '409']],
      [
        `${base}/{id}/image`,
        'post',
        ['200', '400', '401', '403', '404', '502'],
      ],
    ] as const) {
      const operation = response.body.paths[path][method];
      expect(operation.security).toEqual([{ bearer: [] }]);
      for (const status of statuses)
        expect(operation.responses[status]).toBeDefined();
    }
    const schemas = response.body.components.schemas;
    for (const field of ['precioCompra', 'precioVenta', 'stock'])
      expect(schemas.ProductDto.properties[field].type).toBe('string');
    expect(schemas.CreateProductDto.required.sort()).toEqual([
      'articulo',
      'codigoBarras',
      'precioVenta',
    ]);
    expect(schemas.UpdateProductDto.required ?? []).toEqual([]);
    expect(
      response.body.paths[`${base}/{id}/image`].post.requestBody.content[
        'multipart/form-data'
      ].schema.properties.file.format,
    ).toBe('binary');
    expect(
      response.body.paths[base].get.parameters
        .map((parameter: { name: string }) => parameter.name)
        .sort(),
    ).toEqual(['categoryId', 'includeInactive', 'search', 'sinCategoria']);
  });
});
