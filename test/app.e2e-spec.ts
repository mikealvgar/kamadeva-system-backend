import { Test } from '@nestjs/testing';
import {
  Controller,
  Get,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../src/app.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { Roles } from '../src/auth/decorators/roles.decorator.js';
import { RolesGuard } from '../src/auth/guards/roles.guard.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import type {
  AuthResult,
  TokenPair,
} from '../src/auth/types/auth-result.type.js';

@Controller('test-protected')
class ProtectedController {
  @Get('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VENDEDOR')
  seller() {
    return { ok: true };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  admin() {
    return { ok: true };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  read() {
    return { ok: true };
  }
}

describe('Auth HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const jwt = new JwtService();
  const password = 'Password123!';
  const post = (path: string, body: object) =>
    request(app!.getHttpServer()).post(`/api/auth/${path}`).send(body);
  const tokenHash = (token: string) =>
    createHash('sha256').update(token).digest('hex');
  const claims = (token: string) =>
    jwt.decode<{ sub: string; jti: string; exp: number }>(token);

  async function startApp() {
    const module = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [ProtectedController],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  }
  async function register(
    email = `${randomUUID()}@example.com`,
  ): Promise<AuthResult> {
    const response = await post('register', {
      name: ' Test ',
      email,
      password,
    }).expect(201);
    return response.body as AuthResult;
  }
  async function signedRefresh(
    userId: string,
    options: {
      expiresIn?: number;
      algorithm?: 'HS256' | 'HS384';
      secret?: string;
      jti?: string;
    } = {},
  ) {
    return jwt.signAsync(
      { sub: userId },
      {
        secret: options.secret ?? process.env.JWT_REFRESH_SECRET,
        algorithm: options.algorithm ?? 'HS256',
        expiresIn: options.expiresIn ?? 3600,
        jwtid: options.jti ?? randomUUID(),
      },
    );
  }
  async function persistToken(token: string, userId: string) {
    return prisma.refreshToken.create({
      data: {
        id: claims(token).jti,
        userId,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }

  // Keep the real transaction and fail only the replacement INSERT.
  function failNextSessionWrite() {
    const transaction = prisma.$transaction.bind(prisma);
    return vi.spyOn(prisma, '$transaction').mockImplementationOnce((async (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
      return transaction(async (tx) => {
        const insert = vi
          .spyOn(tx.refreshToken, 'create')
          .mockRejectedValueOnce(new Error('Injected session write failure'));
        try {
          return await callback(tx);
        } finally {
          insert.mockRestore();
        }
      });
    }) as typeof prisma.$transaction);
  }

  beforeAll(startApp);
  afterAll(async () => {
    await app?.close();
  });

  it('initializes AppModule with the production prefix', async () => {
    await request(app!.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });
  it('registers normalized data, stores hashes and returns verifiable JWTs', async () => {
    const email = `${randomUUID()}@example.com`;
    const result = await register(` ${email.toUpperCase()} `);
    expect(result.user).toEqual({
      id: expect.any(String),
      name: 'Test',
      email,
      roles: ['ADMIN'],
    });
    expect(Object.keys(result).sort()).toEqual([
      'accessToken',
      'refreshToken',
      'user',
    ]);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.user.id },
    });
    expect(user.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    const refresh = jwt.verify<{ sub: string; jti: string; exp: number }>(
      result.refreshToken,
      { secret: process.env.JWT_REFRESH_SECRET, algorithms: ['HS256'] },
    );
    const record = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: refresh.jti },
    });
    expect(record.tokenHash).toBe(tokenHash(result.refreshToken));
    expect(record.expiresAt.getTime()).toBe(refresh.exp * 1000);
    expect(record.userId).toBe(user.id);
    const access = jwt.verify(result.accessToken, {
      secret: process.env.JWT_ACCESS_SECRET,
      algorithms: ['HS256'],
    });
    expect(access).toMatchObject({ sub: user.id, email, roles: ['ADMIN'] });
  });
  it('rejects duplicate normalized emails', async () => {
    const result = await register();
    await post('register', {
      name: 'Other',
      email: ` ${result.user.email.toUpperCase()} `,
      password,
    }).expect(409);
  });
  it('maps a concurrent registration race to 201 and 409', async () => {
    const email = `${randomUUID()}@example.com`;
    const results = await Promise.all([
      post('register', { name: 'Test', email, password }),
      post('register', { name: 'Test', email, password }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
  it.each([
    ['register', { name: ' ', email: 'a@example.com', password }],
    ['register', { name: 'Test', email: 'invalid', password }],
    ['register', { name: 'Test', email: 'a@example.com', password: 'short' }],
    [
      'register',
      { name: 'Test', email: 'a@example.com', password: 'é'.repeat(37) },
    ],
    [
      'register',
      { name: 'Test', email: 'a@example.com', password, isActive: true },
    ],
    ['login', { email: 42, password }],
    ['refresh', { resfreshToken: 'typo' }],
    ['refresh', { refreshToken: '' }],
    ['refresh', { refreshToken: 123 }],
    ['logout', {}],
  ])('validates %s request %j', async (path, body) => {
    await post(path, body).expect(400);
  });
  it('logs in with normalized email and starts an independent session', async () => {
    const result = await register();
    const login = await post('login', {
      email: ` ${result.user.email.toUpperCase()} `,
      password,
    }).expect(200);
    expect(login.body.user).toEqual(result.user);
    expect(login.body.refreshToken).not.toBe(result.refreshToken);
    expect(
      await prisma.refreshToken.count({ where: { userId: result.user.id } }),
    ).toBe(2);
    expect(login.headers['cache-control']).toBe('no-store');
  });
  it('uses identical errors for missing email, bad password and inactive user', async () => {
    const result = await register();
    const missing = await post('login', {
      email: `${randomUUID()}@example.com`,
      password,
    }).expect(401);
    const wrong = await post('login', {
      email: result.user.email,
      password: 'WrongPassword!',
    }).expect(401);
    await prisma.user.update({
      where: { id: result.user.id },
      data: { isActive: false },
    });
    const inactive = await post('login', {
      email: result.user.email,
      password,
    }).expect(401);
    expect(missing.body).toEqual(wrong.body);
    expect(inactive.body).toEqual(wrong.body);
    await post('refresh', { refreshToken: result.refreshToken }).expect(401);
  });
  it('authenticates access tokens via the exported guard and rejects refresh tokens', async () => {
    const result = await register();
    await request(app!.getHttpServer())
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${result.accessToken}`)
      .expect(200);
    await request(app!.getHttpServer())
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${result.refreshToken}`)
      .expect(401);
    await prisma.user.update({
      where: { id: result.user.id },
      data: { isActive: false },
    });
    await request(app!.getHttpServer())
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${result.accessToken}`)
      .expect(401);
  });
  it('rotates, rejects replay and allows the replacement to refresh', async () => {
    const result = await register();
    const response = await post('refresh', {
      refreshToken: result.refreshToken,
    }).expect(200);
    const pair = response.body as TokenPair;
    expect(Object.keys(pair).sort()).toEqual(['accessToken', 'refreshToken']);
    expect(pair.refreshToken).not.toBe(result.refreshToken);
    const old = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: claims(result.refreshToken).jti },
    });
    expect(old.revokedAt).toBeInstanceOf(Date);
    await post('refresh', { refreshToken: result.refreshToken }).expect(401);
    await post('refresh', { refreshToken: pair.refreshToken }).expect(200);
  });
  it('allows exactly one of two concurrent refresh requests', async () => {
    const result = await register();
    const responses = await Promise.all([
      post('refresh', { refreshToken: result.refreshToken }),
      post('refresh', { refreshToken: result.refreshToken }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    expect(
      await prisma.refreshToken.count({
        where: { userId: result.user.id, revokedAt: null },
      }),
    ).toBe(1);
  });
  it('rolls back user creation if the initial session cannot be saved', async () => {
    const email = `${randomUUID()}@example.com`;
    const failure = failNextSessionWrite();
    try {
      await expect(
        app!.get(AuthService).register({ name: 'Rollback', email, password }),
      ).rejects.toThrow('Injected session write failure');
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    } finally {
      failure.mockRestore();
    }
  });
  it('rolls back revocation if the replacement session cannot be saved', async () => {
    const result = await register();
    const failure = failNextSessionWrite();
    try {
      await expect(
        app!.get(AuthService).refresh(result.refreshToken),
      ).rejects.toThrow('Injected session write failure');
      const old = await prisma.refreshToken.findUniqueOrThrow({
        where: { id: claims(result.refreshToken).jti },
      });
      expect(old.revokedAt).toBeNull();
      expect(
        await prisma.refreshToken.count({ where: { userId: result.user.id } }),
      ).toBe(1);
    } finally {
      failure.mockRestore();
    }
    await post('refresh', { refreshToken: result.refreshToken }).expect(200);
  });
  it('rejects expired JWTs even if their persisted expiry is later', async () => {
    const result = await register();
    const expired = await signedRefresh(result.user.id, { expiresIn: -1 });
    await persistToken(expired, result.user.id);
    await post('refresh', { refreshToken: expired }).expect(401);
  });
  it('rejects persisted expiry and hash mismatch', async () => {
    const result = await register();
    const id = claims(result.refreshToken).jti;
    await prisma.refreshToken.update({
      where: { id },
      data: { tokenHash: '0'.repeat(64) },
    });
    await post('refresh', { refreshToken: result.refreshToken }).expect(401);
    await prisma.refreshToken.update({
      where: { id },
      data: {
        tokenHash: tokenHash(result.refreshToken),
        expiresAt: new Date(0),
      },
    });
    await post('refresh', { refreshToken: result.refreshToken }).expect(401);
  });
  it('rejects alternate algorithms, wrong signatures, missing claims and unknown IDs', async () => {
    const result = await register();
    for (const token of [
      await signedRefresh(result.user.id, { algorithm: 'HS384' }),
      await signedRefresh(result.user.id, { secret: 'wrong-secret' }),
      await signedRefresh(result.user.id),
      await signedRefresh(result.user.id, { jti: 'not-a-uuid' }),
      jwt.sign(
        { sub: result.user.id },
        { secret: process.env.JWT_REFRESH_SECRET },
      ),
      `${result.refreshToken}tampered`,
      result.accessToken,
      'not-a-jwt',
    ]) {
      await post('refresh', { refreshToken: token }).expect(401);
    }
  });
  it('revokes only the presented session; logout is idempotent for invalid tokens', async () => {
    const result = await register();
    const login = await post('login', {
      email: result.user.email,
      password,
    }).expect(200);
    for (const token of [
      result.refreshToken,
      result.refreshToken,
      'invalid-token',
      await signedRefresh(result.user.id),
    ]) {
      const response = await post('logout', { refreshToken: token }).expect(
        204,
      );
      expect(response.text).toBe('');
    }
    await post('refresh', { refreshToken: result.refreshToken }).expect(401);
    await post('refresh', { refreshToken: login.body.refreshToken }).expect(
      200,
    );
  });
  it('preserves active and revoked sessions after rebuilding the application', async () => {
    const result = await register();
    const active = await post('refresh', {
      refreshToken: result.refreshToken,
    }).expect(200);
    const logout = await register();
    await post('logout', { refreshToken: logout.refreshToken }).expect(204);
    await app!.close();
    app = undefined;
    await startApp();
    await post('refresh', { refreshToken: result.refreshToken }).expect(401);
    await post('refresh', { refreshToken: logout.refreshToken }).expect(401);
    await post('refresh', { refreshToken: active.body.refreshToken }).expect(
      200,
    );
  });
  it('serves Swagger with all contracts and no hash properties', async () => {
    await request(app!.getHttpServer()).get('/api/docs/').expect(200);
    const response = await request(app!.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const document = response.body;
    for (const [path, code] of [
      ['register', '201'],
      ['login', '200'],
      ['refresh', '200'],
      ['logout', '204'],
    ]) {
      expect(
        document.paths[`/api/auth/${path}`].post.responses[code],
      ).toBeDefined();
    }
    expect(JSON.stringify(document.components.schemas)).not.toMatch(
      /passwordHash|tokenHash/,
    );
    expect(document.components.schemas.AuthUserDto.properties.roles.type).toBe(
      'array',
    );
  });
  describe('role assignment', () => {
    beforeEach(async () => {
      await prisma.refreshToken.deleteMany();
      await prisma.userRole.deleteMany();
      await prisma.user.deleteMany();
      await prisma.role.updateMany({ data: { isActive: true } });
    });
    const endpoint = (id: string) => `/api/users/${id}/roles`;
    const http = () => request(app!.getHttpServer());

    it('assigns ADMIN to the first registration and VENDEDOR to the second', async () => {
      const admin = await register();
      const seller = await register();
      expect(admin.user.roles).toEqual(['ADMIN']);
      expect(seller.user.roles).toEqual(['VENDEDOR']);
      expect(jwt.decode(admin.accessToken).roles).toEqual(['ADMIN']);
      expect(jwt.decode(seller.accessToken).roles).toEqual(['VENDEDOR']);
    });
    it('creates exactly one ADMIN and one VENDEDOR with concurrent first registrations', async () => {
      const results = await Promise.all([register(), register()]);
      expect(results.map((result) => result.user.roles[0]).sort()).toEqual([
        'ADMIN',
        'VENDEDOR',
      ]);
      expect(
        await prisma.userRole.count({ where: { role: { name: 'ADMIN' } } }),
      ).toBe(1);
      for (const result of results)
        expect(jwt.decode(result.accessToken).roles).toEqual(result.user.roles);
    });
    it('requires authentication and ADMIN on all four management endpoints', async () => {
      const admin = await register();
      const seller = await register();
      for (const token of [
        undefined,
        seller.accessToken,
        `${admin.accessToken}invalid`,
      ]) {
        for (const makeCall of [
          () => http().get('/api/roles'),
          () => http().get(endpoint(seller.user.id)),
          () =>
            http()
              .put(endpoint(seller.user.id))
              .send({ roles: ['ADMIN'] }),
          () => http().delete(`${endpoint(seller.user.id)}/VENDEDOR`),
        ]) {
          const call = makeCall();
          if (token) call.set('Authorization', `Bearer ${token}`);
          await call.expect(token === seller.accessToken ? 403 : 401);
        }
      }
      await prisma.user.update({
        where: { id: admin.user.id },
        data: { isActive: false },
      });
      await http()
        .get('/api/roles')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(401);
    });
    it('lists only public fixed roles and validates UUIDs and role values', async () => {
      const admin = await register();
      const auth = `Bearer ${admin.accessToken}`;
      const list = await http()
        .get('/api/roles')
        .set('Authorization', auth)
        .expect(200);
      expect(list.body.map((role: { name: string }) => role.name)).toEqual([
        'ADMIN',
        'VENDEDOR',
      ]);
      expect(Object.keys(list.body[0]).sort()).toEqual([
        'description',
        'id',
        'isActive',
        'name',
      ]);
      for (const body of [
        { roles: ['OTRO'] },
        { roles: ['MISSING'] },
        { roles: ['admin'] },
        { roles: [] },
        { roles: ['ADMIN', 'ADMIN'] },
        { roles: 'ADMIN' },
        {},
        { roles: ['ADMIN'], extra: true },
        { roles: [null] },
      ]) {
        await http()
          .put(endpoint(admin.user.id))
          .set('Authorization', auth)
          .send(body)
          .expect(400);
      }
      await http()
        .delete(`${endpoint(admin.user.id)}/OTRO`)
        .set('Authorization', auth)
        .expect(400);
      for (const id of ['invalid', '00000000-0000-1000-8000-000000000000']) {
        await http().get(endpoint(id)).set('Authorization', auth).expect(400);
        await http()
          .put(endpoint(id))
          .set('Authorization', auth)
          .send({ roles: ['ADMIN'] })
          .expect(400);
        await http()
          .delete(`${endpoint(id)}/ADMIN`)
          .set('Authorization', auth)
          .expect(400);
      }
      const missing = endpoint(randomUUID());
      await http().get(missing).set('Authorization', auth).expect(404);
      await http()
        .put(missing)
        .set('Authorization', auth)
        .send({ roles: ['ADMIN'] })
        .expect(404);
      await http()
        .delete(`${missing}/ADMIN`)
        .set('Authorization', auth)
        .expect(404);
    });
    it('promotes, refreshes claims, replaces roles idempotently and applies permissions immediately', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.accessToken}`;
      await http()
        .get('/api/test-protected/admin')
        .set('Authorization', `Bearer ${seller.accessToken}`)
        .expect(403);
      for (const session of [admin, seller]) {
        await http()
          .get('/api/test-protected/seller')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .expect(200);
      }
      for (let i = 0; i < 2; i++) {
        const response = await http()
          .put(endpoint(seller.user.id))
          .set('Authorization', auth)
          .send({ roles: ['ADMIN', 'VENDEDOR'] })
          .expect(200);
        expect(response.body).toEqual({
          userId: seller.user.id,
          roles: ['ADMIN', 'VENDEDOR'],
        });
      }
      await http()
        .get('/api/roles')
        .set('Authorization', `Bearer ${seller.accessToken}`)
        .expect(200);
      expect(jwt.decode(seller.accessToken).roles).toEqual(['VENDEDOR']);
      const refreshed = await post('refresh', {
        refreshToken: seller.refreshToken,
      }).expect(200);
      expect(jwt.decode(refreshed.body.accessToken).roles.sort()).toEqual([
        'ADMIN',
        'VENDEDOR',
      ]);
      const replaced = await http()
        .put(endpoint(seller.user.id))
        .set('Authorization', auth)
        .send({ roles: ['VENDEDOR'] })
        .expect(200);
      expect(replaced.body.roles).toEqual(['VENDEDOR']);
      await http()
        .get('/api/roles')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(403);
      await post('refresh', {
        refreshToken: refreshed.body.refreshToken,
      }).expect(200);
    });
    it('protects the last ADMIN and deletes unassigned roles idempotently', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.accessToken}`;
      const conflict = await http()
        .put(endpoint(admin.user.id))
        .set('Authorization', auth)
        .send({ roles: ['VENDEDOR'] })
        .expect(409);
      expect(conflict.body.message).toBe(
        'No se puede remover el último administrador',
      );
      await http()
        .delete(`${endpoint(admin.user.id)}/ADMIN`)
        .set('Authorization', auth)
        .expect(409);
      for (let i = 0; i < 2; i++)
        await http()
          .delete(`${endpoint(seller.user.id)}/VENDEDOR`)
          .set('Authorization', auth)
          .expect(204)
          .expect('');
      const result = await http()
        .get(endpoint(seller.user.id))
        .set('Authorization', auth)
        .expect(200);
      expect(result.body).toEqual({ userId: seller.user.id, roles: [] });
      await http()
        .get('/api/test-protected/seller')
        .set('Authorization', `Bearer ${seller.accessToken}`)
        .expect(403);
    });
    it('rejects inactive assignments atomically and excludes inactive roles', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.accessToken}`;
      await prisma.role.update({
        where: { name: 'VENDEDOR' },
        data: { isActive: false },
      });
      await http()
        .put(endpoint(seller.user.id))
        .set('Authorization', auth)
        .send({ roles: ['ADMIN', 'VENDEDOR'] })
        .expect(422);
      expect(
        await prisma.userRole.count({
          where: { userId: seller.user.id, role: { name: 'ADMIN' } },
        }),
      ).toBe(0);
      const result = await http()
        .get(endpoint(seller.user.id))
        .set('Authorization', auth)
        .expect(200);
      expect(result.body.roles).toEqual([]);
      await http()
        .get('/api/test-protected/seller')
        .set('Authorization', `Bearer ${seller.accessToken}`)
        .expect(403);
      const refreshed = await post('refresh', {
        refreshToken: seller.refreshToken,
      }).expect(200);
      expect(jwt.decode(refreshed.body.accessToken).roles).toEqual([]);
    });
    it('preserves an active ADMIN under concurrent demotions', async () => {
      const first = await register();
      const second = await register();
      const auth = `Bearer ${first.accessToken}`;
      await http()
        .put(endpoint(second.user.id))
        .set('Authorization', auth)
        .send({ roles: ['ADMIN'] })
        .expect(200);
      const results = await Promise.all([
        http()
          .put(endpoint(first.user.id))
          .set('Authorization', auth)
          .send({ roles: ['VENDEDOR'] }),
        http()
          .delete(`${endpoint(second.user.id)}/ADMIN`)
          .set('Authorization', `Bearer ${second.accessToken}`),
      ]);
      expect(results.filter((result) => result.status === 409)).toHaveLength(1);
      expect(
        results.filter((result) => [200, 204].includes(result.status)),
      ).toHaveLength(1);
      expect(
        await prisma.user.count({
          where: {
            isActive: true,
            roles: { some: { role: { name: 'ADMIN', isActive: true } } },
          },
        }),
      ).toBe(1);
    });
    it('deletes a VENDEDOR with its sessions and rejects self-deletion', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.accessToken}`;
      const target = `/api/users/${seller.user.id}`;
      await http().delete(target).expect(401);
      await http()
        .delete(target)
        .set('Authorization', `Bearer ${seller.accessToken}`)
        .expect(403);
      await http()
        .delete('/api/users/invalid')
        .set('Authorization', auth)
        .expect(400);
      await http()
        .delete(`/api/users/${randomUUID()}`)
        .set('Authorization', auth)
        .expect(404);
      const self = await http()
        .delete(`/api/users/${admin.user.id}`)
        .set('Authorization', auth)
        .expect(400);
      expect(self.body.message).toBe('No puedes eliminar tu propio usuario');
      await http()
        .delete(target)
        .set('Authorization', auth)
        .expect(204)
        .expect('');
      expect(
        await prisma.user.findUnique({ where: { id: seller.user.id } }),
      ).toBeNull();
      expect(
        await prisma.refreshToken.count({ where: { userId: seller.user.id } }),
      ).toBe(0);
      expect(
        await prisma.userRole.count({ where: { userId: seller.user.id } }),
      ).toBe(0);
      await post('login', { email: seller.user.email, password }).expect(401);
      await post('refresh', { refreshToken: seller.refreshToken }).expect(401);
      await http()
        .get(endpoint(seller.user.id))
        .set('Authorization', auth)
        .expect(404);
    });
    it('rejects deletion of users with associated records', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.accessToken}`;
      const target = `/api/users/${seller.user.id}`;
      const category = await prisma.category.create({
        data: { name: 'Test', slug: `test-${randomUUID()}`, isActive: true },
      });
      const product = await prisma.product.create({
        data: {
          sku: `sku-${randomUUID()}`,
          name: 'Test',
          price: 10,
          categoryId: category.id,
        },
      });
      const movement = await prisma.inventoryMovement.create({
        data: {
          productId: product.id,
          type: 'ADJUSTMENT_IN',
          quantityChange: 1,
          createdById: seller.user.id,
        },
      });
      const conflict = await http()
        .delete(target)
        .set('Authorization', auth)
        .expect(409);
      expect(conflict.body.message).toBe(
        'El usuario tiene registros asociados y no puede eliminarse',
      );
      expect(
        await prisma.user.findUnique({ where: { id: seller.user.id } }),
      ).not.toBeNull();
      await prisma.inventoryMovement.delete({ where: { id: movement.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
      await http().delete(target).set('Authorization', auth).expect(204);
    });
    it('documents all management contracts in Swagger', async () => {
      const response = await http().get('/api/docs-json').expect(200);
      for (const [path, method, statuses] of [
        ['/api/roles', 'get', ['200', '401', '403']],
        [
          '/api/users/{userId}/roles',
          'get',
          ['200', '400', '401', '403', '404'],
        ],
        [
          '/api/users/{userId}/roles',
          'put',
          ['200', '400', '401', '403', '404', '409', '422'],
        ],
        [
          '/api/users/{userId}/roles/{roleName}',
          'delete',
          ['204', '400', '401', '403', '404', '409'],
        ],
        [
          '/api/users/{userId}',
          'delete',
          ['204', '400', '401', '403', '404', '409'],
        ],
      ] as const) {
        for (const status of statuses)
          expect(
            response.body.paths[path][method].responses[status],
          ).toBeDefined();
      }
      expect(
        response.body.paths['/api/auth/register'].post.description,
      ).toContain('ADMIN');
    });
  });
});
