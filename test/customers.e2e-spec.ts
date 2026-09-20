import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type { CustomerDto } from '../src/customers/dto/customer.dto.js';
import {
  CustomersService,
  DEFAULT_CUSTOMER_NAME,
} from '../src/customers/customers.service.js';

const base = '/api/customers';

describe('Customers HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const jwt = new JwtService();
  const userIds: string[] = [];
  const customerIds: string[] = [];
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
    for (const [key, role, isActive] of [
      ['admin', 'ADMIN', true],
      ['seller', 'VENDEDOR', true],
      ['inactive', 'ADMIN', false],
      ['noRole', null, true],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          name: 'Customers test',
          email: `${randomUUID()}@customers.test`,
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
    if (!prisma || customerIds.length === 0) return;
    await prisma.quote.deleteMany({
      where: { customerId: { in: customerIds } },
    });
    await prisma.sale.deleteMany({
      where: { customerId: { in: customerIds } },
    });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    customerIds.length = 0;
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
    body: object = { name: 'Ana Pérez' },
  ): Promise<CustomerDto> {
    const response = await http()
      .post(base)
      .set('Authorization', tokens.admin!)
      .send(body)
      .expect(201);
    const customer = response.body as CustomerDto;
    customerIds.push(customer.id);
    return customer;
  }

  it('creates normalized public contact fields and persists defaults', async () => {
    const customer = await create({
      name: ' Ana Pérez ',
      phone: ' 555-1234 ',
      email: ' ANA@MAIL.COM ',
    });
    expect(customer).toEqual({
      id: expect.any(String),
      name: 'Ana Pérez',
      phone: '555-1234',
      email: 'ana@mail.com',
      isActive: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(new Date(customer.createdAt).toISOString()).toBe(customer.createdAt);
    expect(
      await prisma.customer.findUnique({ where: { id: customer.id } }),
    ).toMatchObject({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      isDefault: false,
    });
  });

  it.each([undefined, '', '   ', null])(
    'normalizes empty contacts %s to null',
    async (value) => {
      expect(
        await create({ name: 'Ana', phone: value, email: value }),
      ).toMatchObject({ phone: null, email: null });
    },
  );

  it('allows repeated emails and names', async () => {
    const first = await create({ name: 'Ana', email: ' SAME@MAIL.COM ' });
    const second = await create({ name: 'Ana', email: 'same@mail.com' });
    expect(second.email).toBe(first.email);
    expect(second.id).not.toBe(first.id);
  });

  it('accepts maximum lengths after trimming', async () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    expect(email.length).toBe(254);
    expect(
      await create({
        name: ` ${'a'.repeat(200)} `,
        phone: ' 1234567890 ',
        email: ` ${email} `,
      }),
    ).toMatchObject({ name: 'a'.repeat(200), phone: '1234567890', email });
  });

  it('lists by name and excludes inactive customers unless explicitly requested', async () => {
    const z = await create({ name: 'Zoe' });
    const a = await create({ name: 'Ana' });
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
      const items = (response.body as CustomerDto[]).filter(({ id }) =>
        customerIds.includes(id),
      );
      expect(items.map(({ id }) => id)).toEqual(
        query.endsWith('true') ? [a.id, inactive.id, z.id] : [a.id, z.id],
      );
    }
    const detail = await http()
      .get(`${base}/${inactive.id}`)
      .set('Authorization', tokens.seller!)
      .expect(200);
    expect(detail.body).toMatchObject({
      ...inactive,
      isActive: false,
      updatedAt: expect.any(String),
    });
  });

  it('searches name, email and phone case insensitively and combines active filtering', async () => {
    const customer = await create({
      name: 'Unique Contact',
      email: 'match@customer-search.test',
      phone: 'AbC1234567',
    });
    for (const search of [
      'unique CONTACT',
      'MATCH@CUSTOMER-SEARCH.TEST',
      'abc1234567',
    ]) {
      const response = await http()
        .get(base)
        .query({ search: ` ${search} ` })
        .set('Authorization', tokens.seller!)
        .expect(200);
      expect((response.body as CustomerDto[]).map(({ id }) => id)).toEqual([
        customer.id,
      ]);
    }
    await http()
      .patch(`${base}/${customer.id}`)
      .set('Authorization', tokens.admin!)
      .send({ isActive: false })
      .expect(200);
    const absent = await http()
      .get(base)
      .query({ search: 'unique CONTACT' })
      .set('Authorization', tokens.admin!)
      .expect(200);
    expect(absent.body).toEqual([]);
    const included = await http()
      .get(base)
      .query({ search: 'unique CONTACT', includeInactive: 'true' })
      .set('Authorization', tokens.admin!)
      .expect(200);
    expect(included.body).toHaveLength(1);
    const empty = await http()
      .get(base)
      .query({ search: randomUUID() })
      .set('Authorization', tokens.admin!)
      .expect(200);
    expect(empty.body).toEqual([]);
  });

  it('updates specified fields, preserves creation time and clears optional contacts', async () => {
    const customer = await create({
      name: 'Ana',
      phone: '123',
      email: 'old@mail.com',
    });
    let response = await http()
      .patch(`${base}/${customer.id}`)
      .set('Authorization', tokens.admin!)
      .send({
        name: ' Nuevo nombre ',
        email: ' NEW@MAIL.COM ',
        isActive: false,
      })
      .expect(200);
    expect(response.body).toMatchObject({
      id: customer.id,
      name: 'Nuevo nombre',
      phone: '123',
      email: 'new@mail.com',
      isActive: false,
      createdAt: customer.createdAt,
    });
    expect(
      Date.parse((response.body as CustomerDto).updatedAt),
    ).toBeGreaterThanOrEqual(Date.parse(customer.updatedAt));
    for (const value of ['', '   ', null]) {
      response = await http()
        .patch(`${base}/${customer.id}`)
        .set('Authorization', tokens.admin!)
        .send({ phone: value, email: value })
        .expect(200);
      expect(response.body).toMatchObject({
        phone: null,
        email: null,
        name: 'Nuevo nombre',
      });
    }
  });

  it('rejects invalid creates and private or removed fields', async () => {
    for (const body of [
      {},
      { name: '' },
      { name: ' ' },
      { name: null },
      { name: 1 },
      { name: 'a'.repeat(201) },
      { name: 'Ana', phone: '1'.repeat(11) },
      { name: 'Ana', phone: 123 },
      { name: 'Ana', phone: [] },
      { name: 'Ana', email: 'invalid' },
      { name: 'Ana', email: 1 },
      { name: 'Ana', email: 'a'.repeat(255) },
      { name: 'Ana', taxId: 'old' },
      { name: 'Ana', address: 'old' },
      { name: 'Ana', isDefault: true },
      { name: 'Ana', isActive: false },
      { name: 'Ana', unknown: true },
    ])
      await http()
        .post(base)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(400);
  });

  it('rejects empty or invalid updates and leaves data unchanged', async () => {
    const customer = await create();
    for (const body of [
      {},
      { name: null },
      { name: ' ' },
      { name: 3 },
      { name: 'a'.repeat(201) },
      { phone: 3 },
      { phone: '1'.repeat(11) },
      { email: 'invalid' },
      { email: [] },
      { isActive: null },
      { isActive: 'false' },
      { taxId: 'old' },
      { address: 'old' },
      { isDefault: true },
    ])
      await http()
        .patch(`${base}/${customer.id}`)
        .set('Authorization', tokens.admin!)
        .send(body)
        .expect(400);
    const response = await http()
      .get(`${base}/${customer.id}`)
      .set('Authorization', tokens.admin!)
      .expect(200);
    expect(response.body).toEqual(customer);
  });

  it('validates queries and IDs and reports nonexistent customers', async () => {
    for (const query of [
      'includeInactive=1',
      'includeInactive=TRUE',
      'includeInactive=',
      'includeInactive=true&includeInactive=false',
      'search=a&search=b',
      'search[nested]=value',
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
        if (method === 'patch') operation.send({ name: 'Ana' });
        await operation.expect(status);
      }
    }
  });

  it('deletes unreferenced customers with no body and returns 404 on repetition', async () => {
    const customer = await create();
    const response = await http()
      .delete(`${base}/${customer.id}`)
      .set('Authorization', tokens.admin!)
      .expect(204);
    expect(response.text).toBe('');
    await http()
      .delete(`${base}/${customer.id}`)
      .set('Authorization', tokens.admin!)
      .expect(404);
  });

  it.each(['quote', 'sale'] as const)(
    'blocks deletion referenced by a %s and preserves the relation',
    async (relation) => {
      const customer = await create();
      const data = {
        folio: randomUUID(),
        customerId: customer.id,
        subtotal: '10.00',
        total: '10.00',
      };
      const record =
        relation === 'quote'
          ? await prisma.quote.create({ data })
          : await prisma.sale.create({ data });
      await http()
        .delete(`${base}/${customer.id}`)
        .set('Authorization', tokens.admin!)
        .expect(409);
      const persisted =
        relation === 'quote'
          ? await prisma.quote.findUnique({ where: { id: record.id } })
          : await prisma.sale.findUnique({ where: { id: record.id } });
      expect(persisted?.customerId).toBe(customer.id);
      expect(
        await prisma.customer.findUnique({ where: { id: customer.id } }),
      ).not.toBeNull();
    },
  );

  it('initializes one default, lists it and preserves it across concurrent initializations', async () => {
    const service = app!.get(CustomersService);
    const initial = await prisma.customer.findFirstOrThrow({
      where: { isDefault: true },
    });
    expect(initial).toMatchObject({
      name: DEFAULT_CUSTOMER_NAME,
      phone: null,
      email: null,
      isActive: true,
    });
    const defaults = await Promise.all([
      service.ensureDefaultCustomer(),
      service.ensureDefaultCustomer(),
    ]);
    expect(defaults.map(({ id }) => id)).toEqual([initial.id, initial.id]);
    expect(await prisma.customer.count({ where: { isDefault: true } })).toBe(1);
    const response = await http()
      .get(base)
      .set('Authorization', tokens.seller!)
      .expect(200);
    expect(response.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: initial.id })]),
    );
    await http()
      .get(`${base}/${initial.id}`)
      .set('Authorization', tokens.seller!)
      .expect(200);
    await http()
      .delete(`${base}/${initial.id}`)
      .set('Authorization', tokens.admin!)
      .expect(409);
  });

  it('preserves editable default identity across module startup and blocks deletion after renaming', async () => {
    const service = app!.get(CustomersService);
    const initial = await service.ensureDefaultCustomer();
    try {
      const edited = {
        name: 'Público general',
        phone: '1234567890',
        email: ' GENERAL@MAIL.COM ',
        isActive: false,
      };
      await http()
        .patch(`${base}/${initial.id}`)
        .set('Authorization', tokens.admin!)
        .send(edited)
        .expect(200);
      // New service instance exercises startup without relying on in-memory identity.
      await new CustomersService(prisma).onModuleInit();
      expect(await service.ensureDefaultCustomer()).toMatchObject({
        ...edited,
        email: 'general@mail.com',
        id: initial.id,
      });
      expect(await prisma.customer.count({ where: { isDefault: true } })).toBe(
        1,
      );
      await http()
        .delete(`${base}/${initial.id}`)
        .set('Authorization', tokens.admin!)
        .expect(409);
      const ordinary = await create({ name: DEFAULT_CUSTOMER_NAME });
      await http()
        .delete(`${base}/${ordinary.id}`)
        .set('Authorization', tokens.admin!)
        .expect(204);
    } finally {
      await prisma.customer.update({
        where: { id: initial.id },
        data: {
          name: initial.name,
          phone: initial.phone,
          email: initial.email,
          isActive: initial.isActive,
        },
      });
    }
  });

  it('serializes concurrent bootstraps when the default does not exist yet', async () => {
    const service = app!.get(CustomersService);
    const existing = await prisma.customer.findFirstOrThrow({
      where: { isDefault: true },
    });
    // Only the isolated fixture is removed; the HTTP API forbids this operation.
    await prisma.customer.delete({ where: { id: existing.id } });
    const customers = await Promise.all([
      service.ensureDefaultCustomer(),
      new CustomersService(prisma).ensureDefaultCustomer(),
    ]);
    expect(customers[0]!.id).toBe(customers[1]!.id);
    expect(await prisma.customer.count({ where: { isDefault: true } })).toBe(1);
  });
  it('requires active authenticated users and enforces roles on all endpoints', async () => {
    const customer = await create();
    const endpoints = [
      ['get', base],
      ['get', `${base}/${customer.id}`],
      ['post', base],
      ['patch', `${base}/${customer.id}`],
      ['delete', `${base}/${customer.id}`],
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
      [base, 'post', ['201', '400', '401', '403']],
      [base, 'get', ['200', '400', '401', '403']],
      [`${base}/{id}`, 'get', ['200', '400', '401', '403', '404']],
      [`${base}/{id}`, 'patch', ['200', '400', '401', '403', '404']],
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
        expect.objectContaining({ name: 'search', in: 'query' }),
      ]),
    );
    expect(
      Object.keys(
        response.body.components.schemas.CustomerDto.properties,
      ).sort(),
    ).toEqual([
      'createdAt',
      'email',
      'id',
      'isActive',
      'name',
      'phone',
      'updatedAt',
    ]);
    expect(response.body.components.schemas.CreateCustomerDto.required).toEqual(
      ['name'],
    );
    expect(
      response.body.components.schemas.UpdateCustomerDto.required ?? [],
    ).toEqual([]);
  });
});
