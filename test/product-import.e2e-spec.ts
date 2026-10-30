import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { PRODUCT_IMAGES } from '../src/catalog/products/product-images.service.js';
import type { ImportReportDto } from '../src/catalog/products/import/import-products.dto.js';

const base = '/api/catalog/products/import';
const HEADERS = [
  'articulo*',
  'Descripción',
  'Código de barras*',
  'Stock*',
  'Categoría*',
  'Marca',
  'Precio Compra',
  'Precio Venta*',
];

async function workbook(rows: unknown[][], headers = HEADERS): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Hoja 1');
  sheet.addRow(headers);
  for (const values of rows) sheet.addRow(values);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('Product import HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  // Unique per test: barcodes and category names are global.
  let tag: string;
  const users: Record<'admin' | 'seller', string> = {} as never;
  const tokens: Record<'admin' | 'seller', string> = {} as never;
  const http = () => request(app!.getHttpServer());

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
          name: `Import ${key}`,
          email: `${randomUUID()}@import.test`,
          passwordHash: 'unused-test-hash',
          roles: { create: { role: { connect: { name: role } } } },
        },
      });
      users[key] = user.id;
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: [role] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
  });

  beforeEach(() => {
    tag = randomUUID().slice(0, 8).toUpperCase();
  });

  afterEach(async () => {
    if (!prisma) return;
    const products = await prisma.product.findMany({
      where: { barcode: { startsWith: `T${tag}` } },
      select: { id: true },
    });
    const ids = products.map(({ id }) => id);
    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: ids } },
    });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-${tag.toLowerCase()}` } },
    });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const ids = Object.values(users);
        await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    } finally {
      await app?.close();
    }
  });

  const code = (suffix: string) => `T${tag}${suffix}`;
  const category = (name: string) => `Cat ${tag} ${name}`;

  const upload = (
    file: Buffer,
    fields: Record<string, string> = {},
    token: string = tokens.admin,
    filename = 'inventario.xlsx',
  ) => {
    const req = http()
      .post(base)
      .set('Authorization', token)
      .attach('file', file, filename);
    for (const [key, value] of Object.entries(fields)) req.field(key, value);
    return req;
  };

  it('previews with dryRun, imports, normalizes data and is idempotent on re-import', async () => {
    const file = await workbook([
      [
        '  Anillo   de plata ',
        'Fino',
        ` ´${code('-1')} `,
        2,
        category('lencería'),
        'Marca',
        null,
        99.9,
      ],
      ['Collar', null, code('-2'), 0, category('LENCERIA'), null, 30, 150],
      ['collar', null, code('-2'), 5, category('Lenceria'), null, 30, 150],
      ['Disfraz A', null, code('-J'), 1, category('Disfraz'), null, null, 290],
      ['Disfraz B', null, code('-j'), 0, category('Disfraz'), null, null, 290],
      [
        'Sin precio',
        null,
        code('-3'),
        1,
        category('Disfraz'),
        null,
        null,
        null,
      ],
    ]);

    const preview = (await upload(file, { dryRun: 'true' }).expect(200))
      .body as ImportReportDto;
    expect(preview).toMatchObject({
      dryRun: true,
      totalRows: 6,
      created: 2,
      withoutCategory: 0,
    });
    expect(preview.categoriesCreated).toEqual([
      category('lencería').toUpperCase(),
    ]);
    expect(preview.skipped.map(({ row }) => row)).toEqual([4]);
    expect(preview.errors.map(({ row, message }) => [row, message])).toEqual([
      [5, 'Código compartido por productos distintos (renglones 5, 6)'],
      [6, 'Código compartido por productos distintos (renglones 5, 6)'],
      [7, 'Falta el precio de venta'],
    ]);
    expect(
      await prisma.product.count({
        where: { barcode: { startsWith: `T${tag}` } },
      }),
    ).toBe(0);

    const report = (await upload(file).expect(200)).body as ImportReportDto;
    expect(report).toEqual({ ...preview, dryRun: false });

    const stored = await prisma.product.findUniqueOrThrow({
      where: { barcode: code('-1') },
      include: { category: true, inventoryMovements: true },
    });
    expect(stored).toMatchObject({
      name: 'Anillo de plata',
      description: 'Fino',
      brand: 'Marca',
      cost: null,
      category: { name: category('lencería').toUpperCase() },
    });
    expect(stored.price.toFixed(2)).toBe('99.90');
    expect(stored.inventoryMovements).toEqual([
      expect.objectContaining({
        type: 'ADJUSTMENT_IN',
        referenceType: 'IMPORT',
        createdById: users.admin,
        notes: 'Inventario inicial (importación)',
      }),
    ]);
    expect(stored.inventoryMovements[0]!.quantityChange.toFixed(3)).toBe(
      '2.000',
    );
    // Stock 0 creates no movement.
    expect(
      await prisma.inventoryMovement.count({
        where: { product: { barcode: code('-2') } },
      }),
    ).toBe(0);

    const again = (await upload(file).expect(200)).body as ImportReportDto;
    expect(again).toMatchObject({ created: 0, categoriesCreated: [] });
    expect(
      again.skipped
        .filter(({ reason }) => reason === 'Ya existe en el catálogo')
        .map(({ row }) => row),
    ).toEqual([2, 3]);
    expect(
      await prisma.product.count({
        where: { barcode: { startsWith: `T${tag}` } },
      }),
    ).toBe(2);
  });

  it('reuses existing categories ignoring case and accents, and applies the category map', async () => {
    const existing = await http()
      .post('/api/catalog/categories')
      .set('Authorization', tokens.admin)
      .send({ name: category('lenceria') })
      .expect(201);
    const file = await workbook([
      ['Uno', null, code('-1'), 1, category('LENCERÍA'), null, null, 10],
      ['Dos', null, code('-2'), 1, category('festish'), null, null, 10],
      ['Tres', null, code('-3'), 1, 'Dildo', null, null, 10],
    ]);
    const map = JSON.stringify({
      [category('festish')]: category('fetish'),
      DILDO: null,
    });
    const report = (await upload(file, { categoryMap: map }).expect(200))
      .body as ImportReportDto;
    expect(report).toMatchObject({
      created: 3,
      withoutCategory: 1,
      categoriesCreated: [category('fetish').toUpperCase()],
      errors: [],
    });
    const products = await prisma.product.findMany({
      where: { barcode: { startsWith: `T${tag}` } },
      orderBy: { barcode: 'asc' },
      select: { categoryId: true, category: { select: { name: true } } },
    });
    expect(products[0]!.categoryId).toBe(existing.body.id);
    expect(products[1]!.category?.name).toBe(category('fetish').toUpperCase());
    expect(products[2]!.categoryId).toBeNull();
  });

  it('reports codes that already belong to a different product', async () => {
    await http()
      .post('/api/catalog/products')
      .set('Authorization', tokens.admin)
      .send({ codigoBarras: code('-1'), articulo: 'Original', precioVenta: 5 })
      .expect(201);
    const file = await workbook([
      ['Otro nombre', null, code('-1'), 1, category('X'), null, null, 10],
      ['original', null, code('-1'), 1, category('X'), null, null, 10],
    ]);
    // Same code, different names in the file → both rejected as a group.
    const shared = (await upload(file).expect(200)).body as ImportReportDto;
    expect(shared.created).toBe(0);
    expect(shared.errors).toHaveLength(2);

    const conflict = (
      await upload(
        await workbook([
          ['Otro nombre', null, code('-1'), 1, category('X'), null, null, 10],
        ]),
      ).expect(200)
    ).body as ImportReportDto;
    expect(conflict.errors).toEqual([
      {
        row: 2,
        codigoBarras: code('-1'),
        articulo: 'Otro nombre',
        message: 'El código ya pertenece a otro producto: Original',
      },
    ]);
    expect(conflict.categoriesCreated).toEqual([]);
  });

  it('rejects bad files, headers and category maps', async () => {
    await http().post(base).set('Authorization', tokens.admin).expect(400);
    await upload(Buffer.from('a,b'), {}, tokens.admin, 'inventario.csv').expect(
      400,
    );
    await upload(Buffer.from('not a zip'))
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe('Archivo Excel inválido'),
      );
    await upload(await workbook([['x']], ['articulo', 'stock']))
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe(
          'Faltan columnas obligatorias: codigo de barras, categoria, precio venta',
        ),
      );
    const file = await workbook([]);
    for (const fields of <Array<Record<string, string>>>[
      { categoryMap: '{' },
      { categoryMap: '{"A":1}' },
      { dryRun: 'yes' },
      { other: 'x' },
    ])
      await upload(file, fields).expect(400);
    await upload(Buffer.alloc(5 * 1024 * 1024 + 1))
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe('El archivo no debe superar 5 MB'),
      );
  });

  it('is only available to ADMIN', async () => {
    const file = await workbook([]);
    await http().post(base).attach('file', file, 'x.xlsx').expect(401);
    await upload(file, {}, tokens.seller).expect(403);
  });
});
