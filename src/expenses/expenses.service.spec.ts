import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExpenseCategoriesService } from './expense-categories.service.js';
import { ExpensesService } from './expenses.service.js';

const error = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('DB error', {
    code,
    clientVersion: '7.10.0',
  });

describe('ExpensesService', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const prisma = {
    expenseCategory: { findUnique: vi.fn() },
    expense: {
      create: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const service = new ExpensesService(prisma as unknown as PrismaService);
  const record = {
    id: 'expense',
    concept: 'Limpieza',
    amount: new Prisma.Decimal('355.5'),
    deductFromCash: true,
    spentAt: now,
    notes: null,
    cashClosureId: null,
    createdAt: now,
    updatedAt: now,
    category: { id: 'category', name: 'Insumos' },
    createdBy: { id: 'actor', name: 'Carlos' },
  };
  const dto = { concept: ' Limpieza ', amount: 355.5, categoryId: 'category' };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.expenseCategory.findUnique.mockResolvedValue({ isActive: true });
    prisma.expense.create.mockResolvedValue(record);
    prisma.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
  });
  afterEach(() => vi.useRealTimers());

  it('creates with the author, defaults and exact money', async () => {
    const result = await service.create(
      { ...dto, notes: ' ', deductFromCash: true },
      'actor',
    );
    expect(prisma.expense.create.mock.calls[0]![0].data).toEqual({
      concept: 'Limpieza',
      amount: new Prisma.Decimal('355.5'),
      deductFromCash: true,
      spentAt: now,
      notes: null,
      categoryId: 'category',
      createdById: 'actor',
    });
    expect(result).toEqual({
      ...record,
      amount: '355.50',
      spentAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await service.create(dto, 'actor');
    expect(prisma.expense.create.mock.calls[1]![0].data.deductFromCash).toBe(
      false,
    );
  });

  it.each([null, { isActive: false }])(
    'rejects a missing or inactive category %o',
    async (category) => {
      prisma.expenseCategory.findUnique.mockResolvedValue(category);
      await expect(service.create(dto, 'actor')).rejects.toMatchObject({
        status: 400,
        message: 'Categoría de gasto inexistente o inactiva',
      });
      expect(prisma.expense.create).not.toHaveBeenCalled();
    },
  );

  it('maps a category deleted mid-request to 400', async () => {
    prisma.expense.create.mockRejectedValue(error('P2003'));
    await expect(service.create(dto, 'actor')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('accepts past dates and a small clock skew but rejects future dates', async () => {
    await service.create({ ...dto, spentAt: '2026-10-29T08:00:00Z' }, 'a');
    expect(prisma.expense.create.mock.calls[0]![0].data.spentAt).toEqual(
      new Date('2026-10-29T08:00:00Z'),
    );
    await service.create({ ...dto, spentAt: '2026-10-30T12:00:30Z' }, 'a');
    await expect(
      service.create({ ...dto, spentAt: '2026-10-30T12:05:00Z' }, 'a'),
    ).rejects.toMatchObject({
      status: 400,
      message: 'La fecha del gasto no puede ser futura',
    });
  });

  it('filters, paginates and sums the whole filter', async () => {
    prisma.expense.count.mockResolvedValue(3);
    prisma.expense.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal('1000.1') },
    });
    prisma.expense.findMany.mockResolvedValue([record]);
    const result = await service.findAll({
      startDate: '2026-10-01T00:00:00Z',
      endDate: '2026-10-31T00:00:00Z',
      categoryId: 'category',
      createdById: 'actor',
      deductFromCash: 'false',
      page: 2,
      pageSize: 1,
    });
    const where = {
      categoryId: 'category',
      createdById: 'actor',
      deductFromCash: false,
      spentAt: {
        gte: new Date('2026-10-01T00:00:00Z'),
        lte: new Date('2026-10-31T00:00:00Z'),
      },
    };
    expect(prisma.expense.aggregate).toHaveBeenCalledWith({
      where,
      _sum: { amount: true },
    });
    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ spentAt: 'desc' }, { id: 'desc' }],
        skip: 1,
        take: 1,
      }),
    );
    expect(result).toMatchObject({
      total: 3,
      page: 2,
      pageSize: 1,
      totalAmount: '1000.10',
    });
  });

  it('defaults pagination, reports zero totals and rejects inverted ranges', async () => {
    prisma.expense.count.mockResolvedValue(0);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.expense.findMany.mockResolvedValue([]);
    expect(await service.findAll()).toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalAmount: '0.00',
    });
    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 20 }),
    );
    await expect(
      service.findAll({
        startDate: '2026-10-02T00:00:00Z',
        endDate: '2026-10-01T00:00:00Z',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('reports missing expenses on read and delete', async () => {
    prisma.expense.findUnique.mockResolvedValue(null);
    prisma.expense.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.findById('x')).rejects.toMatchObject({ status: 404 });
    await expect(service.delete('x')).rejects.toMatchObject({ status: 404 });
    prisma.expense.deleteMany.mockResolvedValue({ count: 1 });
    await expect(service.delete('x')).resolves.toBeUndefined();
    expect(prisma.expense.deleteMany).toHaveBeenLastCalledWith({
      where: { id: 'x', cashClosureId: null },
    });
  });

  it('refuses to delete an expense already counted by a cash closure', async () => {
    prisma.expense.deleteMany.mockResolvedValue({ count: 0 });
    prisma.expense.findUnique.mockResolvedValue({ id: 'x' });
    await expect(service.delete('x')).rejects.toMatchObject({
      status: 409,
      message:
        'El gasto ya está incluido en un corte de caja y no puede eliminarse',
    });
  });

  it.each([
    [{ pendingClosure: 'true' as const }, { cashClosureId: null }],
    [{ pendingClosure: 'false' as const }, { cashClosureId: { not: null } }],
    [
      { cashClosureId: 'closure', pendingClosure: 'true' as const },
      { cashClosureId: 'closure' },
    ],
  ])('filters by closure %o', async (query, where) => {
    prisma.expense.count.mockResolvedValue(0);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.expense.findMany.mockResolvedValue([]);
    await service.findAll(query);
    expect(prisma.expense.count).toHaveBeenCalledWith({ where });
  });
});

