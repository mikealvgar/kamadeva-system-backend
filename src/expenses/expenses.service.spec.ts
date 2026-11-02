import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
    concepto: 'Limpieza',
    monto: new Prisma.Decimal('355.5'),
    descontarDeCaja: true,
    fechaGasto: now,
    notas: null,
    corteCajaId: null,
    fechaCreacion: now,
    fechaActualizacion: now,
    categoria: { id: 'category', nombre: 'Insumos' },
    creadoPor: { id: 'actor', nombre: 'Carlos' },
  };
  const dto = { concepto: ' Limpieza ', monto: 355.5, categoriaId: 'category' };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.expenseCategory.findUnique.mockResolvedValue({ activo: true });
    prisma.expense.create.mockResolvedValue(record);
    prisma.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
  });
  afterEach(() => vi.useRealTimers());

  it('creates with the author, defaults and exact money', async () => {
    const result = await service.create(
      { ...dto, notas: ' ', descontarDeCaja: true },
      'actor',
    );
    expect(prisma.expense.create.mock.calls[0]![0].data).toEqual({
      concepto: 'Limpieza',
      monto: new Prisma.Decimal('355.5'),
      descontarDeCaja: true,
      fechaGasto: now,
      notas: null,
      categoriaId: 'category',
      creadoPorId: 'actor',
    });
    expect(result).toMatchObject({
      id: 'expense',
      concepto: 'Limpieza',
      concept: 'Limpieza',
      monto: '355.50',
      amount: '355.50',
      descontarDeCaja: true,
      deductFromCash: true,
      fechaGasto: now.toISOString(),
      spentAt: now.toISOString(),
      categoria: { id: 'category', nombre: 'Insumos' },
      creadoPor: { id: 'actor', nombre: 'Carlos' },
    });
    await service.create(dto, 'actor');
    expect(prisma.expense.create.mock.calls[1]![0].data.descontarDeCaja).toBe(
      false,
    );
  });

  it.each([null, { activo: false }])(
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
    await service.create({ ...dto, fechaGasto: '2026-10-29T08:00:00Z' }, 'a');
    expect(prisma.expense.create.mock.calls[0]![0].data.fechaGasto).toEqual(
      new Date('2026-10-29T08:00:00Z'),
    );
    await service.create({ ...dto, fechaGasto: '2026-10-30T12:00:30Z' }, 'a');
    await expect(
      service.create({ ...dto, fechaGasto: '2026-10-30T12:05:00Z' }, 'a'),
    ).rejects.toMatchObject({
      status: 400,
      message: 'La fecha del gasto no puede ser futura',
    });
  });

  it('filters, paginates and sums the whole filter', async () => {
    prisma.expense.count.mockResolvedValue(3);
    prisma.expense.aggregate.mockResolvedValue({
      _sum: { monto: new Prisma.Decimal('1000.1') },
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
      categoriaId: 'category',
      creadoPorId: 'actor',
      descontarDeCaja: false,
      fechaGasto: {
        gte: new Date('2026-10-01T00:00:00Z'),
        lte: new Date('2026-10-31T00:00:00Z'),
      },
    };
    expect(prisma.expense.aggregate).toHaveBeenCalledWith({
      where,
      _sum: { monto: true },
    });
    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ fechaGasto: 'desc' }, { id: 'desc' }],
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
    prisma.expense.aggregate.mockResolvedValue({ _sum: { monto: null } });
    prisma.expense.findMany.mockResolvedValue([]);
    expect(await service.findAll()).toEqual({
      datos: [],
      data: [],
      total: 0,
      pagina: 1,
      page: 1,
      limite: 20,
      pageSize: 20,
      montoTotal: '0.00',
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
      where: { id: 'x', corteCajaId: null },
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
    [{ pendingClosure: 'true' as const }, { corteCajaId: null }],
    [{ pendingClosure: 'false' as const }, { corteCajaId: { not: null } }],
    [
      { cashClosureId: 'closure', pendingClosure: 'true' as const },
      { corteCajaId: 'closure' },
    ],
  ])('filters by closure %o', async (query, where) => {
    prisma.expense.count.mockResolvedValue(0);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { monto: null } });
    prisma.expense.findMany.mockResolvedValue([]);
    await service.findAll(query);
    expect(prisma.expense.count).toHaveBeenCalledWith({ where });
  });
});
