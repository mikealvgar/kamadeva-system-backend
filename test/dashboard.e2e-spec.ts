import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type { ProductDto } from '../src/catalog/products/dto/product.dto.js';
import type { SaleDetailDto } from '../src/sales/dto/sale.dto.js';

interface SalesByMethodResponse {
  CASH: string;
  CARD: string;
  TRANSFER: string;
  OTHER: string;
}

interface SalesTodayResponse {
  total: string;
  count: number;
  ticketPromedio: string;
  porMetodo: SalesByMethodResponse;
}

interface InventorySummaryResponse {
  productosActivos: number;
  productosBajoMinimo: number;
}

interface ExpensesTodayResponse {
  total: string;
  desdeCaja: string;
}

interface EstimatedProfitResponse {
  ventasNetas: string;
  costoMercancia: string;
  expenses: string;
  profit: string;
  costoIncompleto: boolean;
}

interface DashboardSummaryResponse {
  date: string;
  timezone: string;
  ventasHoy: SalesTodayResponse;
  inventory: InventorySummaryResponse;
  gastosHoy: ExpensesTodayResponse;
  utilidadEstimadaHoy: EstimatedProfitResponse | null;
}

interface TopProductRefResponse {
  id: string;
  codigoBarras: string;
  nombre: string;
}

interface TopProductResponse {
  producto: TopProductRefResponse;
  unidades: string;
  ingresos: string;
  cantidadVentas: number;
}

interface TopProductsResponse {
  fechaInicio: string;
  fechaFin: string;
  ordenarPor: 'units' | 'revenue';
  datos: TopProductResponse[];
}

interface SalesHistoryDayResponse {
  date: string;
  ventasTotales: string;
  cantidadVentas: number;
  gastosTotales: string;
}

interface SalesHistoryResponse {
  periodo: 'week' | 'month';
  timezone: string;
  days: SalesHistoryDayResponse[];
}

