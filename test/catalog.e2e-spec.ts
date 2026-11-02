import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

interface CategoryResponse {
  id: string;
  descripcion: string;
  activo: boolean;
  fechaCreacion?: string;
  fechaActualizacion?: string;
}

const base = '/api/catalogo/categorias';

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
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    for (const [key, role, activo] of [
      ['admin', 'ADMIN', true],
      ['seller', 'VENDEDOR', true],
      ['inactive', 'ADMIN', false],
      ['noRole', null, true],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          nombre: `Catalog test ${key}`,
          email: `${randomUUID()}@catalog.test`,
          passwordHash: 'unused-test-hash',
          activo,
          ...(role ? { rol: { connect: { nombre: role } } } : {}),
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
      where: { categoriaId: { in: categoryIds } },
    });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    categoryIds.length = 0;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  async function create(
    body: object = { descripcion: `Cat-${randomUUID().slice(0, 8)}` },
  ): Promise<CategoryResponse> {
    const response = await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send(body)
      .expect(201);
    const category = response.body as CategoryResponse;
    categoryIds.push(category.id);
    return category;
  }

  it('creates normalized public fields and persists defaults', async () => {
    const category = await create({
      name: '  Ánillos & colección!  ',
    });
    expect(category).toMatchObject({
      id: expect.any(String),
      descripcion: 'ÁNILLOS & COLECCIÓN!',
      activo: true,
    });
    expect(
      await prisma.category.findUnique({ where: { id: category.id } }),
    ).toMatchObject({
      id: category.id,
      descripcion: category.descripcion,
      activo: category.activo,
    });
  });

  it('returns 409 for duplicate descriptions including concurrent inserts', async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    await create({ descripcion: `JOYAS-${tag}` });
    await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send({ descripcion: `joyas-${tag.toLowerCase()}` })
      .expect(409);
    const raceTag = `RACE-${randomUUID().slice(0, 8)}`.toUpperCase();
    const responses = await Promise.all(
      [1, 2].map(() =>
        http()
          .post(base)
          .set('Authorization', tokens.admin!)
          .send({ descripcion: raceTag }),
      ),
    );
    for (const response of responses)
      if (response.status === 201)
        categoryIds.push((response.body as CategoryResponse).id);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await prisma.category.count({ where: { descripcion: raceTag } })).toBe(1);
  });

  it('lists active categories in order and includes inactive only on request', async () => {
    const tag = randomUUID().slice(0, 6).toUpperCase();
    const z = await create({ descripcion: `ZAFIR-${tag}` });
    const a = await create({ descripcion: `ANIL-${tag}` });
    const inactive = await create({ descripcion: `INACT-${tag}` });
    await http()
      .patch(`${base}/${inactive.id}`)
      .set('Authorization', tokens.admin!)
      .send({ activo: false })
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
      const items = (response.body as CategoryResponse[]).filter(({ id }) =>
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
    expect(detail.body).toMatchObject({ id: inactive.id, activo: false });
  });

  it('updates description and toggles active status', async () => {
    const category = await create({ descripcion: `CAT-${randomUUID().slice(0, 8)}` });
    const other = await create({ descripcion: `OTHER-${randomUUID().slice(0, 8)}` });
    const target = `${base}/${category.id}`;
    const newDesc = `NUEVA-${randomUUID().slice(0, 8)}`.toUpperCase();
    let response = await http()
      .patch(target)
      .set('Authorization', tokens.admin!)
      .send({ descripcion: newDesc.toLowerCase() })
      .expect(200);
    expect(response.body).toMatchObject({
      id: category.id,
      descripcion: newDesc,
    });
    response = await http()
      .patch(target)
      .set('Authorization', tokens.admin!)
      .send({ activo: false })
      .expect(200);
    expect(response.body).toMatchObject({
      activo: false,
    });
    await http()
      .patch(target)
      .set('Authorization', tokens.admin!)
      .send({ descripcion: other.descripcion })
      .expect(409);
  });

  it('rejects invalid creates and unknown fields', async () => {
    for (const body of [
      {},
      { descripcion: '' },
      { descripcion: '  ' },
      { descripcion: null },
      { descripcion: 1 },
      { descripcion: 'a'.repeat(101) },
      { descripcion: 'Oro', unknown: true },
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
      { descripcion: null },
      { descripcion: ' ' },
      { descripcion: 'a'.repeat(101) },
      { activo: null },
      { activo: 'false' },
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
    expect(response.body).toMatchObject({ id: category.id, descripcion: category.descripcion });
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
        if (method === 'patch') operation.send({ descripcion: 'ORO' });
        await operation.expect(status);
      }
    }
  });

  it('blocks deletion of categories with products and deletes without a body otherwise', async () => {
    const category = await create();
    const product = await prisma.product.create({
      data: {
        nombre: 'Anillo',
        codigoBarras: `BAR-${randomUUID().slice(0, 10)}`,
        precioVenta: '100.00',
        categoriaId: category.id,
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
          .send({ descripcion: 'DENIED' })
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
        expect.objectContaining({ name: 'incluirInactivos', in: 'query' }),
      ]),
    );
    expect(
      Object.keys(
        response.body.components.schemas.CategoryDto.properties,
      ).sort(),
    ).toEqual(['activo', 'descripcion', 'fechaActualizacion', 'fechaCreacion', 'id', 'nombre']);
  });
});
