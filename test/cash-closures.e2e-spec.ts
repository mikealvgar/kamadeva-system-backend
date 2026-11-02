import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { setupApp } from '../src/setup-app.js';
import type { SaleDetailDto } from '../src/sales/dto/sale.dto.js';

interface CashClosureSummaryResponse {
  corteAnteriorId: string | null;
  inicioPeriodo: string | null;
  fechaGeneracion: string;
  fondoInicial: string;
  sales: {
    count: number;
    cash: string;
    card: string;
    transfer: string;
    other: string;
    total: string;
  };
  refunds: { cash: string; total: string };
  expenses: { count: number; cash: string; total: string };
  efectivoEsperado: string;
}

interface CashClosureResponse {
  id: string;
  corteAnteriorId: string | null;
  inicioPeriodo: string | null;
  fechaCierre: string;
  cerradoPor: { id: string; nombre: string };
  fondoInicial: string;
  sales: {
    count: number;
    cash: string;
    card: string;
    transfer: string;
    other: string;
    total: string;
  };
  refunds: { cash: string; total: string };
  expenses: { count: number; cash: string; total: string };
  ajustes: Array<{
    id: string;
    tipo: 'INCOME' | 'WITHDRAWAL';
    monto: string;
    descripcion: string;
  }>;
  ajustesEntrada: string;
  ajustesSalida: string;
  efectivoEsperado: string;
  denominaciones: Record<string, number>;
  efectivoContado: string;
  diferencia: string;
  fondoDejado: string;
  efectivoRetirado: string;
  notas: string | null;
}

interface CashClosurePageResponse {
  datos: CashClosureResponse[];
  total: number;
  pagina: number;
  limite: number;
}

const base = '/api/cortes-caja';