const base = '/api/tablero';
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
          nombre: `Dashboard ${key}`,
          email: `${randomUUID()}@dashboard.test`,
          passwordHash: 'unused-test-hash',
          ...(role
            ? { rol: { connect: { nombre: role } } }
            : {}),
        },
      });
      users[key] = user.id;
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: role ? [role] : [] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
    categoryId = (
      await prisma.category.create({
        data: { descripcion: `Dashboard ${randomUUID().slice(0, 8)}` },
      })
    ).id;
    expenseCategoryId = (
      await prisma.expenseCategory.create({
        data: { nombre: `Dashboard ${randomUUID().slice(0, 8)}` },
      })
    ).id;
  });

  afterEach(async () => {
    if (!prisma) return;
    const userIds = Object.values(users);
    const sales = await prisma.sale.findMany({
      where: { creadoPorId: { in: userIds } },
      select: { id: true },
    });
    const saleIds = sales.map(({ id }) => id);
    await prisma.inventoryMovement.deleteMany({
      where: { productoId: { in: products } },
    });
    await prisma.idempotencyKey.deleteMany({
      where: { usuarioId: { in: userIds } },
    });
    await prisma.saleItem.deleteMany({ where: { ventaId: { in: saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.expense.deleteMany({
      where: { creadoPorId: { in: userIds } },
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
        .post('/api/productos')
        .set('Authorization', tokens.admin)
        .send({
          codigoBarras: `SKU-${randomUUID().slice(0, 16)}`,
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
          productoId: created.id,
          tipo: 'PURCHASE_IN',
          cambioExistencias: stock,
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
        .post('/api/ventas')
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
      .post('/api/gastos')
      .set('Authorization', tokens.seller)
      .send({
        concept: 'Gasto',
        amount,
        categoryId: expenseCategoryId,
        deductFromCash,
      })
      .expect(201);
  }

  async function summary(token: string): Promise<DashboardSummaryResponse> {
    return (
      await http()
        .get(`${base}/resumen`)
        .set('Authorization', token)
        .expect(200)
    ).body as DashboardSummaryResponse;
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
      .post(`/api/ventas/${cancelled.id}/cancelar`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'Prueba' })
      .expect(200);
    await expense(25, true);
    await expense(10, false);

    const after = await summary(tokens.admin);
    const delta = (pick: (s: DashboardSummaryResponse) => string) =>
      +(n(pick(after)) - n(pick(before))).toFixed(2);
    expect(after.ventasHoy.count - before.ventasHoy.count).toBe(2);
    expect(delta((s) => s.ventasHoy.total)).toBe(200);
    expect(delta((s) => s.ventasHoy.porMetodo.CASH)).toBe(100);
    expect(delta((s) => s.ventasHoy.porMetodo.CARD)).toBe(100);
    expect(delta((s) => s.gastosHoy.total)).toBe(35);
    expect(delta((s) => s.gastosHoy.desdeCaja)).toBe(25);
    expect(delta((s) => s.utilidadEstimadaHoy!.ventasNetas)).toBe(200);
    expect(delta((s) => s.utilidadEstimadaHoy!.costoMercancia)).toBe(60);
    expect(delta((s) => s.utilidadEstimadaHoy!.expenses)).toBe(35);
    expect(delta((s) => s.utilidadEstimadaHoy!.profit)).toBe(105);
    expect(after.inventory.productosActivos).toBe(
      before.inventory.productosActivos,
    );

    const seller = await summary(tokens.seller);
    expect(seller.utilidadEstimadaHoy).toBeNull();
    expect(seller.ventasHoy).toEqual(after.ventasHoy);
  });

  it('keeps the cost of past sales when the product cost changes later', async () => {
    const item = await product(100, 30, 10);
    const before = await summary(tokens.admin);
    await sell(item.id, 2, 100);
    await http()
      .patch(`/api/productos/${item.id}`)
      .set('Authorization', tokens.admin)
      .send({ precioCompra: 90 })
      .expect(200);
    const after = await summary(tokens.admin);
    expect(
      +(
        n(after.utilidadEstimadaHoy!.costoMercancia) -
        n(before.utilidadEstimadaHoy!.costoMercancia)
      ).toFixed(2),
    ).toBe(60);
    const stored = await prisma.saleItem.findFirstOrThrow({
      where: { productoId: item.id },
    });
    expect(stored.costoUnitario?.toFixed(2)).toBe('30.00');
  });

  it('flags missing product costs', async () => {
    const item = await product(100, null, 10);
    await sell(item.id, 1, 100);
    expect(
      (await summary(tokens.admin)).utilidadEstimadaHoy!.costoIncompleto,
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
      .patch(`/api/productos/${inactive.id}`)
      .set('Authorization', tokens.admin)
      .send({ isActive: false })
      .expect(200);
    const after = (await summary(tokens.seller)).inventory;
    expect(after.productosBajoMinimo - before.productosBajoMinimo).toBe(1);
    expect(after.productosActivos - before.productosActivos).toBe(3);

    // Selling one more unit of the product above its minimum makes it low.
    const above = products[1]!;
    await sell(above, 1, 10);
    expect((await summary(tokens.seller)).inventory.productosBajoMinimo).toBe(
      before.productosBajoMinimo + 2,
    );
    await http()
      .patch(`/api/productos/${atMinimum.id}`)
      .set('Authorization', tokens.admin)
      .send({ stockMinimo: null })
      .expect(200)
      .expect(({ body }) => expect(body.stockMinimo).toBeNull());
    expect((await summary(tokens.seller)).inventory.productosBajoMinimo).toBe(
      before.productosBajoMinimo + 1,
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
      .post(`/api/ventas/${cancelled.id}/cancelar`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'Prueba' })
      .expect(200);

    const top = async (query: Record<string, string | number>) =>
      (
        await http()
          .get(`${base}/productos-mas-vendidos`)
          .query({ startDate, ...query })
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as TopProductsResponse;
    const byUnits = await top({});
    expect(byUnits.ordenarPor).toBe('units');
    expect(byUnits.datos).toEqual([
      {
        producto: { id: cheap.id, codigoBarras: cheap.codigoBarras, nombre: 'Pieza' },
        unidades: '3.000',
        ingresos: '300.00',
        cantidadVentas: 2,
      },
      {
        producto: { id: pricey.id, codigoBarras: pricey.codigoBarras, nombre: 'Pieza' },
        unidades: '1.000',
        ingresos: '500.00',
        cantidadVentas: 1,
      },
    ]);
    const byRevenue = await top({ sortBy: 'revenue' });
    expect(byRevenue.datos.map(({ producto: p }) => p.id)).toEqual([
      pricey.id,
      cheap.id,
    ]);
    expect((await top({ limit: 1 })).datos).toHaveLength(1);
    expect(
      (await top({ endDate: startDate })).datos.map(({ producto: p }) => p.id),
    ).toEqual([]);
  });

  it('returns a full week and month of daily totals', async () => {
    const item = await product(100, 10, 10);
    const week = async () =>
      (
        await http()
          .get(`${base}/historial-ventas`)
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as SalesHistoryResponse;
    const before = await week();
    expect(before.periodo).toBe('week');
    expect(before.timezone).toBe(timezone);
    expect(before.days).toHaveLength(7);
    const dates = before.days.map(({ date }) => date);
    expect(dates).toContain(today());
    expect(new Date(`${dates[0]}T12:00:00Z`).getUTCDay()).toBe(1); // Monday

    await sell(item.id, 2, 100);
    await expense(15, false);
    const after = await week();
    const row = (history: SalesHistoryResponse) =>
      history.days.find(({ date }) => date === today())!;
    expect(row(after).cantidadVentas - row(before).cantidadVentas).toBe(1);
    expect(
      +(n(row(after).ventasTotales) - n(row(before).ventasTotales)).toFixed(2),
    ).toBe(200);
    expect(
      +(n(row(after).gastosTotales) - n(row(before).gastosTotales)).toFixed(2),
    ).toBe(15);

    const month = (
      await http()
        .get(`${base}/historial-ventas`)
        .query({ period: 'month' })
        .set('Authorization', tokens.seller)
        .expect(200)
    ).body as SalesHistoryResponse;
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
          .get(`${base}/historial-ventas`)
          .query({ period: 'month' })
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as SalesHistoryResponse;
    const day = (h: SalesHistoryResponse, date: string) =>
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
          estado: 'COMPLETED',
          creadoPorId: users.seller,
          subtotal: total,
          total,
          fechaCreacion: new Date(createdAt),
        },
      });
    }
    const after = await history();
    const delta = (date: string) =>
      +(
        n(day(after, date).ventasTotales) - n(day(before, date).ventasTotales)
      ).toFixed(2);
    expect(delta(second)).toBe(7);
    expect(delta(third)).toBe(11);
  });

  it('validates queries and requires a role', async () => {
    for (const [path, query] of [
      ['productos-mas-vendidos', { limit: 0 }],
      ['productos-mas-vendidos', { limit: 51 }],
      ['productos-mas-vendidos', { sortBy: 'profit' }],
      ['productos-mas-vendidos', { startDate: 'ayer' }],
      [
        'productos-mas-vendidos',
        { startDate: '2026-10-02T00:00:00Z', endDate: '2026-10-01T00:00:00Z' },
      ],
      ['historial-ventas', { period: 'year' }],
    ] as const) {
      await http()
        .get(`${base}/${path}`)
        .query(query)
        .set('Authorization', tokens.seller)
        .expect(400);
    }
    for (const path of [
      'resumen',
      'productos-mas-vendidos',
      'historial-ventas',
    ]) {
      await http().get(`${base}/${path}`).expect(401);
      await http()
        .get(`${base}/${path}`)
        .set('Authorization', tokens.noRole)
        .expect(403);
    }
  });
});
