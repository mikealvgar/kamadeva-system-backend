import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
interface ExpenseCategoryResponse {
  id: string;
  nombre: string;
  activo: boolean;
}

interface ExpenseResponse {
  id: string;
  concepto: string;
  monto: string;
  descontarDeCaja: boolean;
  fechaGasto: string;
  categoria: { id: string; nombre: string };
  creadoPor: { id: string; nombre: string };
  notas: string | null;
  corteCajaId: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
}

interface ExpensePageResponse {
  datos: ExpenseResponse[];
  total: number;
  pagina: number;
  limite: number;
  montoTotal: string;
}

const categoriesBase = '/api/categorias-gastos';
const base = '/api/gastos';

describe('Expenses HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const users: Record<'admin' | 'seller' | 'noRole', string> = {} as never;
  const tokens: Record<'admin' | 'seller' | 'noRole', string> = {} as never;
  const categories: string[] = [];
  const http = () => request(app!.getHttpServer());
  // Category names are global; keep them unique per test.
  const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

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
          nombre: `Expenses ${key}`,
          email: `${randomUUID()}@expenses.test`,
          passwordHash: 'unused-test-hash',
          ...(role ? { rol: { connect: { nombre: role } } } : {}),
        },
      });
      users[key] = user.id;
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: role ? [role] : [] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
  });

  afterEach(async () => {
    if (!prisma) return;
    await prisma.expense.deleteMany({
      where: { creadoPorId: { in: Object.values(users) } },
    });
    await prisma.expenseCategory.deleteMany({
      where: { id: { in: categories } },
    });
    categories.length = 0;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const ids = Object.values(users);
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function createCategory(
    name = unique('Cat'),
  ): Promise<ExpenseCategoryResponse> {
    const response = await http()
      .post(categoriesBase)
      .set('Authorization', tokens.admin)
      .send({ name })
      .expect(201);
    categories.push((response.body as ExpenseCategoryResponse).id);
    return response.body as ExpenseCategoryResponse;
  }

  async function createExpense(
    body: object,
    token: string = tokens.seller,
  ): Promise<ExpenseResponse> {
    return (
      await http().post(base).set('Authorization', token).send(body).expect(201)
    ).body as ExpenseResponse;
  }

  describe('categories', () => {
    it('ships starter categories', async () => {
      const response = await http()
        .get(categoriesBase)
        .set('Authorization', tokens.seller)
        .expect(200);
      expect(
        (response.body as ExpenseCategoryResponse[]).map(({ nombre }) => nombre),
      ).toEqual(expect.arrayContaining(['Mantenimiento', 'Otros', 'Servicios']));
    });

    it('creates trimmed names and rejects case-insensitive duplicates, including concurrently', async () => {
      const name = unique('Renta');
      const created = await createCategory(` ${name} `);
      expect(created).toEqual({ id: expect.any(String), nombre: name, activo: true });
      await http()
        .post(categoriesBase)
        .set('Authorization', tokens.admin)
        .send({ name: name.toUpperCase() })
        .expect(409);

      const racing = unique('Luz');
      const responses = await Promise.all(
        [racing, racing.toLowerCase()].map((value) =>
          http()
            .post(categoriesBase)
            .set('Authorization', tokens.admin)
            .send({ name: value }),
        ),
      );
      for (const response of responses)
        if (response.status === 201)
          categories.push((response.body as ExpenseCategoryResponse).id);
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    });

    it('validates bodies', async () => {
      for (const body of [
        {},
        { name: ' ' },
        { name: 'x'.repeat(101) },
        { name: 1 },
        { name: 'A', isActive: false },
      ]) {
        await http()
          .post(categoriesBase)
          .set('Authorization', tokens.admin)
          .send(body)
          .expect(400);
      }
    });

    it('updates, lists inactive on request and protects used categories', async () => {
      const category = await createCategory();
      const other = await createCategory();
      const target = `${categoriesBase}/${category.id}`;
      await http()
        .patch(target)
        .set('Authorization', tokens.admin)
        .send({ name: other.nombre.toLowerCase() })
        .expect(409);
      await http()
        .patch(target)
        .set('Authorization', tokens.admin)
        .send({})
        .expect(400);
      await http()
        .patch(target)
        .set('Authorization', tokens.admin)
        .send({ isActive: false })
        .expect(200, { ...category, activo: false });
      const active = (
        await http()
          .get(categoriesBase)
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as ExpenseCategoryResponse[];
      expect(active.map(({ id }) => id)).not.toContain(category.id);
      const all = (
        await http()
          .get(`${categoriesBase}?includeInactive=true`)
          .set('Authorization', tokens.seller)
          .expect(200)
      ).body as ExpenseCategoryResponse[];
      expect(all.map(({ id }) => id)).toContain(category.id);

      await createExpense({
        concept: 'Pago',
        amount: 10,
        categoryId: other.id,
      });
      await http()
        .delete(`${categoriesBase}/${other.id}`)
        .set('Authorization', tokens.admin)
        .expect(409);
      await http()
        .delete(target)
        .set('Authorization', tokens.admin)
        .expect(204);
      await http().get(target).set('Authorization', tokens.admin).expect(404);
    });

    it('lets only ADMIN write categories', async () => {
      const category = await createCategory();
      await http().get(categoriesBase).expect(401);
      await http()
        .post(categoriesBase)
        .set('Authorization', tokens.seller)
        .send({ name: unique('X') })
        .expect(403);
      await http()
        .patch(`${categoriesBase}/${category.id}`)
        .set('Authorization', tokens.seller)
        .send({ isActive: false })
        .expect(403);
      await http()
        .delete(`${categoriesBase}/${category.id}`)
        .set('Authorization', tokens.seller)
        .expect(403);
      await http()
        .get(categoriesBase)
        .set('Authorization', tokens.noRole)
        .expect(403);
    });
  });

  describe('expenses', () => {
    it('records the authenticated author with exact money and defaults', async () => {
      const category = await createCategory();
      const expense = await createExpense({
        concept: ' Artículos de limpieza ',
        amount: 355.5,
        categoryId: category.id,
        notes: ' Factura 12 ',
      });
      expect(expense).toEqual({
        id: expect.any(String),
        concepto: 'Artículos de limpieza',
        monto: '355.50',
        descontarDeCaja: false,
        fechaGasto: expect.any(String),
        categoria: { id: category.id, nombre: category.nombre },
        creadoPor: { id: users.seller, nombre: 'Expenses seller' },
        notas: 'Factura 12',
        corteCajaId: null,
        fechaCreacion: expect.any(String),
        fechaActualizacion: expect.any(String),
      });
      expect(Date.now() - Date.parse(expense.fechaGasto)).toBeLessThan(60_000);
      await http()
        .get(`${base}/${expense.id}`)
        .set('Authorization', tokens.admin)
        .expect(200, expense);
    });

    it('rejects invalid input without writing', async () => {
      const category = await createCategory();
      const inactive = await createCategory();
      await http()
        .patch(`${categoriesBase}/${inactive.id}`)
        .set('Authorization', tokens.admin)
        .send({ isActive: false })
        .expect(200);
      const valid = { concept: 'Pago', amount: 1, categoryId: category.id };
      for (const body of [
        {},
        { ...valid, concept: ' ' },
        { ...valid, concept: 'x'.repeat(256) },
        { ...valid, amount: 0 },
        { ...valid, amount: -1 },
        { ...valid, amount: 1.001 },
        { ...valid, amount: 10000000000 },
        { ...valid, amount: '1' },
        { ...valid, categoryId: 'x' },
        { ...valid, categoryId: randomUUID() },
        { ...valid, categoryId: inactive.id },
        { ...valid, deductFromCash: 'true' },
        { ...valid, spentAt: 'ayer' },
        { ...valid, spentAt: new Date(Date.now() + 3_600_000).toISOString() },
        { ...valid, notes: 'x'.repeat(501) },
        { ...valid, createdById: users.admin },
      ]) {
        await http()
          .post(base)
          .set('Authorization', tokens.seller)
          .send(body)
          .expect(400);
      }
      expect(
        await prisma.expense.count({
          where: { creadoPorId: { in: Object.values(users) } },
        }),
      ).toBe(0);
    });

    it('filters, paginates and sums across the whole filter', async () => {
      const supplies = await createCategory();
      const services = await createCategory();
      const at = (day: number) =>
        new Date(Date.UTC(2026, 9, day, 15)).toISOString();
      const first = await createExpense({
        concept: 'Bolsas',
        amount: 100.1,
        categoryId: supplies.id,
        deductFromCash: true,
        spentAt: at(1),
      });
      const second = await createExpense(
        {
          concept: 'Internet',
          amount: 499.9,
          categoryId: services.id,
          spentAt: at(2),
        },
        tokens.admin,
      );
      const third = await createExpense({
        concept: 'Escobas',
        amount: 50,
        categoryId: supplies.id,
        deductFromCash: true,
        spentAt: at(3),
      });
      const list = async (query: Record<string, string | number>) =>
        (
          await http()
            .get(base)
            .query({
              startDate: at(1),
              endDate: at(3),
              ...query,
            })
            .set('Authorization', tokens.seller)
            .expect(200)
        ).body as ExpensePageResponse;
      const ids = (page: ExpensePageResponse) => page.datos.map(({ id }) => id);

      const all = await list({});
      expect(ids(all)).toEqual([third.id, second.id, first.id]);
      expect(all).toMatchObject({
        total: 3,
        pagina: 1,
        limite: 20,
        montoTotal: '650.00',
      });
      const page = await list({ page: 2, pageSize: 1 });
      expect(ids(page)).toEqual([second.id]);
      expect(page).toMatchObject({ total: 3, montoTotal: '650.00' });

      const cash = await list({ deductFromCash: 'true' });
      expect(ids(cash)).toEqual([third.id, first.id]);
      expect(cash.montoTotal).toBe('150.10');
      expect(ids(await list({ deductFromCash: 'false' }))).toEqual([second.id]);
      expect(ids(await list({ categoryId: services.id }))).toEqual([second.id]);
      expect(ids(await list({ createdById: users.admin }))).toEqual([
        second.id,
      ]);
      expect(ids(await list({ startDate: at(2), endDate: at(2) }))).toEqual([
        second.id,
      ]);

      for (const query of [
        { startDate: at(3), endDate: at(1) },
        { startDate: 'ayer' },
        { page: 0 },
        { pageSize: 101 },
        { deductFromCash: 'yes' },
        { categoryId: 'x' },
        { unknown: 1 },
      ]) {
        await http()
          .get(base)
          .query(query)
          .set('Authorization', tokens.seller)
          .expect(400);
      }
    });

    it('lets only ADMIN delete', async () => {
      const category = await createCategory();
      const expense = await createExpense({
        concept: 'Pago',
        amount: 1,
        categoryId: category.id,
      });
      const target = `${base}/${expense.id}`;
      await http()
        .delete(target)
        .set('Authorization', tokens.seller)
        .expect(403);
      await http()
        .delete(target)
        .set('Authorization', tokens.admin)
        .expect(204);
      await http()
        .delete(target)
        .set('Authorization', tokens.admin)
        .expect(404);
      await http().get(target).set('Authorization', tokens.admin).expect(404);
      await http()
        .get(`${base}/not-a-uuid`)
        .set('Authorization', tokens.admin)
        .expect(400);
    });

    it('requires authentication and a role', async () => {
      await http().get(base).expect(401);
      await http().post(base).send({}).expect(401);
      await http().get(base).set('Authorization', tokens.noRole).expect(403);
      await http()
        .post(base)
        .set('Authorization', tokens.noRole)
        .send({})
        .expect(403);
    });

    it('prevents deleting a user who recorded expenses', async () => {
      const category = await createCategory();
      await createExpense({
        concept: 'Pago',
        amount: 1,
        categoryId: category.id,
      });
      const response = await http()
        .delete(`/api/usuarios/${users.seller}`)
        .set('Authorization', tokens.admin)
        .expect(409);
      expect(response.body.message).toBe(
        'El usuario tiene registros asociados y no puede eliminarse',
      );
    });
  });
});
