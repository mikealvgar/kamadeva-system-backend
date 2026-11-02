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
    sale: { findMany: vi.fn(), updateMany: vi.fn() },
    expense: { findMany: vi.fn(), updateMany: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  const service = new CashClosuresService(prisma as unknown as PrismaService);
  const stored = {
    id: 'closure',
    corteAnteriorId: 'previous',
    inicioPeriodo: previousClosedAt,
    fechaCierre: now,
    cerradoPor: { id: 'actor', nombre: 'Carlos' },
    fondoInicial: d(500),
    cantidadVentas: 2,
    ventasEfectivo: d(300),
    ventasTarjeta: d(150),
    ventasTransferencia: d(0),
    otrasVentas: d(0),
    reembolsosEfectivo: d(100),
    reembolsosTotales: d(100),
    cantidadGastos: 2,
    gastosEfectivo: d(50),
    gastosTotales: d(80),
    ajustesEntrada: d(20),
    ajustesSalida: d(10),
    efectivoEsperado: d(660),
    efectivoContado: d(650),
    diferencia: d(-10),
    fondoDejado: d(500),
    denominaciones: { '500': 1, '100': 1, '50': 1 },
    notas: null,
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
      fechaCierre: previousClosedAt,
      fondoDejado: d(500),
    });
    tx.sale.findMany.mockImplementation(
      ({ where }: { where: { estado?: { in?: string[] } | string; corteCajaId?: unknown } }) => {
        const isRefund =
          where.estado === 'REFUNDED' ||
          (Array.isArray(where.estado?.in) && where.corteCajaId === undefined);
        return Promise.resolve(
          isRefund
            ? [{ id: 'r1', total: d(100), metodoPago: 'CASH' }]
            : [
                { id: 's1', total: d(300), metodoPago: 'CASH' },
                { id: 's2', total: d(150), metodoPago: 'CARD' },
              ],
        );
      },
    );
    tx.expense.findMany.mockResolvedValue([
      { id: 'e1', monto: d(50), descontarDeCaja: true },
      { id: 'e2', monto: d(30), descontarDeCaja: false },
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
    expect(tx.sale.findMany).toHaveBeenCalledWith({
      where: { corteCajaId: null, estado: { in: ['COMPLETED', 'CANCELLED', 'REFUNDED'] } },
      select: { id: true, total: true, metodoPago: true },
    });
    expect(tx.sale.findMany).toHaveBeenCalledWith({
      where: {
        estado: { in: ['CANCELLED', 'REFUNDED'] },
        OR: [
          { corteCajaId: null },
          { fechaCancelacion: { gte: previousClosedAt } },
        ],
      },
      select: { id: true, total: true, metodoPago: true },
    });
    expect(tx.cashClosure.create).not.toHaveBeenCalled();
    expect(tx.sale.updateMany).not.toHaveBeenCalled();
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
      corteAnteriorId: 'previous',
      inicioPeriodo: previousClosedAt,
      fechaCierre: now,
      cerradoPorId: 'actor',
      fondoInicial: d(500),
      cantidadVentas: 2,
      ventasEfectivo: d(300),
      ventasTarjeta: d(150),
      ventasTransferencia: d(0),
      otrasVentas: d(0),
      reembolsosEfectivo: d(100),
      reembolsosTotales: d(100),
      cantidadGastos: 2,
      gastosEfectivo: d(50),
      gastosTotales: d(80),
      ajustesEntrada: d(20),
      ajustesSalida: d(10),
      // 500 + 300 − 100 − 50 + 20 − 10
      efectivoEsperado: d(660),
      efectivoContado: d(650),
      diferencia: d(-10),
      fondoDejado: d(500),
      denominaciones: expect.objectContaining({ '500': 1, '100': 1, '50': 1 }),
      notas: 'Faltó cambio',
      adjustments: {
        create: [
          {
            posicion: 0,
            tipo: 'INCOME',
            monto: d(20),
            descripcion: 'Propina',
          },
          {
            posicion: 1,
            tipo: 'WITHDRAWAL',
            monto: d(10),
            descripcion: 'Mensajero',
          },
        ],
      },
    });
    expect(tx.sale.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1', 's2'] } },
      data: { corteCajaId: 'closure' },
    });
    expect(tx.expense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] } },
      data: { corteCajaId: 'closure' },
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
