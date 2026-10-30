import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CashClosureInputError,
  countCash,
  expectedCash,
} from './cash-closure.calculator.js';
import { CashClosuresService } from './cash-closures.service.js';

const d = (value: string | number) => new Prisma.Decimal(value);

describe('cash closure calculator', () => {
  it('counts every denomination exactly and fills missing keys with zero', () => {
    const result = countCash({ '1000': 2, '500': 4, '20': 15, '0.5': 3 });
    expect(result.counted.toFixed(2)).toBe('4301.50');
    expect(result.denominations).toEqual({
      '1000': 2,
      '500': 4,
      '200': 0,
      '100': 0,
      '50': 0,
      '20': 15,
      '10': 0,
      '5': 0,
      '2': 0,
      '1': 0,
      '0.5': 3,
    });
    expect(countCash({}).counted.toFixed(2)).toBe('0.00');
  });

  it.each([
    [{ '3': 1 }, 'Denominación no permitida: 3'],
    [{ '0.50': 1 }, 'Denominación no permitida: 0.50'],
    [{ '100': -1 }, 'Cantidad inválida para la denominación 100'],
    [{ '100': 1.5 }, 'Cantidad inválida para la denominación 100'],
    [{ '100': '2' }, 'Cantidad inválida para la denominación 100'],
    [{ '100': 100001 }, 'Cantidad inválida para la denominación 100'],
  ])('rejects %o', (input, message) => {
    expect(() => countCash(input)).toThrow(CashClosureInputError);
    expect(() => countCash(input)).toThrow(message);
  });

  it('computes expected cash from every flow', () => {
    expect(
      expectedCash({
        openingFloat: d(500),
        cashSales: d('3000.10'),
        cashRefunds: d(100),
        cashExpenses: d(355),
        adjustmentsIn: d(50),
        adjustmentsOut: d(200),
      }).toFixed(2),
    ).toBe('2895.10');
  });
});

