import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PaymentMethod } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  dayRange,
  monthRange,
  weekRange,
  type LocalRange,
} from './business-time.js';
import type {
  DashboardSummaryDto,
  EstimatedProfitDto,
  SalesHistoryDto,
  TopProductsDto,
  TopProductsQueryDto,
} from './dto/dashboard.dto.js';

const ZERO = new Prisma.Decimal(0);
const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];
const money = (value: Prisma.Decimal | null | undefined) =>
  (value ?? ZERO).toFixed(2);

/**
 * Timestamp columns hold UTC without a zone; compare against an explicit UTC
 * literal so results do not depend on the PostgreSQL session TimeZone.
 */
const utc = (instant: Date) =>
  Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

@Injectable()
export class DashboardService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timeZone =
      config.get<string>('BUSINESS_TIMEZONE') ?? 'America/Mexico_City';
  }

  async summary(
    includeProfit: boolean,
    now = new Date(),
  ): Promise<DashboardSummaryDto> {
    const today = dayRange(now, this.timeZone);
    const inRange = { gte: today.start, lt: today.end };
    const completedToday: Prisma.SaleWhereInput = {
      status: 'COMPLETED',
      createdAt: inRange,
    };
    const [sales, byMethod, expenses, cashExpenses, activeProducts, lowStock] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: completedToday,
          _sum: { total: true },
          _count: { _all: true },
        }),
        this.prisma.payment.groupBy({
          by: ['method'],
          where: { sale: completedToday },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: { spentAt: inRange },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: { spentAt: inRange, deductFromCash: true },
          _sum: { amount: true },
        }),
        this.prisma.product.count({ where: { isActive: true } }),
        this.lowStockCount(),
      ]);
    const salesTotal = sales._sum.total ?? ZERO;
    const count = sales._count._all;
    const methods = new Map(
      byMethod.map((row) => [row.method, row._sum.amount ?? ZERO]),
    );
    const expensesTotal = expenses._sum.amount ?? ZERO;
    return {
      date: today.days[0]!,
      timezone: this.timeZone,
      salesToday: {
        total: money(salesTotal),
        count,
        averageTicket: money(
          count === 0 ? ZERO : salesTotal.dividedBy(count).toDecimalPlaces(2),
        ),
        byMethod: Object.fromEntries(
          METHODS.map((method) => [method, money(methods.get(method))]),
        ) as Record<PaymentMethod, string>,
      },
      inventory: { activeProducts, lowStock },
      expensesToday: {
        total: money(expensesTotal),
        fromCash: money(cashExpenses._sum.amount),
      },
      estimatedProfitToday: includeProfit
        ? await this.profit(completedToday, expensesTotal)
        : null,
    };
  }

  async topProducts(
    query: TopProductsQueryDto,
    now = new Date(),
  ): Promise<TopProductsDto> {
    const startDate = query.startDate
      ? this.parse(query.startDate)
      : monthRange(now, this.timeZone).start;
    const endDate = query.endDate ? this.parse(query.endDate) : now;
    if (startDate > endDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la final',
      );
    }
    const sortBy = query.sortBy ?? 'units';
    const order =
      sortBy === 'units'
        ? Prisma.sql`units DESC, revenue DESC`
        : Prisma.sql`revenue DESC, units DESC`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        productId: string;
        units: Prisma.Decimal;
        revenue: Prisma.Decimal;
        salesCount: number;
      }>
    >`
      SELECT si."productId",
             SUM(si.quantity) AS units,
             SUM(si.total) AS revenue,
             COUNT(DISTINCT si."saleId")::int AS "salesCount"
      FROM sale_items si
      JOIN sales s ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED'
        AND s."createdAt" >= ${utc(startDate)}
        AND s."createdAt" <= ${utc(endDate)}
      GROUP BY si."productId"
      ORDER BY ${order}, si."productId"
      LIMIT ${query.limit ?? 10}`;
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map(({ productId }) => productId) } },
      select: { id: true, barcode: true, name: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      sortBy,
      data: rows.map((row) => ({
        product: byId.get(row.productId)!,
        units: new Prisma.Decimal(row.units).toFixed(3),
        revenue: money(new Prisma.Decimal(row.revenue)),
        salesCount: row.salesCount,
      })),
    };
  }

  async salesHistory(
    period: 'week' | 'month' = 'week',
    now = new Date(),
  ): Promise<SalesHistoryDto> {
    const range: LocalRange =
      period === 'week'
        ? weekRange(now, this.timeZone)
        : monthRange(now, this.timeZone);
    const day = (column: Prisma.Sql) =>
      Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${this.timeZone}, 'YYYY-MM-DD')`;
    const [sales, expenses] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ day: string; total: Prisma.Decimal; count: number }>
      >`
        SELECT ${day(Prisma.sql`"createdAt"`)} AS day,
               SUM(total) AS total,
               COUNT(*)::int AS count
        FROM sales
        WHERE status = 'COMPLETED'
          AND "createdAt" >= ${utc(range.start)}
          AND "createdAt" < ${utc(range.end)}
        GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ day: string; total: Prisma.Decimal }>>`
        SELECT ${day(Prisma.sql`"spentAt"`)} AS day, SUM(amount) AS total
        FROM expenses
        WHERE "spentAt" >= ${utc(range.start)}
          AND "spentAt" < ${utc(range.end)}
        GROUP BY 1`,
    ]);
    const salesByDay = new Map(sales.map((row) => [row.day, row]));
    const expensesByDay = new Map(expenses.map((row) => [row.day, row.total]));
    return {
      period,
      timezone: this.timeZone,
      days: range.days.map((date) => {
        const sale = salesByDay.get(date);
        const expense = expensesByDay.get(date);
        return {
          date,
          salesTotal: money(sale ? new Prisma.Decimal(sale.total) : ZERO),
          salesCount: sale?.count ?? 0,
          expensesTotal: money(expense ? new Prisma.Decimal(expense) : ZERO),
        };
      }),
    };
  }

  /** Net sales minus cost of goods (snapshot, else current cost) minus expenses. */
  private async profit(
    completedToday: Prisma.SaleWhereInput,
    expenses: Prisma.Decimal,
  ): Promise<EstimatedProfitDto> {
    const items = await this.prisma.saleItem.findMany({
      where: { sale: completedToday },
      select: {
        quantity: true,
        total: true,
        tax: true,
        unitCost: true,
        product: { select: { cost: true } },
      },
    });
    let netSales = ZERO;
    let costOfGoods = ZERO;
    let costIncomplete = false;
    for (const item of items) {
      netSales = netSales.plus(item.total.minus(item.tax));
      const cost = item.unitCost ?? item.product.cost;
      if (cost === null) costIncomplete = true;
      else costOfGoods = costOfGoods.plus(cost.times(item.quantity));
    }
    costOfGoods = costOfGoods.toDecimalPlaces(2);
    return {
      netSales: money(netSales),
      costOfGoods: money(costOfGoods),
      expenses: money(expenses),
      profit: money(netSales.minus(costOfGoods).minus(expenses)),
      costIncomplete,
    };
  }

  private async lowStockCount(): Promise<number> {
    const tracked = await this.prisma.product.findMany({
      where: { isActive: true, minStock: { not: null } },
      select: { id: true, minStock: true },
    });
    if (tracked.length === 0) return 0;
    const stock = await this.prisma.inventoryMovement.groupBy({
      by: ['productId'],
      where: { productId: { in: tracked.map(({ id }) => id) } },
      _sum: { quantityChange: true },
    });
    const byProduct = new Map(
      stock.map((row) => [row.productId, row._sum.quantityChange ?? ZERO]),
    );
    return tracked.filter((product) =>
      (byProduct.get(product.id) ?? ZERO).lessThanOrEqualTo(product.minStock!),
    ).length;
  }

  private parse(value: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
      throw new BadRequestException('Fecha inválida');
    return date;
  }
}