describe('ExpenseCategoriesService', () => {
  const tx = {
    expenseCategory: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  const prisma = {
    ...tx,
    expenseCategory: {
      ...tx.expenseCategory,
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const service = new ExpenseCategoriesService(
    prisma as unknown as PrismaService,
  );
  const category = { id: 'c', name: 'Servicios', isActive: true };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.expenseCategory.findFirst.mockResolvedValue(null);
    tx.expenseCategory.create.mockResolvedValue(category);
    tx.expenseCategory.update.mockResolvedValue(category);
  });

  it('trims and checks names case-insensitively in a serializable transaction', async () => {
    await expect(service.create({ name: ' Servicios ' })).resolves.toEqual(
      category,
    );
    expect(tx.expenseCategory.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'Servicios', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    tx.expenseCategory.findFirst.mockResolvedValue({ id: 'other' });
    await expect(service.create({ name: 'servicios' })).rejects.toMatchObject({
      status: 409,
      message: 'La categoría de gasto ya existe',
    });
  });

  it('excludes itself when renaming and skips the check for other fields', async () => {
    await service.update('c', { name: 'SERVICIOS' });
    expect(tx.expenseCategory.findFirst).toHaveBeenCalledWith({
      where: {
        name: { equals: 'SERVICIOS', mode: 'insensitive' },
        NOT: { id: 'c' },
      },
      select: { id: true },
    });
    tx.expenseCategory.findFirst.mockClear();
    await service.update('c', { isActive: false });
    expect(tx.expenseCategory.findFirst).not.toHaveBeenCalled();
    await expect(service.update('c', {})).rejects.toMatchObject({
      status: 400,
    });
  });

  it('lists active categories by name unless inactive are requested', async () => {
    prisma.expenseCategory.findMany.mockResolvedValue([category]);
    await service.findAll();
    expect(prisma.expenseCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
    );
    await service.findAll(true);
    expect(prisma.expenseCategory.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it.each([
    ['P2003', 409, 'La categoría de gasto tiene gastos asociados'],
    ['P2025', 404, 'Categoría de gasto inexistente'],
  ])('maps delete error %s', async (code, status, message) => {
    prisma.expenseCategory.delete.mockRejectedValue(error(code));
    await expect(service.delete('c')).rejects.toMatchObject({
      status,
      message,
    });
  });

  it('maps update races and missing reads', async () => {
    tx.expenseCategory.update.mockRejectedValue(error('P2025'));
    await expect(service.update('c', { isActive: true })).rejects.toMatchObject(
      { status: 404 },
    );
    tx.expenseCategory.update.mockRejectedValue(error('P2002'));
    await expect(service.update('c', { name: 'X' })).rejects.toMatchObject({
      status: 409,
    });
    prisma.expenseCategory.findUnique.mockResolvedValue(null);
    await expect(service.findById('c')).rejects.toMatchObject({ status: 404 });
  });
});
