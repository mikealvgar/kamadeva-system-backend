import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PaymentMethod } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import {
  CashClosureInputError,
  countCash,
  expectedCash,
  sum,
} from './cash-closure.calculator.js';
import type {
  CashClosureDto,
  CashClosurePageDto,
  CashClosureSummaryDto,
} from './dto/cash-closure.dto.js';
import type { CreateCashClosureDto } from './dto/create-cash-closure.dto.js';
import type { ListCashClosuresDto } from './dto/list-cash-closures.dto.js';

const STALE_SUMMARY = 'Ya se registró otro corte; consulte de nuevo el resumen';

const closureSelect = {
  id: true,
  previousClosureId: true,
  periodStart: true,
  closedAt: true,
  closedBy: { select: { id: true, name: true } },
  openingFloat: true,
  salesCount: true,
  cashSales: true,
  cardSales: true,
  transferSales: true,
  otherSales: true,
  cashRefunds: true,
  totalRefunds: true,
  expensesCount: true,
  cashExpenses: true,
  totalExpenses: true,
  adjustmentsIn: true,
  adjustmentsOut: true,
  expectedCash: true,
  countedCash: true,
  difference: true,
  floatLeft: true,
  denominations: true,
  notes: true,
  adjustments: {
    orderBy: { position: 'asc' },
    select: { id: true, type: true, amount: true, description: true },
  },
} satisfies Prisma.CashClosureSelect;
type ClosureRecord = Prisma.CashClosureGetPayload<{
  select: typeof closureSelect;
}>;

interface MoneyRow {
  id: string;
  amount: Prisma.Decimal;
}

/** Everything not yet counted by a closure, read in one transaction. */
interface Pending {
  previous: { id: string; closedAt: Date; floatLeft: Prisma.Decimal } | null;
  payments: Array<MoneyRow & { method: PaymentMethod; saleId: string }>;
  refunds: Array<MoneyRow & { method: PaymentMethod }>;
  expenses: Array<MoneyRow & { deductFromCash: boolean }>;
}

interface Totals {
  openingFloat: Prisma.Decimal;
  salesCount: number;
  bySalesMethod: Record<PaymentMethod, Prisma.Decimal>;
  salesTotal: Prisma.Decimal;
  cashRefunds: Prisma.Decimal;
  totalRefunds: Prisma.Decimal;
  expensesCount: number;
  cashExpenses: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
}

const money = (value: Prisma.Decimal) => value.toFixed(2);

function totalsOf(pending: Pending): Totals {
  const byMethod = (method: PaymentMethod) =>
    sum(
      pending.payments
        .filter((payment) => payment.method === method)
        .map(({ amount }) => amount),
    );
  const cashExpenses = sum(
    pending.expenses
      .filter((expense) => expense.deductFromCash)
      .map(({ amount }) => amount),
  );
  return {
    openingFloat: pending.previous?.floatLeft ?? new Prisma.Decimal(0),
    salesCount: new Set(pending.payments.map(({ saleId }) => saleId)).size,
    bySalesMethod: {
      CASH: byMethod('CASH'),
      CARD: byMethod('CARD'),
      TRANSFER: byMethod('TRANSFER'),
      OTHER: byMethod('OTHER'),
    },
    salesTotal: sum(pending.payments.map(({ amount }) => amount)),
    cashRefunds: sum(
      pending.refunds
        .filter((refund) => refund.method === 'CASH')
        .map(({ amount }) => amount),
    ),
    totalRefunds: sum(pending.refunds.map(({ amount }) => amount)),
    expensesCount: pending.expenses.length,
    cashExpenses,
    totalExpenses: sum(pending.expenses.map(({ amount }) => amount)),
  };
}

function parseDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new BadRequestException('Fecha inválida');
  return date;
}

