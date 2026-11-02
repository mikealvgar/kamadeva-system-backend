import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const base = '/api/compras';

describe('Purchases HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const users: string[] = [];
  const providers: string[] = [];
  const products: string[] = [];
  const purchases: string[] = [];
  const tokens: Record<string, string> = {};
  const http = () => request(app!.getHttpServer());
  let providerId: string;
  let productId: string;

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
    ] as const) {
      const user = await prisma.user.create({
        data: {
          nombre: `Purchases ${key}`,
          email: `${randomUUID()}@purchases.test`,
          passwordHash: 'unused-test-hash',
          rol: { connect: { nombre: role } },
        },
      });
      users.push(user.id);
      tokens[key] = `Bearer ${jwt.sign(
        { sub: user.id, email: user.email, roles: [role] },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: '15m',
          algorithm: 'HS256',
        },
      )}`;
    }
    const provider = await prisma.provider.create({
      data: { nombre: `Proveedor ${randomUUID()}` },
    });
    providerId = provider.id;
    providers.push(provider.id);
    const product = await prisma.product.create({
      data: {
        codigoBarras: `CB-${randomUUID().slice(0, 10)}`,
        nombre: 'Producto de compra',
        precioVenta: '99.95',
        precioCompra: '12.34',
      },
    });
    productId = product.id;
    products.push(product.id);
    await prisma.inventoryMovement.create({
      data: {
        productoId: productId,
        tipo: 'ADJUSTMENT_IN',
        cambioExistencias: '5.000',
        creadoPorId: users[0],
        notas: 'Existencia inicial de prueba',
      },
    });
  });

  afterEach(async () => {
    if (!prisma) return;
    if (purchases.length) {
      await prisma.inventoryMovement.deleteMany({
        where: {
          tipoReferencia: 'PURCHASE',
          referenciaId: { in: purchases },
        },
      });
      await prisma.purchaseItem.deleteMany({
        where: { compraId: { in: purchases } },
      });
      await prisma.purchase.deleteMany({ where: { id: { in: purchases } } });
      purchases.length = 0;
    }
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.inventoryMovement.deleteMany({
          where: { productoId: { in: products } },
        });
        await prisma.product.deleteMany({ where: { id: { in: products } } });
        await prisma.provider.deleteMany({ where: { id: { in: providers } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
    } finally {
      await app?.close();
    }
  });

  function receivePurchase(
    token = tokens.admin!,
    override: Record<string, unknown> = {},
  ) {
    return http()
      .post(base)
      .set('Authorization', token)
      .send({
        proveedorId: providerId,
        fechaRecepcion: '2026-10-30T18:00:00.000Z',
        folioProveedor: ' FAC-1842 ',
        notas: ' Compra de mercancía ',
        productos: [{ productoId: productId, cantidad: 2 }],
        ...override,
      });
  }

  it('receives a purchase atomically, snapshots acquisition cost and increases stock', async () => {
    const response = await receivePurchase().expect(201);
    const purchase = response.body as {
      id: string;
      total: string;
      productos: Array<{ costoUnitario: string; subtotal: string }>;
    };
    purchases.push(purchase.id);
    expect(purchase).toMatchObject({
      proveedor: { id: providerId },
      folioProveedor: 'FAC-1842',
      total: '24.68',
      productos: [
        { cantidad: '2.000', costoUnitario: '12.34', subtotal: '24.68' },
      ],
    });

    const movements = await prisma.inventoryMovement.findMany({
      where: { tipoReferencia: 'PURCHASE', referenciaId: purchase.id },
    });
    expect(movements).toHaveLength(1);
    expect({
      tipo: movements[0]!.tipo,
      cambioExistencias: movements[0]!.cambioExistencias.toFixed(3),
      costoUnitario: movements[0]!.costoUnitario?.toFixed(2),
      creadoPorId: movements[0]!.creadoPorId,
    }).toEqual({
      tipo: 'PURCHASE_IN',
      cambioExistencias: '2.000',
      costoUnitario: '12.34',
      creadoPorId: users[0],
    });
    const stock = await prisma.inventoryMovement.aggregate({
      where: { productoId: productId },
      _sum: { cambioExistencias: true },
    });
    expect(stock._sum.cambioExistencias?.toFixed(3)).toBe('7.000');
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.precioCompra?.toFixed(2)).toBe('12.34');
    expect(product.precioVenta.toFixed(2)).toBe('99.95');
  });

  it('allows ADMIN to create and ADMIN/VENDEDOR to list and read purchases', async () => {
    const created = await receivePurchase().expect(201);
    purchases.push(created.body.id as string);
    await receivePurchase(tokens.seller!).expect(403);
    await http().get(base).set('Authorization', tokens.seller!).expect(200);
    await http()
      .get(`${base}/${created.body.id as string}`)
      .set('Authorization', tokens.seller!)
      .expect(200);
    await http().get(base).expect(401);
  });

  it('filters by provider and reception date and paginates results', async () => {
    const created = await receivePurchase().expect(201);
    purchases.push(created.body.id as string);
    const response = await http()
      .get(`${base}?proveedorId=${providerId}&pagina=1&limite=1`)
      .set('Authorization', tokens.admin!)
      .expect(200);
    expect(response.body).toMatchObject({ pagina: 1, limite: 1, total: 1 });
    expect(response.body.datos[0].id).toBe(created.body.id);
    await http()
      .get(`${base}?fechaInicio=2027-01-01T00:00:00.000Z`)
      .set('Authorization', tokens.admin!)
      .expect(200)
      .expect(({ body }) => expect(body.datos).toEqual([]));
  });

  it('rejects invalid products, missing acquisition cost, inactive records and bad bodies without stock changes', async () => {
    await receivePurchase(tokens.admin!, { productos: [] }).expect(400);
    await receivePurchase(tokens.admin!, {
      productos: [
        { productoId: productId, cantidad: 1 },
        { productoId: productId, cantidad: 2 },
      ],
    }).expect(400);
    await receivePurchase(tokens.admin!, {
      productos: [{ productoId: randomUUID(), cantidad: 1 }],
    }).expect(404);

    await prisma.product.update({
      where: { id: productId },
      data: { precioCompra: null },
    });
    await receivePurchase().expect(400);
    await prisma.product.update({
      where: { id: productId },
      data: { precioCompra: '12.34', activo: false },
    });
    await receivePurchase().expect(409);
    await prisma.product.update({
      where: { id: productId },
      data: { activo: true },
    });

    const stock = await prisma.inventoryMovement.aggregate({
      where: { productoId: productId },
      _sum: { cambioExistencias: true },
    });
    expect(stock._sum.cambioExistencias?.toFixed(3)).toBe('5.000');
    expect(await prisma.purchase.count()).toBe(0);
  });
});
