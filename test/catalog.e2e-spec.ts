import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type { CategoryDto } from '../src/catalog/dto/category.dto.js';

const base = '/api/catalog/categories';

describe('Catalog HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const jwt = new JwtService();
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const tokens: Record<string, string> = {};
  const http = () => request(app!.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const [key, role, isActive] of [
      ['admin', 'ADMIN', true],
      ['seller', 'VENDEDOR', true],
      ['inactive', 'ADMIN', false],
      ['noRole', null, true],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          name: 'Catalog test',
          email: `${randomUUID()}@catalog.test`,
          passwordHash: 'unused-test-hash',
          isActive,
          ...(role
            ? { roles: { create: { role: { connect: { name: role } } } } }
            : {}),
        },
      });
      userIds.push(user.id);
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: role ? [role] : [] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
  });

  afterEach(async () => {
    if (!prisma || categoryIds.length === 0) return;
    await prisma.product.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    categoryIds.length = 0;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.userRole.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function create(
    body: object = { name: 'Anillos' },
  ): Promise<CategoryDto> {
    const response = await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send(body)
      .expect(201);
    const category = response.body as CategoryDto;
    categoryIds.push(category.id);
    return category;
  }

  it('creates normalized public fields and persists defaults', async () => {
    const category = await create({
      name: '  Ánillos & colección!  ',
      description: '  ',
    });
    expect(category).toEqual({
      id: expect.any(String),
      name: 'Ánillos & colección!',
      slug: 'anillos-coleccion',
      description: null,
      isActive: true,
    });
    expect(
      await prisma.category.findUnique({ where: { id: category.id } }),
    ).toMatchObject(category);
  });

  it('returns 409 for duplicate slugs including concurrent inserts', async () => {
    await create({ name: 'Oro', slug: 'joyas' });
    await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send({ name: 'Plata', slug: 'joyas' })
      .expect(409);
    const slug = `race-${randomUUID()}`;
    const responses = await Promise.all(
      [1, 2].map(() =>
        http()
          .post(base)
          .set('Authorization', tokens.admin!)
          .send({ name: 'Carrera', slug }),
      ),
    );
    for (const response of responses)
      if (response.status === 201)
        categoryIds.push((response.body as CategoryDto).id);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await prisma.category.count({ where: { slug } })).toBe(1);
  });

  it('lists active categories in order and includes inactive only on request', async () => {
    const z = await create({ name: 'Zafiros' });
    const a = await create({ name: 'Anillos' });
    const inactive = await create({ name: 'Inactiva' });
    await http()
      .patch(`${base}/${inactive.id}`)
      .set('Authorization', tokens.admin!)
      .send({ isActive: false })
      .expect(200);
    for (const query of [
      '',
      '?includeInactive=false',
      '?includeInactive=true',
    ]) {
      const response = await http()
        .get(base + query)
        .set('Authorization', tokens.seller!)
        .expect(200);
      const items = (response.body as CategoryDto[]).filter(({ id }) =>
        categoryIds.includes(id),
      );
      expect(items.map(({ id }) => id)).toEqual(
        query.endsWith('true') ? [a.id, inactive.id, z.id] : [a.id, z.id],
      );
    }
    const detail = await http()
      .get(`${base}/${inactive.id}`)
      .set('Authorization', tokens.seller!)
      .expect(200);
    expect(detail.body).toEqual({ ...inactive, isActive: false });
  });

  it('renames with generated slug, honors explicit slug and clears description', async () => {
    const category = await create({ name: 'Anillos', description: ' Oro ' });
    expect(category.description).toBe('Oro');
    const target = `${base}/${category.id}`;
    let response = await http()
      .patch(target)
      .set('Authorization', tokens.admin!)
      .send({ name: ' Anillos de boda ' })
      .expect(200);
    expect(response.body).toEqual({
      ...category,
      name: 'Anillos de boda',
      slug: 'anillos-de-boda',
    });
    response = await http()
      .patch(target)
      .set('Authorization', tokens.admin!)
      .send({ name: 'Oro', slug: 'joyas', isActive: false })
      .expect(200);
    expect(response.body).toMatchObject({
      name: 'Oro',
      slug: 'joyas',
      isActive: false,
    });
    for (const description of ['', '   ', null]) {
      response = await http()
        .patch(target)
        .set('Authorization', tokens.admin!)
        .send({ description })
        .expect(200);
      expect(response.body).toMatchObject({
        description: null,
        slug: 'joyas',
        name: 'Oro',
      });
    }
  });

  it('keeps the category unchanged after a duplicate slug update', async () => {
    await create({ name: 'Oro' });
    const category = await create({ name: 'Plata' });
    for (const body of [{ slug: 'oro' }, { name: 'Oro' }]) {
      await http()
        .patch(`${base}/${category.id}`)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(409);
    }
    const response = await http()
      .get(`${base}/${category.id}`)
      .set('Authorization', tokens.admin!)
      .expect(200);
    expect(response.body).toEqual(category);
  });

  it('rejects invalid creates and unknown fields', async () => {
    for (const body of [
      {},
      { name: '' },
      { name: '  ' },
      { name: null },
      { name: 1 },
      { name: 'a'.repeat(101) },
      { name: '!!!' },
      { name: 'Oro', slug: '' },
      { name: 'Oro', slug: null },
      { name: 'Oro', slug: 'Oro rojo' },
      { name: 'Oro', slug: '-oro' },
      { name: 'Oro', description: 'a'.repeat(501) },
      { name: 'Oro', description: 1 },
      { name: 'Oro', isActive: false },
      { name: 'Oro', unknown: true },
    ])
      await http()
        .post(base)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(400);
  });

  it('rejects empty and invalid updates without mutating persisted data', async () => {
    const category = await create();
    for (const body of [
      {},
      { unknown: true },
      { name: null },
      { name: ' ' },
      { name: '!!!' },
      { name: 'a'.repeat(101) },
      { slug: null },
      { slug: '' },
      { slug: 'a--b' },
      { isActive: null },
      { isActive: 'false' },
      { description: 3 },
      { description: 'a'.repeat(501) },
    ])
      await http()
        .patch(`${base}/${category.id}`)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(400);
    const response = await http()
      .get(`${base}/${category.id}`)
      .set('Authorization', tokens.admin!)
      .expect(200);
    expect(response.body).toEqual(category);
  });

  it('validates query strings and UUIDs, and reports nonexistent categories', async () => {
    for (const query of [
      'includeInactive=1',
      'includeInactive=TRUE',
      'includeInactive=',
      'includeInactive=true&includeInactive=false',
      'unknown=true',
    ]) {
      await http()
        .get(`${base}?${query}`)
        .set('Authorization', tokens.admin!)
        .expect(400);
    }
    for (const method of ['get', 'patch', 'delete'] as const) {
      for (const [id, status] of [
        ['invalid', 400],
        [randomUUID(), 404],
      ] as const) {
        const operation = http()
          [method](`${base}/${id}`)
          .set('Authorization', tokens.admin!);
        if (method === 'patch') operation.send({ name: 'Oro' });
        await operation.expect(status);
      }
    }
  });

  it('blocks deletion of categories with products and deletes without a body otherwise', async () => {
    const category = await create();
    const product = await prisma.product.create({
      data: {
        name: 'Anillo',
        sku: randomUUID(),
        price: '100.00',
        categoryId: category.id,
      },
    });
    const target = `${base}/${category.id}`;
    await http().delete(target).set('Authorization', tokens.admin!).expect(409);
    expect(
      await prisma.category.findUnique({ where: { id: category.id } }),
    ).not.toBeNull();
    await prisma.product.delete({ where: { id: product.id } });
    const response = await http()
      .delete(target)
      .set('Authorization', tokens.admin!)
      .expect(204);
    expect(response.text).toBe('');
    await http().delete(target).set('Authorization', tokens.admin!).expect(404);
  });

  it('requires active authenticated users and enforces roles on all endpoints', async () => {
    const category = await create();
    const endpoints = [
      ['get', base],
      ['get', `${base}/${category.id}`],
      ['post', base],
      ['patch', `${base}/${category.id}`],
      ['delete', `${base}/${category.id}`],
    ] as const;
    for (const [method, path] of endpoints) {
      for (const auth of [undefined, 'Bearer invalid', tokens.inactive]) {
        const operation = http()[method](path);
        if (auth) operation.set('Authorization', auth);
        await operation.expect(401);
      }
      await http()
        [method](path)
        .set('Authorization', tokens.noRole!)
        .expect(403);
      if (method === 'get') {
        await http()
          [method](path)
          .set('Authorization', tokens.seller!)
          .expect(200);
      } else {
        await http()
          [method](path)
          .set('Authorization', tokens.seller!)
          .send({ name: 'Denied' })
          .expect(403);
      }
    }
  });

  it('documents all responses, bearer auth, DTOs and filtering in Swagger', async () => {
    const response = await http().get('/api/docs-json').expect(200);
    for (const [path, method, statuses] of [
      [base, 'post', ['201', '400', '401', '403', '409']],
      [base, 'get', ['200', '400', '401', '403']],
      [`${base}/{id}`, 'get', ['200', '400', '401', '403', '404']],
      [`${base}/{id}`, 'patch', ['200', '400', '401', '403', '404', '409']],
      [`${base}/{id}`, 'delete', ['204', '400', '401', '403', '404', '409']],
    ] as const) {
      const operation = response.body.paths[path][method];
      for (const status of statuses)
        expect(operation.responses[status]).toBeDefined();
      expect(operation.security).toEqual([{ bearer: [] }]);
    }
    expect(response.body.paths[base].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'includeInactive', in: 'query' }),
      ]),
    );
    expect(
      Object.keys(
        response.body.components.schemas.CategoryDto.properties,
      ).sort(),
    ).toEqual(['description', 'id', 'isActive', 'name', 'slug']);
    expect(response.body.components.schemas.CreateCategoryDto.required).toEqual(
      ['name'],
    );
    expect(
      response.body.components.schemas.UpdateCategoryDto.required ?? [],
    ).toEqual([]);
  });
});
