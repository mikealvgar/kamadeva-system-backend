import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DashboardService } from './dashboard.service.js';

const d = (value: string | number) => new Prisma.Decimal(value);

describe('DashboardService', () => {
  const prisma = {
    sale: { aggregate: vi.fn() },
    payment: { groupBy: vi.fn() },
    expense: { aggregate: vi.fn() },
    product: { count: vi.fn(), findMany: vi.fn() },
    inventoryMovement: { groupBy: vi.fn() },
    saleItem: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const config = { get: () => 'America/Mexico_City' };
  const service = new DashboardService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  const now = new Date('2026-10-31T05:30:00Z'); // 2026-10-30 23:30 local

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.sale.aggregate.mockResolvedValue({
      _sum: { total: d('1000.00') },
      _count: { _all: 3 },
    });
    prisma.payment.groupBy.mockResolvedValue([
      { method: 'CASH', _sum: { amount: d('700.00') } },
      { method: 'CARD', _sum: { amount: d('300.00') } },
    ]);
    prisma.expense.aggregate.mockImplementation(
      ({ where }: { where: { deductFromCash?: boolean } }) =>
        Promise.resolve({
          _sum: { amount: where.deductFromCash ? d(50) : d(80) },
        }),
    );
    prisma.product.count.mockResolvedValue(4);
    prisma.product.findMany.mockResolvedValue([
      { id: 'a', minStock: d(5) },
      { id: 'b', minStock: d(5) },
      { id: 'c', minStock: d(0) },
    ]);
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      { productId: 'a', _sum: { quantityChange: d(5) } }, // equal → low
      { productId: 'b', _sum: { quantityChange: d('5.001') } },
      // c has no movements: 0 ≤ 0 → low
    ]);
    prisma.saleItem.findMany.mockResolvedValue([
      // Snapshot wins over current cost.
      {
        quantity: d(2),
        total: d('580.00'),
        tax: d('80.00'),
        unitCost: d('100.00'),
        product: { cost: d('999.00') },
      },
      // No snapshot: falls back to current cost.
      {
        quantity: d('1.5'),
        total: d('300.00'),
        tax: d(0),
        unitCost: null,
        product: { cost: d('40.00') },
      },
      // No cost at all.
      {
        quantity: d(1),
        total: d('120.00'),
        tax: d(0),
        unitCost: null,
        product: { cost: null },
      },
    ]);
  });

  it('summarizes the local day with profit for ADMIN', async () => {
    const result = await service.summary(true, now);
    expect(result).toEqual({
      date: '2026-10-30',
      timezone: 'America/Mexico_City',
      salesToday: {
        total: '1000.00',
        count: 3,
        averageTicket: '333.33',
        byMethod: {
          CASH: '700.00',
          CARD: '300.00',
          TRANSFER: '0.00',
          OTHER: '0.00',
        },
      },
      inventory: { activeProducts: 4, lowStock: 2 },
      expensesToday: { total: '80.00', fromCash: '50.00' },
      estimatedProfitToday: {
        netSales: '920.00',
        // 2 × 100 + 1.5 × 40 + 0
        costOfGoods: '260.00',
        expenses: '80.00',
        profit: '580.00',
        costIncomplete: true,
      },
    });
    const range = {
      gte: new Date('2026-10-30T06:00:00Z'),
      lt: new Date('2026-10-31T06:00:00Z'),
    };
    expect(prisma.sale.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'COMPLETED', createdAt: range },
      }),
    );
    expect(prisma.expense.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spentAt: range } }),
    );
  });

  it('hides profit from sellers without computing it', async () => {
    const result = await service.summary(false, now);
    expect(result.estimatedProfitToday).toBeNull();
    expect(prisma.saleItem.findMany).not.toHaveBeenCalled();
  });

  it('reports zero averages and skips stock queries when nothing is tracked', async () => {
    prisma.sale.aggregate.mockResolvedValue({
      _sum: { total: null },
      _count: { _all: 0 },
    });
    prisma.payment.groupBy.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    const result = await service.summary(false, now);
    expect(result.salesToday).toMatchObject({
      total: '0.00',
      averageTicket: '0.00',
      byMethod: { CASH: '0.00' },
    });
    expect(result.inventory.lowStock).toBe(0);
    expect(prisma.inventoryMovement.groupBy).not.toHaveBeenCalled();
  });

  it('fills every day of the period, including days without data', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { day: '2026-10-27', total: d('150.5'), count: 2 },
      ])
      .mockResolvedValueOnce([{ day: '2026-10-29', total: d(20) }]);
    const result = await service.salesHistory('week', now);
    expect(result.days).toHaveLength(7);
    expect(result.days[1]).toEqual({
      date: '2026-10-27',
      salesTotal: '150.50',
      salesCount: 2,
      expensesTotal: '0.00',
    });
    expect(result.days[3]).toEqual({
      date: '2026-10-29',
      salesTotal: '0.00',
      salesCount: 0,
      expensesTotal: '20.00',
    });
  });

  it('defaults top products to the local month and rejects inverted ranges', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const result = await service.topProducts({}, now);
    expect(result).toEqual({
      startDate: '2026-10-01T06:00:00.000Z',
      endDate: now.toISOString(),
      sortBy: 'units',
      data: [],
    });
    await expect(
      service.topProducts(
        { startDate: '2026-10-02T00:00:00Z', endDate: '2026-10-01T00:00:00Z' },
        now,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