function toDto(closure: ClosureRecord): CashClosureDto {
  return {
    id: closure.id,
    previousClosureId: closure.previousClosureId,
    periodStart: closure.periodStart?.toISOString() ?? null,
    closedAt: closure.closedAt.toISOString(),
    closedBy: closure.closedBy,
    openingFloat: money(closure.openingFloat),
    sales: {
      count: closure.salesCount,
      cash: money(closure.cashSales),
      card: money(closure.cardSales),
      transfer: money(closure.transferSales),
      other: money(closure.otherSales),
      total: money(
        sum([
          closure.cashSales,
          closure.cardSales,
          closure.transferSales,
          closure.otherSales,
        ]),
      ),
    },
    refunds: {
      cash: money(closure.cashRefunds),
      total: money(closure.totalRefunds),
    },
    expenses: {
      count: closure.expensesCount,
      cash: money(closure.cashExpenses),
      total: money(closure.totalExpenses),
    },
    adjustments: closure.adjustments.map((adjustment) => ({
      ...adjustment,
      amount: money(adjustment.amount),
    })),
    adjustmentsIn: money(closure.adjustmentsIn),
    adjustmentsOut: money(closure.adjustmentsOut),
    expectedCash: money(closure.expectedCash),
    denominations: closure.denominations as Record<string, number>,
    countedCash: money(closure.countedCash),
    difference: money(closure.difference),
    floatLeft: money(closure.floatLeft),
    cashWithdrawn: money(closure.countedCash.minus(closure.floatLeft)),
    notes: closure.notes,
  };
}

