import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type {
  DashboardSummaryDto,
  SalesHistoryDto,
  TopProductsDto,
} from '../src/dashboard/dto/dashboard.dto.js';
import type { ProductDto } from '../src/catalog/products/dto/product.dto.js';
import type { SaleDetailDto } from '../src/sales/dto/sale.dto.js';

const base = '/api/dashboard';
const timezone = 'America/Mexico_City';
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const n = (value: string) => Number(value);

describe('Dashboard HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  let categoryId: string;
  let expenseCategoryId: string;
  const products: string[] = [];
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
          name: `Dashboard ${key}`,
          email: `${randomUUID()}@dashboard.test`,
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
    categoryId = (
      await prisma.category.create({
        data: { name: 'Dashboard', slug: `dashboard-${randomUUID()}` },
      })
    ).id;
    expenseCategoryId = (
      await prisma.expenseCategory.create({
        data: { name: `Dashboard ${randomUUID().slice(0, 8)}` },
      })
    ).id;
  });

  afterEach(async () => {
    if (!prisma) return;
    const userIds = Object.values(users);
    const sales = await prisma.sale.findMany({
      where: { createdById: { in: userIds } },
      select: { id: true },
    });
    const saleIds = sales.map(({ id }) => id);
    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: products } },
    });
    await prisma.idempotencyKey.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.payment.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.expense.deleteMany({
      where: { createdById: { in: userIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    products.length = 0;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const userIds = Object.values(users);
        await prisma.expenseCategory.deleteMany({
          where: { id: expenseCategoryId },
        });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.userRole.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function product(
    price: number,
    cost: number | null,
    stock: number,
    stockMinimo?: number,
  ): Promise<ProductDto> {
    const created = (
      await http()
        .post('/api/catalog/products')
        .set('Authorization', tokens.admin)
        .send({
          codigoBarras: `SKU-${randomUUID()}`,
          articulo: 'Pieza',
          precioVenta: price,
          precioCompra: cost,
          categoryId,
          ...(stockMinimo === undefined ? {} : { stockMinimo }),
        })
        .expect(201)
    ).body as ProductDto;
    products.push(created.id);
    if (stock > 0)
      await prisma.inventoryMovement.create({
        data: {
          productId: created.id,
          type: 'PURCHASE_IN',
          quantityChange: stock,
        },
      });
    return created;
  }

  async function sell(
    productId: string,
    quantity: number,
    price: number,
    method: 'CASH' | 'CARD' = 'CASH',
  ): Promise<SaleDetailDto> {
    return (
      await http()
        .post('/api/sales')
        .set('Authorization', tokens.seller)
        .set('Idempotency-Key', randomUUID())
        .send({
          items: [{ productId, quantity }],
          payment: { method, amount: price * quantity },
        })
        .expect(201)
    ).body as SaleDetailDto;
  }

  async function expense(amount: number, deductFromCash: boolean) {
    await http()
      .post('/api/expenses')
      .set('Authorization', tokens.seller)
      .send({
        concept: 'Gasto',
        amount,
        categoryId: expenseCategoryId,
        deductFromCash,
      })
      .expect(201);
  }

  async function summary(token: string): Promise<DashboardSummaryDto> {
    return (
      await http()
        .get(`${base}/summary`)
        .set('Authorization', token)
        .expect(200)
    ).body as DashboardSummaryDto;
  }

  it('summarizes today in local time, excludes cancelled sales and shows profit only to ADMIN', async () => {
    const item = await product(100, 30, 100);
    const before = await summary(tokens.admin);
    expect(before.date).toBe(today());
    expect(before.timezone).toBe(timezone);

    await sell(item.id, 1, 100, 'CASH');
    const cancelled = await sell(item.id, 1, 100, 'CASH');
    await sell(item.id, 1, 100, 'CARD');
    await http()
      .post(`/api/sales/${cancelled.id}/cancel`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'Prueba' })
      .expect(200);
    await expense(25, true);
    await expense(10, false);

    const after = await summary(tokens.admin);
    const delta = (pick: (s: DashboardSummaryDto) => string) =>
      +(n(pick(after)) - n(pick(before))).toFixed(2);
    expect(after.salesToday.count - before.salesToday.count).toBe(2);
    expect(delta((s) => s.salesToday.total)).toBe(200);
    expect(delta((s) => s.salesToday.byMethod.CASH)).toBe(100);
    expect(delta((s) => s.salesToday.byMethod.CARD)).toBe(100);
    expect(delta((s) => s.expensesToday.total)).toBe(35);
    expect(delta((s) => s.expensesToday.fromCash)).toBe(25);
    expect(delta((s) => s.estimatedProfitToday!.netSales)).toBe(200);
    expect(delta((s) => s.estimatedProfitToday!.costOfGoods)).toBe(60);
    expect(delta((s) => s.estimatedProfitToday!.expenses)).toBe(35);
    expect(delta((s) => s.estimatedProfitToday!.profit)).toBe(105);
    expect(after.inventory.activeProducts).toBe(
      before.inventory.activeProducts,
    );

    const seller = await summary(tokens.seller);
    expect(seller.estimatedProfitToday).toBeNull();
    expect(seller.salesToday).toEqual(after.salesToday);
  });

  it('keeps the cost of past sales when the product cost changes later', async () => {
    const item = await product(100, 30, 10);
    const before = await summary(tokens.admin);
    await sell(item.id, 2, 100);
    await http()
      .patch(`/api/catalog/products/${item.id}`)
      .set('Authorization', tokens.admin)
      .send({ precioCompra: 90 })
      .expect(200);
    const after = await summary(tokens.admin);
    expect(
      +(
        n(after.estimatedProfitToday!.costOfGoods) -
        n(before.estimatedProfitToday!.costOfGoods)
      ).toFixed(2),
    ).toBe(60);
    const stored = await prisma.saleItem.findFirstOrThrow({
      where: { productId: item.id },
    });
    expect(stored.unitCost?.toFixed(2)).toBe('30.00');
  });

  it('flags missing product costs', async () => {
    const item = await product(100, null, 10);
    await sell(item.id, 1, 100);
    expect(
      (await summary(tokens.admin)).estimatedProfitToday!.costIncomplete,
    ).toBe(true);
  });

  it('counts low stock from each product minimum', async () => {
    const before = (await summary(tokens.seller)).inventory;
    const atMinimum = await product(10, 1, 5, 5);
    expect(atMinimum.stockMinimo).toBe('5.000');
    await product(10, 1, 6, 5); // above minimum
    await product(10, 1, 0); // no minimum: not tracked
    const inactive = await product(10, 1, 0, 5);
    await http()
      .patch(`/api/catalog/products/${inactive.id}`)
      .set('Authorization', tokens.admin)
      .send({ isActive: false })
      .expect(200);
    const after = (await summary(tokens.seller)).inventory;
    expect(after.lowStock - before.lowStock).toBe(1);
    expect(after.activeProducts - before.activeProducts).toBe(3);

    // Selling one more unit of the product above its minimum makes it low.
    const above = products[1]!;
    await sell(above, 1, 10);
    expect((await summary(tokens.seller)).inventory.lowStock).toBe(
      before.lowStock + 2,
    );
    await http()
      .patch(`/api/catalog/products/${atMinimum.id}`)
      .set('Authorization', tokens.admin)
      .send({ stockMinimo: null })
      .expect(200)
      .expect(({ body }) => expect(body.stockMinimo).toBeNull());
    expect((await summary(tokens.seller)).inventory.lowStock).toBe(
      before.lowStock + 1,
    );
  });

  it('ranks top products by units or revenue, counting distinct sales', async () => {
    const startDate = new Date().toISOString();
    const cheap = await product(100, 10, 50);
    const pricey = await product(500, 10, 50);
    await sell(cheap.id, 2, 100);
    await sell(cheap.id, 1, 100);
    await sell(pricey.id, 1, 500);
    const cancelled = await sell(pricey.id, 5, 500);
    await http()
      .post(`/api/sales/${cancelled.id}/cancel`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'Prueba' })
      .expect(200);

    const top = async (query: Record<string, string | number>) =>
      (
        await http()
          .get(`${base}/top-products`)
          .query({ startDate, ...query })
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as TopProductsDto;
    const byUnits = await top({});
    expect(byUnits.sortBy).toBe('units');
    expect(byUnits.data).toEqual([
      {
        product: { id: cheap.id, barcode: cheap.codigoBarras, name: 'Pieza' },
        units: '3.000',
        revenue: '300.00',
        salesCount: 2,
      },
      {
        product: { id: pricey.id, barcode: pricey.codigoBarras, name: 'Pieza' },
        units: '1.000',
        revenue: '500.00',
        salesCount: 1,
      },
    ]);
    const byRevenue = await top({ sortBy: 'revenue' });
    expect(byRevenue.data.map(({ product: p }) => p.id)).toEqual([
      pricey.id,
      cheap.id,
    ]);
    expect((await top({ limit: 1 })).data).toHaveLength(1);
    expect(
      (await top({ endDate: startDate })).data.map(({ product: p }) => p.id),
    ).toEqual([]);
  });

  it('returns a full week and month of daily totals', async () => {
    const item = await product(100, 10, 10);
    const week = async () =>
      (
        await http()
          .get(`${base}/sales-history`)
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as SalesHistoryDto;
    const before = await week();
    expect(before.period).toBe('week');
    expect(before.timezone).toBe(timezone);
    expect(before.days).toHaveLength(7);
    const dates = before.days.map(({ date }) => date);
    expect(dates).toContain(today());
    expect(new Date(`${dates[0]}T12:00:00Z`).getUTCDay()).toBe(1); // Monday

    await sell(item.id, 2, 100);
    await expense(15, false);
    const after = await week();
    const row = (history: SalesHistoryDto) =>
      history.days.find(({ date }) => date === today())!;
    expect(row(after).salesCount - row(before).salesCount).toBe(1);
    expect(
      +(n(row(after).salesTotal) - n(row(before).salesTotal)).toFixed(2),
    ).toBe(200);
    expect(
      +(n(row(after).expensesTotal) - n(row(before).expensesTotal)).toFixed(2),
    ).toBe(15);

    const month = (
      await http()
        .get(`${base}/sales-history`)
        .query({ period: 'month' })
        .set('Authorization', tokens.seller)
        .expect(200)
    ).body as SalesHistoryDto;
    const [year, monthNumber] = today().split('-').map(Number);
    expect(month.days).toHaveLength(
      new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate(),
    );
    expect(month.days[0]!.date.endsWith('-01')).toBe(true);
    expect(row(month)).toEqual(row(after));
  });

  it('buckets sales by local calendar day, not by UTC day', async () => {
    const [year, month] = today().split('-');
    const history = async () =>
      (
        await http()
          .get(`${base}/sales-history`)
          .query({ period: 'month' })
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as SalesHistoryDto;
    const day = (h: SalesHistoryDto, date: string) =>
      h.days.find((row) => row.date === date)!;
    const second = `${year}-${month}-02`;
    const third = `${year}-${month}-03`;
    const before = await history();
    // Mexico City is UTC−6: 23:30 local on the 2nd is 05:30 UTC on the 3rd,
    // and 00:30 local on the 3rd is 06:30 UTC on the 3rd.
    for (const [createdAt, total] of [
      [`${third}T05:30:00Z`, '7.00'],
      [`${third}T06:30:00Z`, '11.00'],
    ] as const) {
      await prisma.sale.create({
        data: {
          folio: `V-${randomUUID()}`,
          status: 'COMPLETED',
          createdById: users.seller,
          subtotal: total,
          total,
          createdAt: new Date(createdAt),
        },
      });
    }
    const after = await history();
    const delta = (date: string) =>
      +(
        n(day(after, date).salesTotal) - n(day(before, date).salesTotal)
      ).toFixed(2);
    expect(delta(second)).toBe(7);
    expect(delta(third)).toBe(11);
  });

  it('validates queries and requires a role', async () => {
    for (const [path, query] of [
      ['top-products', { limit: 0 }],
      ['top-products', { limit: 51 }],
      ['top-products', { sortBy: 'profit' }],
      ['top-products', { startDate: 'ayer' }],
      [
        'top-products',
        { startDate: '2026-10-02T00:00:00Z', endDate: '2026-10-01T00:00:00Z' },
      ],
      ['sales-history', { period: 'year' }],
    ] as const) {
      await http()
        .get(`${base}/${path}`)
        .query(query)
        .set('Authorization', tokens.seller)
        .expect(400);
    }
    for (const path of ['summary', 'top-products', 'sales-history']) {
      await http().get(`${base}/${path}`).expect(401);
      await http()
        .get(`${base}/${path}`)
        .set('Authorization', tokens.noRole)
        .expect(403);
    }
  });
});
