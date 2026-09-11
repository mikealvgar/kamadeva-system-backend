import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

vi.mock('bcrypt', () => ({ hash: vi.fn(), compare: vi.fn() }));

describe('AuthService', () => {
  let service: AuthService;
  const user = {
    id: randomUUID(),
    name: 'Test',
    email: 'test@example.com',
    passwordHash: 'password-hash',
    isActive: true,
    roles: [],
  };
  const dto = {
    name: ' Test ',
    email: ' TEST@EXAMPLE.COM ',
    password: 'Password123!',
  };
  const payload = {
    sub: user.id,
    jti: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const hash = createHash('sha256').update('refresh-token').digest('hex');
  const record = {
    id: payload.jti,
    userId: user.id,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 3600000),
    revokedAt: null,
  };
  const users = { findByEmail: vi.fn(), findById: vi.fn(), create: vi.fn() };
  const tokens = { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() };
  const tx = {
    refreshToken: tokens,
    user: { count: vi.fn() },
    role: { findUnique: vi.fn() },
    userRole: { create: vi.fn() },
  };
  const prisma = { refreshToken: tokens, $transaction: vi.fn() };
  const jwt = { signAsync: vi.fn(), verifyAsync: vi.fn() };
  const config: Record<string, unknown> = {
    BCRYPT_ROUNDS: 12,
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRES_IN: 3600,
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    users.findByEmail.mockResolvedValue(null);
    tx.user.count.mockResolvedValue(0);
    tx.role.findUnique.mockResolvedValue({ id: 'admin-id', isActive: true });
    users.findById.mockResolvedValue(user);
    users.create.mockResolvedValue(user);
    tokens.findUnique.mockResolvedValue(record);
    tokens.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    );
    jwt.verifyAsync.mockResolvedValue(payload);
    jwt.signAsync.mockImplementation((data: { jti?: string }) =>
      Promise.resolve(data.jti ? 'refresh-token' : 'access-token'),
    );
    vi.mocked(bcrypt.hash).mockImplementation(async () => 'password-hash');
    vi.mocked(bcrypt.compare).mockImplementation(async () => true);
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: string) => config[key] },
        },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('registers normalized public data and persists only hashes in a transaction', async () => {
    const result = await service.register(dto);
    expect(result).toEqual({
      user: {
        id: expect.any(String),
        name: 'Test',
        email: user.email,
        roles: ['ADMIN'],
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
    expect(users.create).toHaveBeenCalledWith(
      {
        id: result.user.id,
        name: 'Test',
        email: user.email,
        passwordHash: 'password-hash',
      },
      tx,
    );
    expect(tokens.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: result.user.id,
        tokenHash: hash,
      }),
    });
  });
  it('assigns VENDEDOR to subsequent registrations and signs the assigned role', async () => {
    tx.user.count.mockResolvedValue(1);
    tx.role.findUnique.mockResolvedValue({ id: 'seller-id', isActive: true });
    const result = await service.register(dto);
    expect(result.user.roles).toEqual(['VENDEDOR']);
    expect(tx.role.findUnique).toHaveBeenCalledWith({
      where: { name: 'VENDEDOR' },
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: result.user.id, roleId: 'seller-id' },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['VENDEDOR'] }),
    );
  });
  it('retries serialization conflicts with a fresh user count', async () => {
    tx.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    users.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('serialization', {
        code: 'P2034',
        clientVersion: '7',
      }),
    );
    expect((await service.register(dto)).user.roles).toEqual(['VENDEDOR']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('fails without writing a user if the seed role is missing', async () => {
    tx.role.findUnique.mockResolvedValue(null);
    await expect(service.register(dto)).rejects.toThrow(
      'Rol inicial no configurado',
    );
    expect(users.create).not.toHaveBeenCalled();
  });
  it('rejects a duplicate before hashing', async () => {
    users.findByEmail.mockResolvedValue(user);
    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });
  it('maps a concurrent unique violation to conflict', async () => {
    users.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('propagates infrastructure errors', async () => {
    const error = new Error('database unavailable');
    users.create.mockRejectedValue(error);
    await expect(service.register(dto)).rejects.toBe(error);
  });
  it.each(['missing', 'inactive', 'wrong-password'])(
    'returns generic 401 for %s login',
    async (scenario) => {
      users.findByEmail.mockResolvedValue(
        scenario === 'missing'
          ? null
          : { ...user, isActive: scenario !== 'inactive' },
      );
      vi.mocked(bcrypt.compare).mockImplementation(
        async () => scenario !== 'wrong-password',
      );
      await expect(service.login(dto)).rejects.toThrow(
        'Credenciales inválidas',
      );
      expect(tokens.create).not.toHaveBeenCalled();
    },
  );
  it('includes active role names without hashes on login', async () => {
    users.findByEmail.mockResolvedValue({
      ...user,
      roles: [
        { role: { name: 'VENDEDOR', isActive: true } },
        { role: { name: 'OLD', isActive: false } },
      ],
    });
    const result = await service.login(dto);
    expect(result.user).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      roles: ['VENDEDOR'],
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      email: user.email,
      roles: ['VENDEDOR'],
    });
  });
  it('rotates and verifies with an explicit refresh secret and HS256', async () => {
    await expect(service.refresh('refresh-token')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(jwt.verifyAsync).toHaveBeenCalledWith('refresh-token', {
      secret: 'refresh-secret',
      algorithms: ['HS256'],
    });
    expect(tokens.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: payload.jti, revokedAt: null }),
      data: { revokedAt: expect.any(Date) },
    });
    expect(tokens.create).toHaveBeenCalledOnce();
  });
  it.each([
    'missing',
    'revoked',
    'expired',
    'wrong-hash',
    'wrong-user',
    'inactive',
  ])('rejects %s session', async (scenario) => {
    tokens.findUnique.mockResolvedValue(
      scenario === 'missing'
        ? null
        : {
            ...record,
            revokedAt: scenario === 'revoked' ? new Date() : null,
            expiresAt: scenario === 'expired' ? new Date(0) : record.expiresAt,
            tokenHash: scenario === 'wrong-hash' ? '0'.repeat(64) : hash,
            userId: scenario === 'wrong-user' ? randomUUID() : user.id,
          },
    );
    if (scenario === 'inactive')
      users.findById.mockResolvedValue({ ...user, isActive: false });
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects the losing request in concurrent refresh', async () => {
    tokens.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.create).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { sub: 'invalid', jti: payload.jti, exp: payload.exp },
    { ...payload, exp: undefined },
  ])('rejects malformed signed claims', async (claims) => {
    jwt.verifyAsync.mockResolvedValue(claims);
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.findUnique).not.toHaveBeenCalled();
  });
  it('handles invalid signatures as unauthorized on refresh and no-op on logout', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('signature'));
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.logout('refresh-token')).resolves.toBeUndefined();
    expect(tokens.updateMany).not.toHaveBeenCalled();
  });
  it('makes repeated logout idempotent and matches the exact session hash', async () => {
    tokens.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.logout('refresh-token')).resolves.toBeUndefined();
    expect(tokens.updateMany).toHaveBeenCalledWith({
      where: {
        id: payload.jti,
        userId: user.id,
        tokenHash: hash,
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