describe('CashClosuresService', () => {
  const now = new Date('2026-10-30T20:00:00Z');
  const previousClosedAt = new Date('2026-10-29T20:00:00Z');
  const tx = {
    cashClosure: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    payment: { findMany: vi.fn(), updateMany: vi.fn() },
    expense: { findMany: vi.fn(), updateMany: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  const service = new CashClosuresService(prisma as unknown as PrismaService);
  const stored = {
    id: 'closure',
    previousClosureId: 'previous',
    periodStart: previousClosedAt,
    closedAt: now,
    closedBy: { id: 'actor', name: 'Carlos' },
    openingFloat: d(500),
    salesCount: 2,
    cashSales: d(300),
    cardSales: d(150),
    transferSales: d(0),
    otherSales: d(0),
    cashRefunds: d(100),
    totalRefunds: d(100),
    expensesCount: 2,
    cashExpenses: d(50),
    totalExpenses: d(80),
    adjustmentsIn: d(20),
    adjustmentsOut: d(10),
    expectedCash: d(660),
    countedCash: d(650),
    difference: d(-10),
    floatLeft: d(500),
    denominations: { '500': 1, '100': 1, '50': 1 },
    notes: null,
    adjustments: [],
  };
  const dto = {
    previousClosureId: 'previous',
    denominations: { '500': 1, '100': 1, '50': 1 },
    adjustments: [
      { type: 'INCOME' as const, amount: 20, description: ' Propina ' },
      { type: 'WITHDRAWAL' as const, amount: 10, description: 'Mensajero' },
    ],
    floatLeft: 500,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.cashClosure.findFirst.mockResolvedValue({
      id: 'previous',
      closedAt: previousClosedAt,
      floatLeft: d(500),
    });
    tx.payment.findMany.mockImplementation(
      ({ where }: { where: { status: unknown } }) =>
        Promise.resolve(
          where.status === 'REFUNDED'
            ? [{ id: 'r1', amount: d(100), method: 'CASH' }]
            : [
                // Sale s1 paid in cash then cancelled; s2 by card.
                { id: 'p1', amount: d(100), method: 'CASH', saleId: 's1' },
                { id: 'p2', amount: d(200), method: 'CASH', saleId: 's1' },
                { id: 'p3', amount: d(150), method: 'CARD', saleId: 's2' },
              ],
        ),
    );
    tx.expense.findMany.mockResolvedValue([
      { id: 'e1', amount: d(50), deductFromCash: true },
      { id: 'e2', amount: d(30), deductFromCash: false },
    ]);
    tx.cashClosure.create.mockResolvedValue({ id: 'closure' });
    tx.cashClosure.findUniqueOrThrow.mockResolvedValue(stored);
  });
  afterEach(() => vi.useRealTimers());

  it('summarizes pending flows without writing', async () => {
    expect(await service.summary()).toEqual({
      previousClosureId: 'previous',
      periodStart: previousClosedAt.toISOString(),
      generatedAt: now.toISOString(),
      openingFloat: '500.00',
      sales: {
        count: 2,
        cash: '300.00',
        card: '150.00',
        transfer: '0.00',
        other: '0.00',
        total: '450.00',
      },
      refunds: { cash: '100.00', total: '100.00' },
      expenses: { count: 2, cash: '50.00', total: '80.00' },
      // 500 + 300 − 100 − 50
      expectedCash: '650.00',
    });
    expect(tx.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cashClosureId: null, status: { in: ['PAID', 'REFUNDED'] } },
      }),
    );
    expect(tx.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { refundClosureId: null, status: 'REFUNDED' },
      }),
    );
    expect(tx.cashClosure.create).not.toHaveBeenCalled();
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('starts the first closure with no float and no period start', async () => {
    tx.cashClosure.findFirst.mockResolvedValue(null);
    const summary = await service.summary();
    expect(summary).toMatchObject({
      previousClosureId: null,
      periodStart: null,
      openingFloat: '0.00',
      expectedCash: '150.00',
    });
  });

  it('stores server-computed totals and links exactly the counted rows', async () => {
    await service.close({ ...dto, notes: ' Faltó cambio ' }, 'actor');
    expect(tx.cashClosure.create.mock.calls[0]![0].data).toEqual({
      previousClosureId: 'previous',
      periodStart: previousClosedAt,
      closedAt: now,
      closedById: 'actor',
      openingFloat: d(500),
      salesCount: 2,
      cashSales: d(300),
      cardSales: d(150),
      transferSales: d(0),
      otherSales: d(0),
      cashRefunds: d(100),
      totalRefunds: d(100),
      expensesCount: 2,
      cashExpenses: d(50),
      totalExpenses: d(80),
      adjustmentsIn: d(20),
      adjustmentsOut: d(10),
      // 500 + 300 − 100 − 50 + 20 − 10
      expectedCash: d(660),
      countedCash: d(650),
      difference: d(-10),
      floatLeft: d(500),
      denominations: expect.objectContaining({ '500': 1, '100': 1, '50': 1 }),
      notes: 'Faltó cambio',
      adjustments: {
        create: [
          {
            position: 0,
            type: 'INCOME',
            amount: d(20),
            description: 'Propina',
          },
          {
            position: 1,
            type: 'WITHDRAWAL',
            amount: d(10),
            description: 'Mensajero',
          },
        ],
      },
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2', 'p3'] } },
      data: { cashClosureId: 'closure' },
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
      data: { refundClosureId: 'closure' },
    });
    expect(tx.expense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] } },
      data: { cashClosureId: 'closure' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('maps the stored closure to the public shape', async () => {
    const result = await service.close(dto, 'actor');
    expect(result).toMatchObject({
      sales: { total: '450.00' },
      expectedCash: '660.00',
      countedCash: '650.00',
      difference: '-10.00',
      cashWithdrawn: '150.00',
    });
  });

  it.each([
    ['a stale previous closure', { previousClosureId: 'other' }],
    ['a first closure when one exists', { previousClosureId: null }],
  ])('returns 409 for %s without writing', async (_label, overrides) => {
    await expect(
      service.close({ ...dto, ...overrides }, 'actor'),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Ya se registró otro corte; consulte de nuevo el resumen',
    });
    expect(tx.cashClosure.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent closure on the same previous one to 409', async () => {
    tx.cashClosure.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );
    await expect(service.close(dto, 'actor')).rejects.toMatchObject({
      status: 409,
    });
  });

  it.each([
    ['an unknown denomination', { denominations: { '7': 1 } }],
    ['a float above the count', { floatLeft: 650.01 }],
  ])(
    'returns 400 for %s before opening a transaction',
    async (_l, overrides) => {
      await expect(
        service.close({ ...dto, ...overrides }, 'actor'),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
