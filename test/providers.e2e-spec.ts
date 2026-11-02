import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type { ProviderDto } from '../src/providers/dto/provider.dto.js';

interface ProviderResponse {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  contacto: string | null;
  direccion: string | null;
  activo: boolean;
  fechaCreacion: string;
  fechaActualizacion: string;
}

const base = '/api/proveedores';

describe('Providers HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const created: string[] = [];
  const users: Record<'admin' | 'seller' | 'noRole', string> = {} as never;
  const tokens: Record<'admin' | 'seller' | 'noRole', string> = {} as never;
  const http = () => request(app!.getHttpServer());
  // Names are unique store-wide; keep them unique per test.
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
          nombre: `Providers ${key}`,
          email: `${randomUUID()}@providers.test`,
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
    await prisma.provider.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
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

  const post = (body: object, token: string = tokens.admin) =>
    http().post(base).set('Authorization', token).send(body);

  async function create(body: object): Promise<ProviderResponse> {
    const provider = (await post(body).expect(201)).body as ProviderResponse;
    created.push(provider.id);
    return provider;
  }

  it('creates normalized providers and reads them back', async () => {
    const name = unique('Textiles del Norte');
    const provider = await create({
      nombre: `  ${name}  `,
      telefono: ' 81-1234-5678 ',
      email: ' PEDIDOS@Textiles.MX ',
      contacto: ' Laura Gómez ',
      direccion: ' Bodega 4, Monterrey ',
    });
    expect(provider).toMatchObject({
      id: expect.any(String),
      nombre: name,
      telefono: '81-1234-5678',
      correo: 'pedidos@textiles.mx',
      contacto: 'Laura Gómez',
      direccion: 'Bodega 4, Monterrey',
      activo: true,
      fechaCreacion: expect.any(String),
      fechaActualizacion: expect.any(String),
    });
    await http()
      .get(`${base}/${provider.id}`)
      .set('Authorization', tokens.seller)
      .expect(200, provider);
    const minimal = await create({ nombre: unique('Mínimo'), telefono: ' ' });
    expect(minimal).toMatchObject({
      telefono: null,
      correo: null,
      contacto: null,
      direccion: null,
    });
  });

  it('rejects case-insensitive duplicates, including concurrent ones', async () => {
    const name = unique('Hilos');
    await create({ nombre: name });
    await post({ nombre: name.toUpperCase() }).expect(409);
    const racing = unique('Botones');
    const responses = await Promise.all([
      post({ nombre: racing }),
      post({ nombre: racing.toLowerCase() }),
    ]);
    for (const response of responses)
      if (response.status === 201)
        created.push((response.body as ProviderDto).id);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
  });

  it('updates partially, clears optional fields and hides inactive providers by default', async () => {
    const provider = await create({
      nombre: unique('Telas'),
      contacto: 'Pedro',
      email: 'a@b.mx',
    });
    const other = await create({ nombre: unique('Otro') });
    const target = `${base}/${provider.id}`;
    const updated = (
      await http()
        .patch(target)
        .set('Authorization', tokens.admin)
        .send({ contacto: null, telefono: '55 1234 5678' })
        .expect(200)
    ).body as ProviderResponse;
    expect(updated).toMatchObject({
      nombre: provider.nombre,
      contacto: null,
      telefono: '55 1234 5678',
      correo: 'a@b.mx',
    });
    await http()
      .patch(target)
      .set('Authorization', tokens.admin)
      .send({ nombre: other.nombre.toLowerCase() })
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
      .expect(200);
    const list = async (query: Record<string, string>) =>
      (
        (
          await http()
            .get(base)
            .query(query)
            .set('Authorization', tokens.seller)
            .expect(200)
        ).body as ProviderDto[]
      ).map(({ id }) => id);
    expect(await list({})).not.toContain(provider.id);
    expect(await list({ includeInactive: 'true' })).toContain(provider.id);
    await http()
      .patch(`${base}/${randomUUID()}`)
      .set('Authorization', tokens.admin)
      .send({ isActive: true })
      .expect(404);
  });

  it('searches by name, contact, email or phone', async () => {
    const tag = randomUUID().slice(0, 6);
    const byName = await create({ nombre: `Mercería ${tag}` });
    const byContact = await create({
      nombre: unique('Proveedor'),
      contacto: `Agente ${tag}`,
    });
    const byEmail = await create({
      nombre: unique('Proveedor'),
      email: `ventas-${tag}@mail.mx`,
    });
    const found = (
      await http()
        .get(base)
        .query({ search: tag.toUpperCase() })
        .set('Authorization', tokens.seller)
        .expect(200)
    ).body as ProviderDto[];
    expect(found.map(({ id }) => id).sort()).toEqual(
      [byName.id, byContact.id, byEmail.id].sort(),
    );
    const phone = await create({
      nombre: unique('Teléfono'),
      telefono: '33-9876-5432',
    });
    expect(
      (
        (
          await http()
            .get(base)
            .query({ search: '9876' })
            .set('Authorization', tokens.seller)
            .expect(200)
        ).body as ProviderDto[]
      ).map(({ id }) => id),
    ).toContain(phone.id);
  });

  it('rejects invalid input', async () => {
    const valid = { nombre: unique('Válido') };
    for (const body of [
      {},
      { nombre: ' ' },
      { nombre: 'x'.repeat(151) },
      { ...valid, telefono: '123' },
      { ...valid, telefono: '81-ABCD-5678' },
      { ...valid, telefono: '1'.repeat(31) },
      { ...valid, email: 'no-es-correo' },
      { ...valid, email: `${'a'.repeat(145)}@b.mx` },
      { ...valid, contacto: 'x'.repeat(101) },
      { ...valid, direccion: 'x'.repeat(256) },
      { ...valid, isActive: false },
      { ...valid, rfc: 'X' },
    ]) {
      await post(body).expect(400);
    }
    expect(await prisma.provider.count({ where: { nombre: valid.nombre } })).toBe(
      0,
    );
    await http()
      .get(`${base}/not-a-uuid`)
      .set('Authorization', tokens.seller)
      .expect(400);
  });

  it('deletes providers and enforces permissions', async () => {
    const provider = await create({ nombre: unique('Borrar') });
    const target = `${base}/${provider.id}`;
    await http().get(base).expect(401);
    await post({ nombre: unique('X') }, tokens.seller).expect(403);
    await http()
      .patch(target)
      .set('Authorization', tokens.seller)
      .send({ isActive: false })
      .expect(403);
    await http().delete(target).set('Authorization', tokens.seller).expect(403);
    await http().get(base).set('Authorization', tokens.noRole).expect(403);
    await http().delete(target).set('Authorization', tokens.admin).expect(204);
    await http().delete(target).set('Authorization', tokens.admin).expect(404);
    await http().get(target).set('Authorization', tokens.admin).expect(404);
  });
});
