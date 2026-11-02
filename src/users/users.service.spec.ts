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
      include: { rol: true },
    });
  });

  it('normalizes user creation without returning only a bare record', async () => {
    await service.create({
      nombre: ' Test ',
      email: ' TEST@EXAMPLE.COM ',
      passwordHash: 'hash',
      rolId: 'role-123',
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        id: undefined,
        nombre: 'Test',
        email: 'test@example.com',
        passwordHash: 'hash',
        telefono: null,
        rolId: 'role-123',
        activo: true,
      },
      include: { rol: true },
    });
  });
});

describe('UsersService role management', () => {
  const admin = { id: 'admin-role', nombre: 'ADMIN', descripcion: null, activo: true };
  const seller = { id: 'seller-role', nombre: 'VENDEDOR', descripcion: null, activo: true };
  const tx = {
    user: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    role: { findUnique: vi.fn(), findMany: vi.fn() },
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
      activo: true,
      rol: admin,
    });
    tx.user.count.mockResolvedValue(2);
    tx.role.findUnique.mockResolvedValue(seller);
    tx.role.findMany.mockResolvedValue([seller]);
    tx.user.update.mockResolvedValue({
      id: 'user',
      activo: true,
      rolId: seller.id,
    });
  });

  it('replaces all roles atomically and returns fresh public roles', async () => {
    tx.user.findUnique
      .mockResolvedValueOnce({
        id: 'user',
        activo: true,
        rol: admin,
      })
      .mockResolvedValueOnce({
        id: 'user',
        activo: true,
        rol: seller,
      });

    expect(await service.setUserRoles('user', ['VENDEDOR'])).toEqual({
      usuarioId: 'user',
      roles: ['VENDEDOR'],
    });
    expect(tx.role.findUnique).toHaveBeenCalledWith({
      where: { nombre: 'VENDEDOR' },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user' },
      data: { rolId: seller.id },
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
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('returns 422 before mutations for an inactive role', async () => {
    tx.role.findUnique.mockResolvedValue({ ...seller, activo: false });
    tx.role.findMany.mockResolvedValue([{ ...seller, activo: false }]);
    await expect(
      service.setUserRoles('user', ['VENDEDOR']),
    ).rejects.toMatchObject({ status: 422 });
    expect(tx.user.update).not.toHaveBeenCalled();
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
      expect(tx.user.update).not.toHaveBeenCalled();
    },
  );

  it('allows repeated assignments retaining the last ADMIN', async () => {
    tx.role.findUnique.mockResolvedValue(admin);
    tx.role.findMany.mockResolvedValue([admin]);
    tx.user.count.mockResolvedValue(1);
    for (let i = 0; i < 2; i++) {
      expect(await service.setUserRoles('user', ['ADMIN'])).toEqual({
        usuarioId: 'user',
        roles: ['ADMIN'],
      });
    }
    expect(tx.user.count).not.toHaveBeenCalled();
  });

  it('allows deletion of an unassigned role repeatedly', async () => {
    tx.role.findUnique.mockResolvedValue(seller);
    for (let i = 0; i < 2; i++) {
      await expect(
        service.removeUserRole('user', 'VENDEDOR'),
      ).resolves.toBeUndefined();
    }
  });

  it('does not count an inactive target as an active ADMIN', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'user',
      activo: false,
      rol: admin,
    });
    tx.role.findUnique.mockResolvedValue(seller);
    await service.removeUserRole('user', 'ADMIN');
    expect(tx.user.count).not.toHaveBeenCalled();
  });
});

describe('UsersService.deleteUser', () => {
  const admin = { id: 'admin-role', nombre: 'ADMIN', descripcion: null, activo: true };
  const seller = { id: 'seller-role', nombre: 'VENDEDOR', descripcion: null, activo: true };
  const tx = {
    user: { findUnique: vi.fn(), count: vi.fn(), delete: vi.fn() },
    quote: { count: vi.fn() },
    sale: { count: vi.fn() },
    inventoryMovement: { count: vi.fn() },
    expense: { count: vi.fn() },
    cashClosure: { count: vi.fn() },
    purchase: { count: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
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
      activo: true,
      rol: seller,
    });
    tx.user.count.mockResolvedValue(2);
    tx.quote.count.mockResolvedValue(0);
    tx.sale.count.mockResolvedValue(0);
    tx.inventoryMovement.count.mockResolvedValue(0);
    tx.expense.count.mockResolvedValue(0);
    tx.cashClosure.count.mockResolvedValue(0);
    tx.purchase.count.mockResolvedValue(0);
  });

  it('deletes sessions, assignments and user in one transaction', async () => {
    await expect(
      service.deleteUser('target', 'requester'),
    ).resolves.toBeUndefined();
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: 'target' },
    });
    expect(tx.idempotencyKey.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: 'target' },
      data: { usuarioId: null },
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
    await expect(service.deleteUser('same', 'same')).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 409 for the last active ADMIN', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'target',
      activo: true,
      rol: admin,
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

  it.each([
    ['quote'],
    ['sale'],
    ['inventoryMovement'],
    ['expense'],
    ['cashClosure'],
    ['purchase'],
  ])('returns 409 when the user has associated %s records', async (model) => {
    tx[model as 'quote'].count.mockResolvedValue(1);
    await expect(
      service.deleteUser('target', 'requester'),
    ).rejects.toMatchObject({
      status: 409,
      message: 'El usuario tiene registros asociados y no puede eliminarse',
    });
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 409 when the user cancelled sales, keeping who cancelled', async () => {
    tx.sale.count.mockImplementation(
      ({ where }: { where: { canceladoPorId?: string; creadoPorId?: string } }) =>
        Promise.resolve(where.canceladoPorId ? 1 : 0),
    );
    await expect(
      service.deleteUser('target', 'requester'),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.sale.count).toHaveBeenCalledWith({
      where: { canceladoPorId: 'target' },
    });
    expect(tx.user.delete).not.toHaveBeenCalled();
  });
});
