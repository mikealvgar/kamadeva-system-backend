import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = { user: { findUnique: vi.fn(), create: vi.fn() } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('normalizes email lookup and includes roles', async () => {
    await service.findByEmail(' TEST@EXAMPLE.COM ');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      include: { roles: { include: { role: true } } },
    });
  });
  it('normalizes user creation without returning only a bare record', async () => {
    await service.create({
      name: ' Test ',
      email: ' TEST@EXAMPLE.COM ',
      passwordHash: 'hash',
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { name: 'Test', email: 'test@example.com', passwordHash: 'hash' },
      include: { roles: { include: { role: true } } },
    });
  });
});

describe('UsersService role management', () => {
  const admin = { id: 'admin-role', name: 'ADMIN', isActive: true };
  const seller = { id: 'seller-role', name: 'VENDEDOR', isActive: true };
  const tx = {
    user: { findUnique: vi.fn(), count: vi.fn() },
    role: { findMany: vi.fn() },
    userRole: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  const service = new UsersService(prisma as unknown as PrismaService);
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.user.findUnique.mockResolvedValue({
      id: 'user',
      isActive: true,
      roles: [{ role: admin }],
    });
    tx.user.count.mockResolvedValue(2);
    tx.role.findMany.mockResolvedValue([seller]);
  });
  it('replaces all roles atomically and returns fresh public roles', async () => {
    tx.user.findUnique
      .mockResolvedValueOnce({
        id: 'user',
        isActive: true,
        roles: [{ role: admin }],
      })
      .mockResolvedValueOnce({
        id: 'user',
        isActive: true,
        roles: [{ role: seller }],
      });
    expect(await service.setUserRoles('user', ['VENDEDOR'])).toEqual({
      userId: 'user',
      roles: ['VENDEDOR'],
    });
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user' },
    });
    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user', roleId: seller.id }],
      skipDuplicates: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('returns 404 before mutations for a missing user', async () => {
    tx.user.findUnique.mockResolvedValue(null);
    await expect(
      service.setUserRoles('missing', ['VENDEDOR']),
    ).rejects.toMatchObject({ status: 404 });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });
  it('returns 422 before mutations for an inactive role', async () => {
    tx.role.findMany.mockResolvedValue([{ ...seller, isActive: false }]);
    await expect(
      service.setUserRoles('user', ['VENDEDOR']),
    ).rejects.toMatchObject({ status: 422 });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });
  it.each(['set', 'delete'])(
    'protects the last active ADMIN on %s',
    async (operation) => {
      tx.user.count.mockResolvedValue(1);
      const result =
        operation === 'set'
          ? service.setUserRoles('user', ['VENDEDOR'])
          : service.removeUserRole('user', 'ADMIN');
      await expect(result).rejects.toMatchObject({
        status: 409,
        message: 'No se puede remover el último administrador',
      });
      expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
    },
  );
  it('allows repeated assignments retaining the last ADMIN', async () => {
    tx.role.findMany.mockResolvedValue([admin]);
    tx.user.count.mockResolvedValue(1);
    for (let i = 0; i < 2; i++) {
      expect(await service.setUserRoles('user', ['ADMIN'])).toEqual({
        userId: 'user',
        roles: ['ADMIN'],
      });
    }
    expect(tx.user.count).not.toHaveBeenCalled();
  });
  it('allows deletion of an unassigned role repeatedly', async () => {
    for (let i = 0; i < 2; i++)
      await expect(
        service.removeUserRole('user', 'VENDEDOR'),
      ).resolves.toBeUndefined();
  });
  it('does not count an inactive target as an active ADMIN', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'user',
      isActive: false,
      roles: [{ role: admin }],
    });
    await service.removeUserRole('user', 'ADMIN');
    expect(tx.user.count).not.toHaveBeenCalled();
  });
});

describe('UsersService.deleteUser', () => {
  const admin = { id: 'admin-role', name: 'ADMIN', isActive: true };
  const seller = { id: 'seller-role', name: 'VENDEDOR', isActive: true };
  const tx = {
    user: { findUnique: vi.fn(), count: vi.fn(), delete: vi.fn() },
    quote: { count: vi.fn() },
    sale: { count: vi.fn() },
    payment: { count: vi.fn() },
    inventoryMovement: { count: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
    userRole: { deleteMany: vi.fn() },
    idempotencyKey: { updateMany: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  const service = new UsersService(prisma as unknown as PrismaService);
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.user.findUnique.mockResolvedValue({
      id: 'target',
      isActive: true,
      roles: [{ role: seller }],
    });
    tx.user.count.mockResolvedValue(2);
    tx.quote.count.mockResolvedValue(0);
    tx.sale.count.mockResolvedValue(0);
    tx.payment.count.mockResolvedValue(0);
    tx.inventoryMovement.count.mockResolvedValue(0);
  });
  it('deletes sessions, assignments and user in one transaction', async () => {
    await expect(
      service.deleteUser('target', 'requester'),
    ).resolves.toBeUndefined();
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target' },
    });
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target' },
    });
    expect(tx.idempotencyKey.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target' },
      data: { userId: null },
    });
    expect(tx.user.delete).toHaveBeenCalledWith({
      where: { id: 'target' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('returns 404 before mutations for a missing user', async () => {
    tx.user.findUnique.mockResolvedValue(null);
    await expect(
      service.deleteUser('missing', 'requester'),
    ).rejects.toMatchObject({ status: 404 });
    expect(tx.user.delete).not.toHaveBeenCalled();
  });
  it('returns 400 for self-deletion without touching the database', async () => {
    await expect(
      service.deleteUser('same', 'same'),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('returns 409 for the last active ADMIN', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'target',
      isActive: true,
      roles: [{ role: admin }],
    });
    tx.user.count.mockResolvedValue(1);
    await expect(
      service.deleteUser('target', 'requester'),
    ).rejects.toMatchObject({
      status: 409,
      message: 'No se puede eliminar el último administrador',
    });
    expect(tx.user.delete).not.toHaveBeenCalled();
  });
  it.each([['quote'], ['sale'], ['payment'], ['inventoryMovement']])(
    'returns 409 when the user has associated %s records',
    async (model) => {
      tx[model as 'quote'].count.mockResolvedValue(1);
      await expect(
        service.deleteUser('target', 'requester'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'El usuario tiene registros asociados y no puede eliminarse',
      });
      expect(tx.user.delete).not.toHaveBeenCalled();
      expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
    },
  );
});
