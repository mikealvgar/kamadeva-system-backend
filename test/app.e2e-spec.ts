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

interface AuthUserResponse {
  id: string;
  nombre: string;
  correo: string;
  roles: string[];
}

interface AuthResultResponse {
  tokenAcceso: string;
  tokenRenovacion: string;
  usuario: AuthUserResponse;
}

interface TokenPairResponse {
  tokenAcceso: string;
  tokenRenovacion: string;
}

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
  const authPaths: Record<string, string> = {
    register: 'registro',
  };
  const post = (path: string, body: object) =>
    request(app!.getHttpServer())
      .post(`/api/autenticacion/${authPaths[path] ?? path}`)
      .send(body);
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
    // Keep one listener for the suite instead of reopening a port per request.
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
  }
  async function register(
    email = `${randomUUID()}@example.com`,
  ): Promise<AuthResultResponse> {
    const response = await post('register', {
      name: ' Test ',
      email,
      password,
    }).expect(201);
    return response.body as AuthResultResponse;
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
        usuarioId: userId,
        tokenHash: tokenHash(token),
        fechaVencimiento: new Date(Date.now() + 3600000),
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
    expect(result.usuario).toMatchObject({
      id: expect.any(String),
      nombre: 'Test',
      correo: email,
      roles: ['ADMIN'],
    });
    expect(Object.keys(result).sort()).toEqual([
      'tokenAcceso',
      'tokenRenovacion',
      'usuario',
    ]);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.usuario.id },
    });
    expect(user.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    const refresh = jwt.verify<{ sub: string; jti: string; exp: number }>(
      result.tokenRenovacion,
      { secret: process.env.JWT_REFRESH_SECRET, algorithms: ['HS256'] },
    );
    const record = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: refresh.jti },
    });
    expect(record.tokenHash).toBe(tokenHash(result.tokenRenovacion));
    expect(record.fechaVencimiento.getTime()).toBe(refresh.exp * 1000);
    expect(record.usuarioId).toBe(user.id);
    const access = jwt.verify(result.tokenAcceso, {
      secret: process.env.JWT_ACCESS_SECRET,
      algorithms: ['HS256'],
    });
    expect(access).toMatchObject({ sub: user.id, email, roles: ['ADMIN'] });
  });
  it('rejects duplicate normalized emails', async () => {
    const result = await register();
    await post('register', {
      name: 'Other',
      email: ` ${result.usuario.correo.toUpperCase()} `,
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
      email: ` ${result.usuario.correo.toUpperCase()} `,
      password,
    }).expect(200);
    expect(login.body.usuario).toEqual(result.usuario);
    expect(login.body.tokenRenovacion).not.toBe(result.tokenRenovacion);
    expect(
      await prisma.refreshToken.count({ where: { usuarioId: result.usuario.id } }),
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
      email: result.usuario.correo,
      password: 'WrongPassword!',
    }).expect(401);
    await prisma.user.update({
      where: { id: result.usuario.id },
      data: { activo: false },
    });
    const inactive = await post('login', {
      email: result.usuario.correo,
      password,
    }).expect(401);
    expect(missing.body).toEqual(wrong.body);
    expect(inactive.body).toEqual(wrong.body);
    await post('refresh', { refreshToken: result.tokenRenovacion }).expect(401);
  });
  it('authenticates access tokens via the exported guard and rejects refresh tokens', async () => {
    const result = await register();
    await request(app!.getHttpServer())
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${result.tokenAcceso}`)
      .expect(200);
    await request(app!.getHttpServer())
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${result.tokenRenovacion}`)
      .expect(401);
    await prisma.user.update({
      where: { id: result.usuario.id },
      data: { activo: false },
    });
    await request(app!.getHttpServer())
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${result.tokenAcceso}`)
      .expect(401);
  });
  it('rotates, rejects replay and allows the replacement to refresh', async () => {
    const result = await register();
    const response = await post('refresh', {
      refreshToken: result.tokenRenovacion,
    }).expect(200);
    const pair = response.body as TokenPairResponse;
    expect(Object.keys(pair).sort()).toEqual(['tokenAcceso', 'tokenRenovacion']);
    expect(pair.tokenRenovacion).not.toBe(result.tokenRenovacion);
    const old = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: claims(result.tokenRenovacion).jti },
    });
    expect(old.fechaRevocacion).toBeInstanceOf(Date);
    await post('refresh', { refreshToken: result.tokenRenovacion }).expect(401);
    await post('refresh', { refreshToken: pair.tokenRenovacion }).expect(200);
  });
  it('allows exactly one of two concurrent refresh requests', async () => {
    const result = await register();
    const responses = await Promise.all([
      post('refresh', { refreshToken: result.tokenRenovacion }),
      post('refresh', { refreshToken: result.tokenRenovacion }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    expect(
      await prisma.refreshToken.count({
        where: { usuarioId: result.usuario.id, fechaRevocacion: null },
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
        app!.get(AuthService).refresh(result.tokenRenovacion),
      ).rejects.toThrow('Injected session write failure');
      const old = await prisma.refreshToken.findUniqueOrThrow({
        where: { id: claims(result.tokenRenovacion).jti },
      });
      expect(old.fechaRevocacion).toBeNull();
      expect(
        await prisma.refreshToken.count({ where: { usuarioId: result.usuario.id } }),
      ).toBe(1);
    } finally {
      failure.mockRestore();
    }
    await post('refresh', { refreshToken: result.tokenRenovacion }).expect(200);
  });
  it('rejects expired JWTs even if their persisted expiry is later', async () => {
    const result = await register();
    const expired = await signedRefresh(result.usuario.id, { expiresIn: -1 });
    await persistToken(expired, result.usuario.id);
    await post('refresh', { refreshToken: expired }).expect(401);
  });
  it('rejects persisted expiry and hash mismatch', async () => {
    const result = await register();
    const id = claims(result.tokenRenovacion).jti;
    await prisma.refreshToken.update({
      where: { id },
      data: { tokenHash: '0'.repeat(64) },
    });
    await post('refresh', { refreshToken: result.tokenRenovacion }).expect(401);
    await prisma.refreshToken.update({
      where: { id },
      data: {
        tokenHash: tokenHash(result.tokenRenovacion),
        fechaVencimiento: new Date(0),
      },
    });
    await post('refresh', { refreshToken: result.tokenRenovacion }).expect(401);
  });
  it('rejects alternate algorithms, wrong signatures, missing claims and unknown IDs', async () => {
    const result = await register();
    for (const token of [
      await signedRefresh(result.usuario.id, { algorithm: 'HS384' }),
      await signedRefresh(result.usuario.id, { secret: 'wrong-secret' }),
      await signedRefresh(result.usuario.id),
      await signedRefresh(result.usuario.id, { jti: 'not-a-uuid' }),
      jwt.sign(
        { sub: result.usuario.id },
        { secret: process.env.JWT_REFRESH_SECRET },
      ),
      `${result.tokenRenovacion}tampered`,
      result.tokenAcceso,
      'not-a-jwt',
    ]) {
      await post('refresh', { refreshToken: token }).expect(401);
    }
  });
  it('revokes only the presented session; logout is idempotent for invalid tokens', async () => {
    const result = await register();
    const login = await post('login', {
      email: result.usuario.correo,
      password,
    }).expect(200);
    for (const token of [
      result.tokenRenovacion,
      result.tokenRenovacion,
      'invalid-token',
      await signedRefresh(result.usuario.id),
    ]) {
      const response = await post('logout', { refreshToken: token }).expect(
        204,
      );
      expect(response.text).toBe('');
    }
    await post('refresh', { refreshToken: result.tokenRenovacion }).expect(401);
    await post('refresh', { refreshToken: login.body.tokenRenovacion }).expect(
      200,
    );
  });
  it('preserves active and revoked sessions after rebuilding the application', async () => {
    const result = await register();
    const active = await post('refresh', {
      refreshToken: result.tokenRenovacion,
    }).expect(200);
    const logout = await register();
    await post('logout', { refreshToken: logout.tokenRenovacion }).expect(204);
    await app!.close();
    app = undefined;
    await startApp();
    await post('refresh', { refreshToken: result.tokenRenovacion }).expect(401);
    await post('refresh', { refreshToken: logout.tokenRenovacion }).expect(401);
    await post('refresh', { refreshToken: active.body.tokenRenovacion }).expect(
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
      const translatedPath = authPaths[path] ?? path;
      expect(
        document.paths[`/api/autenticacion/${translatedPath}`].post.responses[
          code
        ],
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
      await prisma.user.deleteMany();
      await prisma.role.updateMany({ data: { activo: true } });
    });
    const endpoint = (id: string) => `/api/usuarios/${id}/roles`;
    const http = () => request(app!.getHttpServer());

    it('assigns ADMIN to the first registration and VENDEDOR to the second', async () => {
      const admin = await register();
      const seller = await register();
      expect(admin.usuario.roles).toEqual(['ADMIN']);
      expect(seller.usuario.roles).toEqual(['VENDEDOR']);
      expect(jwt.decode(admin.tokenAcceso).roles).toEqual(['ADMIN']);
      expect(jwt.decode(seller.tokenAcceso).roles).toEqual(['VENDEDOR']);
    });
    it('creates exactly one ADMIN and one VENDEDOR with concurrent first registrations', async () => {
      const results = await Promise.all([register(), register()]);
      expect(results.map((result) => result.usuario.roles[0]).sort()).toEqual([
        'ADMIN',
        'VENDEDOR',
      ]);
      expect(
        await prisma.user.count({ where: { rol: { nombre: 'ADMIN' } } }),
      ).toBe(1);
      for (const result of results)
        expect(jwt.decode(result.tokenAcceso).roles).toEqual(result.usuario.roles);
    });
    it('requires authentication and ADMIN on all four management endpoints', async () => {
      const admin = await register();
      const seller = await register();
      for (const token of [
        undefined,
        seller.tokenAcceso,
        `${admin.tokenAcceso}invalid`,
      ]) {
        for (const makeCall of [
          () => http().get('/api/roles'),
          () => http().get(endpoint(seller.usuario.id)),
          () =>
            http()
              .put(endpoint(seller.usuario.id))
              .send({ roles: ['ADMIN'] }),
          () => http().delete(`${endpoint(seller.usuario.id)}/VENDEDOR`),
        ]) {
          const call = makeCall();
          if (token) call.set('Authorization', `Bearer ${token}`);
          await call.expect(token === seller.tokenAcceso ? 403 : 401);
        }
      }
      await prisma.user.update({
        where: { id: admin.usuario.id },
        data: { activo: false },
      });
      await http()
        .get('/api/roles')
        .set('Authorization', `Bearer ${admin.tokenAcceso}`)
        .expect(401);
    });
    it('lists only public fixed roles and validates UUIDs and role values', async () => {
      const admin = await register();
      const auth = `Bearer ${admin.tokenAcceso}`;
      const list = await http()
        .get('/api/roles')
        .set('Authorization', auth)
        .expect(200);
      expect(list.body.map((role: { nombre: string }) => role.nombre)).toEqual([
        'ADMIN',
        'VENDEDOR',
      ]);
      expect(Object.keys(list.body[0]).sort()).toEqual([
        'activo',
        'descripcion',
        'id',
        'nombre',
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
          .put(endpoint(admin.usuario.id))
          .set('Authorization', auth)
          .send(body)
          .expect(400);
      }
      await http()
        .delete(`${endpoint(admin.usuario.id)}/OTRO`)
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
    it('lists users using Spanish search and pagination fields', async () => {
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { nombre: 'ADMIN' },
      });
      const adminUser = await prisma.user.create({
        data: {
          nombre: 'Admin listado',
          email: `${randomUUID()}@example.com`,
          passwordHash: 'unused-test-hash',
          rolId: adminRole.id,
        },
      });
      const auth = `Bearer ${jwt.sign(
        { sub: adminUser.id, email: adminUser.email, roles: ['ADMIN'] },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: '15m',
          algorithm: 'HS256',
        },
      )}`;
      const response = await http()
        .get('/api/usuarios?busqueda=Admin&activo=true&pagina=1&limite=1')
        .set('Authorization', auth)
        .expect(200);
      expect(response.body).toMatchObject({ pagina: 1, limite: 1, total: 1 });
      expect(response.body.datos[0]).toMatchObject({
        nombre: 'Admin listado',
        correo: adminUser.email,
        roles: ['ADMIN'],
        activo: true,
      });
      expect(Object.keys(response.body.datos[0]).sort()).toEqual([
        'activo',
        'correo',
        'fechaCreacion',
        'id',
        'nombre',
        'roles',
        'telefono',
      ]);
    });
    it('promotes, refreshes claims, replaces roles idempotently and applies permissions immediately', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.tokenAcceso}`;
      await http()
        .get('/api/test-protected/admin')
        .set('Authorization', `Bearer ${seller.tokenAcceso}`)
        .expect(403);
      for (const session of [admin, seller]) {
        await http()
          .get('/api/test-protected/seller')
          .set('Authorization', `Bearer ${session.tokenAcceso}`)
          .expect(200);
      }
      for (let i = 0; i < 2; i++) {
        const response = await http()
          .put(endpoint(seller.usuario.id))
          .set('Authorization', auth)
          .send({ roles: ['ADMIN'] })
          .expect(200);
        expect(response.body).toEqual({
          usuarioId: seller.usuario.id,
          roles: ['ADMIN'],
        });
      }
      await http()
        .get('/api/roles')
        .set('Authorization', `Bearer ${seller.tokenAcceso}`)
        .expect(200);
      expect(jwt.decode(seller.tokenAcceso).roles).toEqual(['VENDEDOR']);
      const refreshed = await post('refresh', {
        refreshToken: seller.tokenRenovacion,
      }).expect(200);
      expect(jwt.decode(refreshed.body.tokenAcceso).roles.sort()).toEqual([
        'ADMIN',
      ]);
      const replaced = await http()
        .put(endpoint(seller.usuario.id))
        .set('Authorization', auth)
        .send({ roles: ['VENDEDOR'] })
        .expect(200);
      expect(replaced.body.roles).toEqual(['VENDEDOR']);
      await http()
        .get('/api/roles')
        .set('Authorization', `Bearer ${refreshed.body.tokenAcceso}`)
        .expect(403);
      await post('refresh', {
        refreshToken: refreshed.body.tokenRenovacion,
      }).expect(200);
    });
    it('protects the last ADMIN and deletes unassigned roles idempotently', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.tokenAcceso}`;
      const conflict = await http()
        .put(endpoint(admin.usuario.id))
        .set('Authorization', auth)
        .send({ roles: ['VENDEDOR'] })
        .expect(409);
      expect(conflict.body.message).toBe(
        'No se puede remover el último administrador',
      );
      await http()
        .delete(`${endpoint(admin.usuario.id)}/ADMIN`)
        .set('Authorization', auth)
        .expect(409);
      for (let i = 0; i < 2; i++)
        await http()
          .delete(`${endpoint(seller.usuario.id)}/VENDEDOR`)
          .set('Authorization', auth)
          .expect(204)
          .expect('');
      const result = await http()
        .get(endpoint(seller.usuario.id))
        .set('Authorization', auth)
        .expect(200);
      expect(result.body).toEqual({ usuarioId: seller.usuario.id, roles: [] });
      await http()
        .get('/api/test-protected/seller')
        .set('Authorization', `Bearer ${seller.tokenAcceso}`)
        .expect(403);
    });
    it('rejects inactive assignments atomically and excludes inactive roles', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.tokenAcceso}`;
      await prisma.role.update({
        where: { nombre: 'VENDEDOR' },
        data: { activo: false },
      });
      await http()
        .put(endpoint(seller.usuario.id))
        .set('Authorization', auth)
        .send({ roles: ['ADMIN', 'VENDEDOR'] })
        .expect(422);
      expect(
        await prisma.user.count({
          where: { id: seller.usuario.id, rol: { nombre: 'ADMIN' } },
        }),
      ).toBe(0);
      const result = await http()
        .get(endpoint(seller.usuario.id))
        .set('Authorization', auth)
        .expect(200);
      expect(result.body.roles).toEqual([]);
      await http()
        .get('/api/test-protected/seller')
        .set('Authorization', `Bearer ${seller.tokenAcceso}`)
        .expect(403);
      const refreshed = await post('refresh', {
        refreshToken: seller.tokenRenovacion,
      }).expect(200);
      expect(jwt.decode(refreshed.body.tokenAcceso).roles).toEqual([]);
    });
    it('preserves an active ADMIN under concurrent demotions', async () => {
      const first = await register();
      const second = await register();
      const auth = `Bearer ${first.tokenAcceso}`;
      await http()
        .put(endpoint(second.usuario.id))
        .set('Authorization', auth)
        .send({ roles: ['ADMIN'] })
        .expect(200);
      const results = await Promise.all([
        http()
          .put(endpoint(first.usuario.id))
          .set('Authorization', auth)
          .send({ roles: ['VENDEDOR'] }),
        http()
          .delete(`${endpoint(second.usuario.id)}/ADMIN`)
          .set('Authorization', `Bearer ${second.tokenAcceso}`),
      ]);
      expect(results.filter((result) => result.status === 409)).toHaveLength(1);
      expect(
        results.filter((result) => [200, 204].includes(result.status)),
      ).toHaveLength(1);
      expect(
        await prisma.user.count({
          where: {
            activo: true,
            rol: { nombre: 'ADMIN', activo: true },
          },
        }),
      ).toBe(1);
    });
    it('deletes a VENDEDOR with its sessions and rejects self-deletion', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.tokenAcceso}`;
      const target = `/api/usuarios/${seller.usuario.id}`;
      await http().delete(target).expect(401);
      await http()
        .delete(target)
        .set('Authorization', `Bearer ${seller.tokenAcceso}`)
        .expect(403);
      await http()
        .delete('/api/usuarios/invalid')
        .set('Authorization', auth)
        .expect(400);
      await http()
        .delete(`/api/usuarios/${randomUUID()}`)
        .set('Authorization', auth)
        .expect(404);
      const self = await http()
        .delete(`/api/usuarios/${admin.usuario.id}`)
        .set('Authorization', auth)
        .expect(400);
      expect(self.body.message).toBe('No puedes eliminar tu propio usuario');
      await http()
        .delete(target)
        .set('Authorization', auth)
        .expect(204)
        .expect('');
      expect(
        await prisma.user.findUnique({ where: { id: seller.usuario.id } }),
      ).toBeNull();
      expect(
        await prisma.refreshToken.count({ where: { usuarioId: seller.usuario.id } }),
      ).toBe(0);
      await post('login', { email: seller.usuario.correo, password }).expect(401);
      await post('refresh', { refreshToken: seller.tokenRenovacion }).expect(401);
      await http()
        .get(endpoint(seller.usuario.id))
        .set('Authorization', auth)
        .expect(404);
    });
    it('rejects deletion of users with associated records', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.tokenAcceso}`;
      const target = `/api/usuarios/${seller.usuario.id}`;
      const category = await prisma.category.create({
        data: { descripcion: `Test-${randomUUID().slice(0, 8)}` },
      });
      const product = await prisma.product.create({
        data: {
          codigoBarras: `sku-${randomUUID().slice(0, 8)}`,
          nombre: 'Test',
          precioVenta: 10,
          categoriaId: category.id,
        },
      });
      const movement = await prisma.inventoryMovement.create({
        data: {
          productoId: product.id,
          tipo: 'ADJUSTMENT_IN',
          cambioExistencias: 1,
          creadoPorId: seller.usuario.id,
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
        await prisma.user.findUnique({ where: { id: seller.usuario.id } }),
      ).not.toBeNull();
      await prisma.inventoryMovement.delete({ where: { id: movement.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
      await http().delete(target).set('Authorization', auth).expect(204);
    });
    it('gets a user by id with admin authorization and returns 401/403/400/404 on invalid calls', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.tokenAcceso}`;
      const target = `/api/usuarios/${seller.usuario.id}`;

      await http().get(target).expect(401);
      await http()
        .get(target)
        .set('Authorization', `Bearer ${seller.tokenAcceso}`)
        .expect(403);
      await http()
        .get('/api/usuarios/invalid')
        .set('Authorization', auth)
        .expect(400);
      await http()
        .get(`/api/usuarios/${randomUUID()}`)
        .set('Authorization', auth)
        .expect(404);

      const res = await http()
        .get(target)
        .set('Authorization', auth)
        .expect(200);

      expect(res.body).toMatchObject({
        id: seller.usuario.id,
        nombre: seller.usuario.nombre,
        correo: seller.usuario.correo,
        activo: true,
        roles: ['VENDEDOR'],
      });
      expect(res.body.contrasena).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
    });
    it('patches user details, password, role, and protects the last admin', async () => {
      const admin = await register();
      const seller = await register();
      const auth = `Bearer ${admin.tokenAcceso}`;
      const target = `/api/usuarios/${seller.usuario.id}`;

      // 401 and 403 checks
      await http().patch(target).send({ nombre: 'X' }).expect(401);
      await http()
        .patch(target)
        .set('Authorization', `Bearer ${seller.tokenAcceso}`)
        .send({ nombre: 'X' })
        .expect(403);

      // 400 and 404 checks
      await http()
        .patch('/api/usuarios/invalid')
        .set('Authorization', auth)
        .send({ nombre: 'X' })
        .expect(400);
      await http()
        .patch(`/api/usuarios/${randomUUID()}`)
        .set('Authorization', auth)
        .send({ nombre: 'X' })
        .expect(404);

      // Update name and phone
      const res1 = await http()
        .patch(target)
        .set('Authorization', auth)
        .send({ nombre: 'Vendedor Modificado', telefono: '8111223344' })
        .expect(200);
      expect(res1.body.nombre).toBe('Vendedor Modificado');
      expect(res1.body.telefono).toBe('8111223344');

      // Reject duplicate email
      await http()
        .patch(target)
        .set('Authorization', auth)
        .send({ correo: admin.usuario.correo })
        .expect(409);

      // Update password and test login with new password
      await http()
        .patch(target)
        .set('Authorization', auth)
        .send({ contrasena: 'NuevaClaveSegura123!' })
        .expect(200);
      await post('login', {
        email: seller.usuario.correo,
        password: 'NuevaClaveSegura123!',
      }).expect(200);

      // Protect last admin from deactivation
      await http()
        .patch(`/api/usuarios/${admin.usuario.id}`)
        .set('Authorization', auth)
        .send({ activo: false })
        .expect(409);

      // Protect last admin from demotion
      const sellerRole = await prisma.role.findUniqueOrThrow({
        where: { nombre: 'VENDEDOR' },
      });
      await http()
        .patch(`/api/usuarios/${admin.usuario.id}`)
        .set('Authorization', auth)
        .send({ rolId: sellerRole.id })
        .expect(409);

      // Promote seller to admin
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { nombre: 'ADMIN' },
      });
      const res2 = await http()
        .patch(target)
        .set('Authorization', auth)
        .send({ rolId: adminRole.id })
        .expect(200);
      expect(res2.body.roles).toEqual(['ADMIN']);

      // Now original admin can be deactivated because second admin exists
      const res3 = await http()
        .patch(`/api/usuarios/${admin.usuario.id}`)
        .set('Authorization', auth)
        .send({ activo: false })
        .expect(200);
      expect(res3.body.activo).toBe(false);
    });
    it('documents all management contracts in Swagger', async () => {
      const response = await http().get('/api/docs-json').expect(200);
      for (const [path, method, statuses] of [
        ['/api/roles', 'get', ['200', '401', '403']],
        [
          '/api/usuarios/{usuarioId}/roles',
          'get',
          ['200', '400', '401', '403', '404'],
        ],
        [
          '/api/usuarios/{usuarioId}/roles',
          'put',
          ['200', '400', '401', '403', '404', '409', '422'],
        ],
        [
          '/api/usuarios/{usuarioId}/roles/{nombreRol}',
          'delete',
          ['204', '400', '401', '403', '404', '409'],
        ],
        [
          '/api/usuarios/{usuarioId}',
          'get',
          ['200', '400', '401', '403', '404'],
        ],
        [
          '/api/usuarios/{usuarioId}',
          'patch',
          ['200', '400', '401', '403', '404', '409', '422'],
        ],
        [
          '/api/usuarios/{usuarioId}',
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
        response.body.paths['/api/autenticacion/registro'].post.description,
      ).toContain('ADMIN');
    });
  });
});
