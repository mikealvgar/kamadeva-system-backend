import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type { BusinessConfigDto } from '../src/business-config/dto/business-config.dto.js';

const base = '/api/business-config';
const valid = {
  nombre: 'Kamadeva Boutique & Streetwear',
  direccion: 'Av. Insurgentes Sur #450 Int. 2B',
  colonia: 'Roma Sur',
  municipio: 'Cuauhtémoc',
  estado: 'Ciudad de México',
  telefono: '55-1234-5678',
  rfc: 'KAM210315ABC',
  mensajePie: '¡GRACIAS POR SU COMPRA!\nSÍGUENOS EN @KAMADEVA_MX',
};

describe('Business config HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
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
    // Single global row: start unconfigured.
    await prisma.businessConfig.deleteMany();
    const jwt = new JwtService();
    for (const [key, role] of [
      ['admin', 'ADMIN'],
      ['seller', 'VENDEDOR'],
      ['noRole', null],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          name: `Config ${key}`,
          email: `${randomUUID()}@config.test`,
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
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.businessConfig.deleteMany();
        const ids = Object.values(users);
        await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    } finally {
      await app?.close();
    }
  });

  const put = (body: object, token: string = tokens.admin) =>
    http().put(base).set('Authorization', token).send(body);

  it('creates, replaces and reads a single configuration', async () => {
    const missing = await http()
      .get(base)
      .set('Authorization', tokens.seller)
      .expect(404);
    expect(missing.body.message).toBe(
      'Configuración del negocio no registrada',
    );

    const created = (
      await put({
        ...valid,
        nombre: `  ${valid.nombre}  `,
        rfc: ' kam210315abc ',
      }).expect(200)
    ).body as BusinessConfigDto;
    expect(created).toEqual({ ...valid, updatedAt: expect.any(String) });

    const replaced = (
      await put({
        ...valid,
        telefono: '+52 (55) 8765.4321',
        rfc: 'GODE561231GR8',
      }).expect(200)
    ).body as BusinessConfigDto;
    expect(replaced).toMatchObject({
      telefono: '+52 (55) 8765.4321',
      rfc: 'GODE561231GR8',
    });
    expect(Date.parse(replaced.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.updatedAt),
    );
    expect(await prisma.businessConfig.count()).toBe(1);
    await http()
      .get(base)
      .set('Authorization', tokens.seller)
      .expect(200, replaced);
  });

  it('keeps a single row under concurrent saves', async () => {
    await prisma.businessConfig.deleteMany();
    const responses = await Promise.all([
      put({ ...valid, nombre: 'Uno' }),
      put({ ...valid, nombre: 'Dos' }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(await prisma.businessConfig.count()).toBe(1);
  });

  it('rejects incomplete or invalid configurations without writing', async () => {
    await put(valid).expect(200);
    const { nombre: _omitted, ...withoutName } = valid;
    for (const body of [
      {},
      withoutName,
      { ...valid, nombre: ' ' },
      { ...valid, nombre: 'x'.repeat(151) },
      { ...valid, direccion: 'x'.repeat(256) },
      { ...valid, colonia: 'x'.repeat(101) },
      { ...valid, municipio: '' },
      { ...valid, estado: null },
      { ...valid, telefono: '12345' },
      { ...valid, telefono: '55-ABCD-5678' },
      { ...valid, telefono: '1'.repeat(51) },
      { ...valid, rfc: 'KAM21031ABC' },
      { ...valid, rfc: 'KAM210315ABC1X' },
      { ...valid, rfc: 123 },
      { ...valid, mensajePie: 'x'.repeat(501) },
      { ...valid, logo: 'x' },
    ]) {
      await put(body).expect(400);
    }
    const stored = (
      await http().get(base).set('Authorization', tokens.admin).expect(200)
    ).body as BusinessConfigDto;
    expect(stored).toMatchObject(valid);
  });

  it('lets only ADMIN write and requires authentication', async () => {
    await http().get(base).expect(401);
    await http().put(base).send(valid).expect(401);
    await put(valid, tokens.seller).expect(403);
    await put(valid, tokens.noRole).expect(403);
    await http().get(base).set('Authorization', tokens.noRole).expect(403);
  });
});