@Injectable()
export class CashClosuresService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<CashClosureSummaryDto> {
    const pending = await serializableTransaction(this.prisma, (tx) =>
      this.pending(tx),
    );
    const totals = totalsOf(pending);
    return {
      previousClosureId: pending.previous?.id ?? null,
      periodStart: pending.previous?.closedAt.toISOString() ?? null,
      generatedAt: new Date().toISOString(),
      openingFloat: money(totals.openingFloat),
      sales: {
        count: totals.salesCount,
        cash: money(totals.bySalesMethod.CASH),
        card: money(totals.bySalesMethod.CARD),
        transfer: money(totals.bySalesMethod.TRANSFER),
        other: money(totals.bySalesMethod.OTHER),
        total: money(totals.salesTotal),
      },
      refunds: {
        cash: money(totals.cashRefunds),
        total: money(totals.totalRefunds),
      },
      expenses: {
        count: totals.expensesCount,
        cash: money(totals.cashExpenses),
        total: money(totals.totalExpenses),
      },
      expectedCash: money(
        expectedCash({
          openingFloat: totals.openingFloat,
          cashSales: totals.bySalesMethod.CASH,
          cashRefunds: totals.cashRefunds,
          cashExpenses: totals.cashExpenses,
          adjustmentsIn: new Prisma.Decimal(0),
          adjustmentsOut: new Prisma.Decimal(0),
        }),
      ),
    };
  }

  async close(
    dto: CreateCashClosureDto,
    actorId: string,
  ): Promise<CashClosureDto> {
    let count: ReturnType<typeof countCash>;
    try {
      count = countCash(dto.denominations);
    } catch (error) {
      if (error instanceof CashClosureInputError)
        throw new BadRequestException(error.message);
      throw error;
    }
    const floatLeft = new Prisma.Decimal(dto.floatLeft);
    if (floatLeft.greaterThan(count.counted)) {
      throw new BadRequestException(
        'El fondo que se deja no puede superar lo contado',
      );
    }
    const adjustments = (dto.adjustments ?? []).map((adjustment, position) => ({
      position,
      type: adjustment.type,
      amount: new Prisma.Decimal(adjustment.amount),
      description: adjustment.description.trim(),
    }));
    const adjustmentsIn = sum(
      adjustments.filter((a) => a.type === 'INCOME').map((a) => a.amount),
    );
    const adjustmentsOut = sum(
      adjustments.filter((a) => a.type === 'WITHDRAWAL').map((a) => a.amount),
    );

    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        const pending = await this.pending(tx);
        // Optimistic check against the summary the cashier saw.
        if ((pending.previous?.id ?? null) !== dto.previousClosureId) {
          throw new ConflictException(STALE_SUMMARY);
        }
        const totals = totalsOf(pending);
        const expected = expectedCash({
          openingFloat: totals.openingFloat,
          cashSales: totals.bySalesMethod.CASH,
          cashRefunds: totals.cashRefunds,
          cashExpenses: totals.cashExpenses,
          adjustmentsIn,
          adjustmentsOut,
        });
        const closure = await tx.cashClosure.create({
          data: {
            previousClosureId: pending.previous?.id ?? null,
            periodStart: pending.previous?.closedAt ?? null,
            closedAt: new Date(),
            closedById: actorId,
            openingFloat: totals.openingFloat,
            salesCount: totals.salesCount,
            cashSales: totals.bySalesMethod.CASH,
            cardSales: totals.bySalesMethod.CARD,
            transferSales: totals.bySalesMethod.TRANSFER,
            otherSales: totals.bySalesMethod.OTHER,
            cashRefunds: totals.cashRefunds,
            totalRefunds: totals.totalRefunds,
            expensesCount: totals.expensesCount,
            cashExpenses: totals.cashExpenses,
            totalExpenses: totals.totalExpenses,
            adjustmentsIn,
            adjustmentsOut,
            expectedCash: expected,
            countedCash: count.counted,
            difference: count.counted.minus(expected),
            floatLeft,
            denominations: count.denominations,
            notes: dto.notes?.trim() || null,
            adjustments: { create: adjustments },
          },
          select: { id: true },
        });
        // Link exactly the rows this closure counted; anything committed
        // later stays pending for the next closure.
        await tx.payment.updateMany({
          where: { id: { in: pending.payments.map(({ id }) => id) } },
          data: { cashClosureId: closure.id },
        });
        await tx.payment.updateMany({
          where: { id: { in: pending.refunds.map(({ id }) => id) } },
          data: { refundClosureId: closure.id },
        });
        await tx.expense.updateMany({
          where: { id: { in: pending.expenses.map(({ id }) => id) } },
          data: { cashClosureId: closure.id },
        });
        return toDto(
          await tx.cashClosure.findUniqueOrThrow({
            where: { id: closure.id },
            select: closureSelect,
          }),
        );
      });
    } catch (error) {
      // Two closures chained to the same previous one.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(STALE_SUMMARY);
      throw error;
    }
  }

  async findAll(query: ListCashClosuresDto = {}): Promise<CashClosurePageDto> {
    const startDate = parseDate(query.startDate);
    const endDate = parseDate(query.endDate);
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la final',
      );
    }
    const where: Prisma.CashClosureWhereInput =
      startDate || endDate
        ? {
            closedAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {};
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [total, closures] = await this.prisma.$transaction([
      this.prisma.cashClosure.count({ where }),
      this.prisma.cashClosure.findMany({
        where,
        orderBy: [{ closedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: closureSelect,
      }),
    ]);
    return { data: closures.map(toDto), total, page, pageSize };
  }

  async findById(id: string): Promise<CashClosureDto> {
    const closure = await this.prisma.cashClosure.findUnique({
      where: { id },
      select: closureSelect,
    });
    if (!closure) throw new NotFoundException('Corte de caja inexistente');
    return toDto(closure);
  }

  private async pending(tx: Prisma.TransactionClient): Promise<Pending> {
    const amountSelect = { id: true, amount: true } as const;
    const [previous, payments, refunds, expenses] = await Promise.all([
      // The chain head: the closure no other closure follows.
      tx.cashClosure.findFirst({
        where: { nextClosure: null },
        select: { id: true, closedAt: true, floatLeft: true },
      }),
      tx.payment.findMany({
        where: { cashClosureId: null, status: { in: ['PAID', 'REFUNDED'] } },
        select: { ...amountSelect, method: true, saleId: true },
      }),
      tx.payment.findMany({
        where: { refundClosureId: null, status: 'REFUNDED' },
        select: { ...amountSelect, method: true },
      }),
      tx.expense.findMany({
        where: { cashClosureId: null },
        select: { ...amountSelect, deductFromCash: true },
      }),
    ]);
    return { previous, payments, refunds, expenses };
  }
}