describe('Cash closures HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  let categoryId: string;
  let productId: string;
  let expenseCategoryId: string;
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
          nombre: `Closures ${key}`,
          email: `${randomUUID()}@closures.test`,
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
        data: { descripcion: `Closures ${randomUUID().slice(0, 8)}` },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          codigoBarras: randomUUID().slice(0, 20),
          nombre: 'Pieza',
          precioVenta: '50.00',
          precioCompra: '25.00',
          categoriaId: categoryId,
        },
      })
    ).id;
    await prisma.inventoryMovement.create({
      data: {
        productoId: productId,
        tipo: 'ADJUSTMENT_IN',
        cambioExistencias: 1000,
        costoUnitario: '25.00',
      },
    });
    expenseCategoryId = (
      await prisma.expenseCategory.create({
        data: { nombre: `Cortes ${randomUUID().slice(0, 8)}` },
      })
    ).id;
  });

  // Closures are store-wide: start every test from a fresh baseline that
  // sweeps anything pending and leaves a known float.
  beforeEach(async () => {
    await baseline(0);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const userIds = Object.values(users);
        const closures = await prisma.cashClosure.findMany({
          where: { cerradoPorId: { in: userIds } },
          select: { id: true },
        });
        const closureIds = closures.map(({ id }) => id);
        // Unlink first so rows from other suites are left as they were.
        await prisma.sale.updateMany({
          where: { corteCajaId: { in: closureIds } },
          data: { corteCajaId: null },
        });
        await prisma.expense.updateMany({
          where: { corteCajaId: { in: closureIds } },
          data: { corteCajaId: null },
        });
        await prisma.cashClosureAdjustment.deleteMany({
          where: { corteCajaId: { in: closureIds } },
        });
        // Delete the chain newest first (previousClosureId is RESTRICT).
        const ordered = await prisma.cashClosure.findMany({
          where: { id: { in: closureIds } },
          orderBy: { fechaCierre: 'desc' },
          select: { id: true },
        });
        for (const { id } of ordered)
          await prisma.cashClosure.delete({ where: { id } });
        const sales = await prisma.sale.findMany({
          where: { creadoPorId: { in: userIds } },
          select: { id: true },
        });
        const saleIds = sales.map(({ id }) => id);
        await prisma.inventoryMovement.deleteMany({ where: { productoId: productId } });
        await prisma.idempotencyKey.deleteMany({
          where: { usuarioId: { in: userIds } },
        });
        await prisma.saleItem.deleteMany({ where: { ventaId: { in: saleIds } } });
        await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
        await prisma.expense.deleteMany({
          where: { creadoPorId: { in: userIds } },
        });
        await prisma.expenseCategory.deleteMany({
          where: { id: expenseCategoryId },
        });
        await prisma.product.deleteMany({ where: { categoriaId: categoryId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function summary(): Promise<CashClosureSummaryResponse> {
    return (
      await http()
        .get(`${base}/resumen-actual`)
        .set('Authorization', tokens.seller)
        .expect(200)
    ).body as CashClosureSummaryResponse;
  }

  const close = (body: object, token: string = tokens.seller) =>
    http().post(base).set('Authorization', token).send(body);

  /** Closure counting `float` in $1 coins and leaving it all as float. */
  async function baseline(float: number): Promise<CashClosureResponse> {
    const sum = await summary();
    return (
      await close({
        previousClosureId: sum.corteAnteriorId,
        denominations: { '1': float },
        floatLeft: float,
      }).expect(201)
    ).body as CashClosureResponse;
  }

  async function sell(
    quantity: number,
    method: 'CASH' | 'CARD',
  ): Promise<SaleDetailDto> {
    return (
      await http()
        .post('/api/ventas')
        .set('Authorization', tokens.seller)
        .set('Idempotency-Key', randomUUID())
        .send({
          items: [{ productId, quantity }],
          payment: { method, amount: 50 * quantity },
        })
        .expect(201)
    ).body as SaleDetailDto;
  }

  const cancel = (saleId: string) =>
    http()
      .post(`/api/ventas/${saleId}/cancelar`)
      .set('Authorization', tokens.seller)
      .send({ reason: 'Prueba' })
      .expect(200);

  async function expense(
    amount: number,
    deductFromCash: boolean,
  ): Promise<{ id: string }> {
    return (
      await http()
        .post('/api/gastos')
        .set('Authorization', tokens.seller)
        .send({
          concept: 'Gasto',
          amount,
          categoryId: expenseCategoryId,
          deductFromCash,
        })
        .expect(201)
    ).body as { id: string };
  }

  it('closes with the full formula computed by the server', async () => {
    const opening = await baseline(500);
    await sell(2, 'CASH'); // 100
    const cancelled = await sell(1, 'CASH'); // 50, cancelled in the same period
    await sell(4, 'CARD'); // 200
    await cancel(cancelled.id);
    await expense(30, true);
    await expense(20, false);

    const pending = await summary();
    expect(pending).toEqual({
      corteAnteriorId: opening.id,
      inicioPeriodo: opening.fechaCierre,
      fechaGeneracion: expect.any(String),
      fondoInicial: '500.00',
      sales: {
        count: 3,
        cash: '150.00',
        card: '200.00',
        transfer: '0.00',
        other: '0.00',
        total: '350.00',
      },
      refunds: { cash: '50.00', total: '50.00' },
      expenses: { count: 2, cash: '30.00', total: '50.00' },
      // 500 + 150 − 50 − 30
      efectivoEsperado: '570.00',
    });

    const response = await close({
      previousClosureId: opening.id,
      denominations: { '500': 1, '50': 1, '20': 1 },
      adjustments: [
        { type: 'INCOME', amount: 10, description: ' Venta no registrada ' },
        { type: 'WITHDRAWAL', amount: 5, description: 'Pago a mensajero' },
      ],
      floatLeft: 300,
      notes: ' Faltaron 5 pesos ',
    }).expect(201);
    const closure = response.body as CashClosureResponse;
    expect(closure).toEqual({
      id: expect.any(String),
      corteAnteriorId: opening.id,
      inicioPeriodo: opening.fechaCierre,
      fechaCierre: expect.any(String),
      cerradoPor: { id: users.seller, nombre: 'Closures seller' },
      fondoInicial: '500.00',
      sales: pending.sales,
      refunds: pending.refunds,
      expenses: pending.expenses,
      ajustes: [
        {
          id: expect.any(String),
          tipo: 'INCOME',
          monto: '10.00',
          descripcion: 'Venta no registrada',
        },
        {
          id: expect.any(String),
          tipo: 'WITHDRAWAL',
          monto: '5.00',
          descripcion: 'Pago a mensajero',
        },
      ],
      ajustesEntrada: '10.00',
      ajustesSalida: '5.00',
      // 570 + 10 − 5
      efectivoEsperado: '575.00',
      denominaciones: {
        '1000': 0,
        '500': 1,
        '200': 0,
        '100': 0,
        '50': 1,
        '20': 1,
        '10': 0,
        '5': 0,
        '2': 0,
        '1': 0,
        '0.5': 0,
      },
      efectivoContado: '570.00',
      diferencia: '-5.00',
      fondoDejado: '300.00',
      efectivoRetirado: '270.00',
      notas: 'Faltaron 5 pesos',
    });
    await http()
      .get(`${base}/${closure.id}`)
      .set('Authorization', tokens.admin)
      .expect(200, closure);

    // Everything was counted once: nothing is pending and the float carries over.
    expect(await summary()).toMatchObject({
      corteAnteriorId: closure.id,
      fondoInicial: '300.00',
      sales: { count: 0, total: '0.00' },
      refunds: { total: '0.00' },
      expenses: { count: 0 },
      efectivoEsperado: '300.00',
    });
  });

  it('counts a refund of an earlier closure and new sales only in the next one', async () => {
    const earlier = await sell(2, 'CASH');
    const first = await baseline(0);
    expect(first.sales.cash).toBe('100.00');
    await cancel(earlier.id);
    await sell(1, 'CASH');
    const next = await summary();
    expect(next).toMatchObject({
      sales: { count: 1, cash: '50.00' },
      refunds: { cash: '100.00' },
      efectivoEsperado: '-50.00',
    });
    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: earlier.id },
    });
    expect(sale).toMatchObject({
      estado: 'CANCELLED',
      corteCajaId: first.id,
    });
  });

  it('counts a sale committed while the closure is running exactly once', async () => {
    const { corteAnteriorId } = await summary();
    const transaction = prisma.$transaction.bind(prisma);
    let injected = false;
    const spy = vi.spyOn(prisma, '$transaction').mockImplementation((async (
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: object,
    ) =>
      transaction(async (tx) => {
        const create = tx.cashClosure.create.bind(tx.cashClosure);
        vi.spyOn(tx.cashClosure, 'create').mockImplementation((async (
          args: Parameters<typeof create>[0],
        ) => {
          // After the closure read what is pending, another connection
          // commits a new cash sale.
          if (!injected) {
            injected = true;
            await sell(1, 'CASH');
          }
          return create(args);
        }) as never);
        return operation(tx);
      }, options)) as typeof prisma.$transaction);
    let closure: CashClosureResponse;
    try {
      closure = (
        await close({ previousClosureId: corteAnteriorId, denominations: {}, floatLeft: 0 })
      ).body as CashClosureResponse;
    } finally {
      spy.mockRestore();
    }
    expect(injected).toBe(true);
    const next = await summary();
    // Either the closure retried and included it, or it stays pending: never lost or doubled.
    expect(Number(closure.sales.cash) + Number(next.sales.cash)).toBe(50);
    expect(closure.sales.count + next.sales.count).toBe(1);
  });

  it('returns 409 for a stale summary and accepts only one of two concurrent closures', async () => {
    const { corteAnteriorId } = await summary();
    const body = { previousClosureId: corteAnteriorId, denominations: {}, floatLeft: 0 };
    const responses = await Promise.all([close(body), close(body)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const conflict = responses.find(({ status }) => status === 409)!;
    expect(conflict.body.message).toBe(
      'Ya se registró otro corte; consulte de nuevo el resumen',
    );
    await close(body).expect(409);
    await close({ ...body, previousClosureId: null }).expect(409);
    await close({ ...body, previousClosureId: randomUUID() }).expect(409);
  });

  it('links expenses to the closure, filters them and blocks deleting counted ones', async () => {
    const counted = await expense(15, true);
    const closure = await baseline(0);
    const pending = await expense(5, false);

    const list = async (query: Record<string, string>) =>
      (
        await http()
          .get('/api/gastos')
          .query(query)
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as { datos: Array<{ id: string; corteCajaId: string | null }> };
    const inClosure = await list({ corteCajaId: closure.id });
    expect(inClosure.datos.map(({ id }) => id)).toEqual([counted.id]);
    expect(inClosure.datos[0]!.corteCajaId).toBe(closure.id);
    const open = await list({
      cortePendiente: 'true',
      createdById: users.seller,
    });
    expect(open.datos.map(({ id }) => id)).toEqual([pending.id]);

    const blocked = await http()
      .delete(`/api/gastos/${counted.id}`)
      .set('Authorization', tokens.admin)
      .expect(409);
    expect(blocked.body.message).toBe(
      'El gasto ya está incluido en un corte de caja y no puede eliminarse',
    );
    await http()
      .delete(`/api/gastos/${pending.id}`)
      .set('Authorization', tokens.admin)
      .expect(204);
  });

  it('validates the cashier input without writing', async () => {
    const { corteAnteriorId } = await summary();
    const valid = {
      previousClosureId: corteAnteriorId,
      denominations: { '100': 1 },
      floatLeft: 0,
    };
    const before = await prisma.cashClosure.count();
    for (const body of [
      { denominations: {}, floatLeft: 0 },
      { ...valid, previousClosureId: 'x' },
      { ...valid, denominations: { '3': 1 } },
      { ...valid, denominations: { '100': -1 } },
      { ...valid, denominations: { '100': 1.5 } },
      { ...valid, denominations: [] },
      { ...valid, denominations: undefined },
      { ...valid, floatLeft: 100.01 },
      { ...valid, floatLeft: -1 },
      { ...valid, floatLeft: undefined },
      {
        ...valid,
        adjustments: [{ type: 'GIFT', amount: 1, description: 'x' }],
      },
      {
        ...valid,
        adjustments: [{ type: 'INCOME', amount: 0, description: 'x' }],
      },
      {
        ...valid,
        adjustments: [{ type: 'INCOME', amount: 1, description: ' ' }],
      },
      {
        ...valid,
        adjustments: Array.from({ length: 51 }, () => ({
          type: 'INCOME',
          amount: 1,
          description: 'x',
        })),
      },
      { ...valid, notes: 'x'.repeat(501) },
      { ...valid, expectedCash: 100 },
    ]) {
      await close(body).expect(400);
    }
    expect(await prisma.cashClosure.count()).toBe(before);
  });

  it('lists newest first with pagination and date filters', async () => {
    const first = await baseline(0);
    const second = await baseline(0);
    const page = (
      await http()
        .get(base)
        .query({ startDate: first.fechaCierre, pageSize: 1 })
        .set('Authorization', tokens.seller)
        .expect(200)
    ).body as CashClosurePageResponse;
    expect(page).toMatchObject({ total: 2, pagina: 1, limite: 1 });
    expect(page.datos.map(({ id }) => id)).toEqual([second.id]);
    const only = (
      await http()
        .get(base)
        .query({ startDate: first.fechaCierre, endDate: first.fechaCierre })
        .set('Authorization', tokens.seller)
        .expect(200)
    ).body as CashClosurePageResponse;
    expect(only.datos.map(({ id }) => id)).toEqual([first.id]);
    for (const query of [
      { startDate: second.fechaCierre, endDate: first.fechaCierre },
      { page: 0 },
      { pageSize: 101 },
      { unknown: 1 },
    ]) {
      await http()
        .get(base)
        .query(query)
        .set('Authorization', tokens.seller)
        .expect(400);
    }
    await http()
      .get(`${base}/${randomUUID()}`)
      .set('Authorization', tokens.seller)
      .expect(404);
    await http()
      .get(`${base}/not-a-uuid`)
      .set('Authorization', tokens.seller)
      .expect(400);
  });

  it('requires authentication and a role, and protects users with closures', async () => {
    await http().get(`${base}/resumen-actual`).expect(401);
    await http().post(base).send({}).expect(401);
    await http()
      .get(`${base}/resumen-actual`)
      .set('Authorization', tokens.noRole)
      .expect(403);
    await close(
      { previousClosureId: null, denominations: {}, floatLeft: 0 },
      tokens.noRole,
    ).expect(403);
    await http()
      .delete(`/api/usuarios/${users.seller}`)
      .set('Authorization', tokens.admin)
      .expect(409);
  });
});
