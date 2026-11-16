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

const base = '/api/productos/exportacion';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function parseBinary(
  res: request.Response,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Product export HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
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
          nombre: `Export ${key}`,
          email: `${randomUUID()}@export.test`,
          passwordHash: 'unused-test-hash',
          rol: { connect: { nombre: role } },
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
      where: { codigoBarras: { startsWith: `00${tag}` } },
      select: { id: true },
    });
    const ids = products.map(({ id }) => id);
    await prisma.inventoryMovement.deleteMany({
      where: { productoId: { in: ids } },
    });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.category.deleteMany({
      where: { descripcion: { startsWith: `EXP-${tag}` } },
    });
    await prisma.brand.deleteMany({
      where: { descripcion: { startsWith: `MARCA-${tag}` } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { id: { in: Object.values(users) } },
      });
    }
    await app?.close();
  });

  it('rejects unauthenticated requests (401) and non-admin roles (403)', async () => {
    await http().get(base).expect(401);
    await http().get(base).set('Authorization', tokens.seller).expect(403);
  });

  it('validates invalid query parameters (400)', async () => {
    await http()
      .get(`${base}?categoriaId=no-es-uuid`)
      .set('Authorization', tokens.admin)
      .expect(400);
    await http()
      .get(`${base}?campoDesconocido=1`)
      .set('Authorization', tokens.admin)
      .expect(400);
  });

  it('exports active products with Kardex stock, leading-zero barcodes and supports filters', async () => {
    const category = await prisma.category.create({
      data: { descripcion: `EXP-${tag}-CAT` },
    });
    const brand = await prisma.brand.create({
      data: { descripcion: `MARCA-${tag}` },
    });

    const pActive = await prisma.product.create({
      data: {
        nombre: `${tag} Alfa`,
        descripcion: 'Con stock bajo',
        codigoBarras: `00${tag}001`,
        precioCompra: 100.5,
        precioVenta: 250,
        existenciaMinima: 5,
        categoriaId: category.id,
        marcaId: brand.id,
        activo: true,
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        productoId: pActive.id,
        tipo: 'ADJUSTMENT_IN',
        cambioExistencias: 3.5,
        tipoReferencia: 'TEST',
        referenciaId: pActive.id,
        creadoPorId: users.admin,
      },
    });

    await prisma.product.create({
      data: {
        nombre: `${tag} Beta Inactivo`,
        codigoBarras: `00${tag}002`,
        precioVenta: 99,
        activo: false,
      },
    });

    // 1) Búsqueda por tag (solo activos)
    const res = await http()
      .get(`${base}?busqueda=${tag}`)
      .set('Authorization', tokens.admin)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);

    expect(res.headers['content-type']).toContain(XLSX_MIME);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="catalogo-productos-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body as unknown as ArrayBuffer);
    const sheet = book.getWorksheet('Productos');
    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBe(2);

    const row = sheet!.getRow(2);
    expect(row.getCell(1).value).toBe(`${tag} Alfa`);
    expect(row.getCell(3).value).toBe(`00${tag}001`);
    expect(row.getCell(4).value).toBe(3.5);
    expect(row.getCell(6).value).toBe(`EXP-${tag}-CAT`);
    expect(row.getCell(7).value).toBe(`MARCA-${tag}`);
    expect(row.getCell(8).value).toBe(100.5);
    expect(row.getCell(9).value).toBe(250);
    expect(row.getCell(10).value).toBe('ACTIVO');

    // 2) Incluyendo inactivos y filtrando por stockBajo=true
    const resAll = await http()
      .get(`${base}?busqueda=${tag}&incluirInactivos=true`)
      .set('Authorization', tokens.admin)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);
    const bookAll = new ExcelJS.Workbook();
    await bookAll.xlsx.load(resAll.body as unknown as ArrayBuffer);
    expect(bookAll.getWorksheet('Productos')!.rowCount).toBe(3);

    const resLow = await http()
      .get(`${base}?busqueda=${tag}&stockBajo=true&marcaId=${brand.id}`)
      .set('Authorization', tokens.admin)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);
    const bookLow = new ExcelJS.Workbook();
    await bookLow.xlsx.load(resLow.body as unknown as ArrayBuffer);
    expect(bookLow.getWorksheet('Productos')!.rowCount).toBe(2);

    // 3) Sin coincidencias -> solo encabezados
    const resEmpty = await http()
      .get(`${base}?busqueda=NOEXISTE-${tag}`)
      .set('Authorization', tokens.admin)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);
    const bookEmpty = new ExcelJS.Workbook();
    await bookEmpty.xlsx.load(resEmpty.body as unknown as ArrayBuffer);
    expect(bookEmpty.getWorksheet('Productos')!.rowCount).toBe(1);
  });
});
