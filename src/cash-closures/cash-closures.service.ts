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
  corteAnteriorId: true,
  inicioPeriodo: true,
  fechaCierre: true,
  cerradoPor: { select: { id: true, nombre: true } },
  fondoInicial: true,
  cantidadVentas: true,
  ventasEfectivo: true,
  ventasTarjeta: true,
  ventasTransferencia: true,
  otrasVentas: true,
  reembolsosEfectivo: true,
  reembolsosTotales: true,
  cantidadGastos: true,
  gastosEfectivo: true,
  gastosTotales: true,
  ajustesEntrada: true,
  ajustesSalida: true,
  efectivoEsperado: true,
  efectivoContado: true,
  diferencia: true,
  fondoDejado: true,
  denominaciones: true,
  notas: true,
  adjustments: {
    orderBy: { posicion: 'asc' },
    select: { id: true, tipo: true, monto: true, descripcion: true },
  },
} satisfies Prisma.CashClosureSelect;
type ClosureRecord = Prisma.CashClosureGetPayload<{
  select: typeof closureSelect;
}>;

interface MoneyRow {
  id: string;
  amount: Prisma.Decimal;
}

interface Pending {
  previous: { id: string; fechaCierre: Date; fondoDejado: Prisma.Decimal } | null;
  sales: Array<MoneyRow & { metodoPago: PaymentMethod; id: string }>;
  refunds: Array<MoneyRow & { metodoPago: PaymentMethod }>;
  expenses: Array<MoneyRow & { descontarDeCaja: boolean }>;
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
      pending.sales
        .filter((sale) => sale.metodoPago === method)
        .map(({ amount }) => amount),
    );
  const cashExpenses = sum(
    pending.expenses
      .filter((expense) => expense.descontarDeCaja)
      .map(({ amount }) => amount),
  );
  return {
    openingFloat: pending.previous?.fondoDejado ?? new Prisma.Decimal(0),
    salesCount: pending.sales.length,
    bySalesMethod: {
      CASH: byMethod('CASH'),
      CARD: byMethod('CARD'),
      TRANSFER: byMethod('TRANSFER'),
      OTHER: byMethod('OTHER'),
    },
    salesTotal: sum(pending.sales.map(({ amount }) => amount)),
    cashRefunds: sum(
      pending.refunds
        .filter((refund) => refund.metodoPago === 'CASH')
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
    previousClosureId: closure.corteAnteriorId,
    periodStart: closure.inicioPeriodo?.toISOString() ?? null,
    closedAt: closure.fechaCierre.toISOString(),
    closedBy: { id: closure.cerradoPor.id, name: closure.cerradoPor.nombre },
    openingFloat: money(closure.fondoInicial),
    sales: {
      count: closure.cantidadVentas,
      cash: money(closure.ventasEfectivo),
      card: money(closure.ventasTarjeta),
      transfer: money(closure.ventasTransferencia),
      other: money(closure.otrasVentas),
      total: money(
        sum([
          closure.ventasEfectivo,
          closure.ventasTarjeta,
          closure.ventasTransferencia,
          closure.otrasVentas,
        ]),
      ),
    },
    refunds: {
      cash: money(closure.reembolsosEfectivo),
      total: money(closure.reembolsosTotales),
    },
    expenses: {
      count: closure.cantidadGastos,
      cash: money(closure.gastosEfectivo),
      total: money(closure.gastosTotales),
    },
    adjustments: closure.adjustments.map((adjustment) => ({
      id: adjustment.id,
      type: adjustment.tipo,
      amount: money(adjustment.monto),
      description: adjustment.descripcion,
    })),
    adjustmentsIn: money(closure.ajustesEntrada),
    adjustmentsOut: money(closure.ajustesSalida),
    expectedCash: money(closure.efectivoEsperado),
    denominations: closure.denominaciones as Record<string, number>,
    countedCash: money(closure.efectivoContado),
    difference: money(closure.diferencia),
    floatLeft: money(closure.fondoDejado),
    cashWithdrawn: money(closure.efectivoContado.minus(closure.fondoDejado)),
    notes: closure.notas,
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
      periodStart: pending.previous?.fechaCierre.toISOString() ?? null,
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
      posicion: position,
      tipo: adjustment.type,
      monto: new Prisma.Decimal(adjustment.amount),
      descripcion: adjustment.description.trim(),
    }));
    const adjustmentsIn = sum(
      adjustments.filter((a) => a.tipo === 'INCOME').map((a) => a.monto),
    );
    const adjustmentsOut = sum(
      adjustments.filter((a) => a.tipo === 'WITHDRAWAL').map((a) => a.monto),
    );

    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        const pending = await this.pending(tx);
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
            corteAnteriorId: pending.previous?.id ?? null,
            inicioPeriodo: pending.previous?.fechaCierre ?? null,
            fechaCierre: new Date(),
            cerradoPorId: actorId,
            fondoInicial: totals.openingFloat,
            cantidadVentas: totals.salesCount,
            ventasEfectivo: totals.bySalesMethod.CASH,
            ventasTarjeta: totals.bySalesMethod.CARD,
            ventasTransferencia: totals.bySalesMethod.TRANSFER,
            otrasVentas: totals.bySalesMethod.OTHER,
            reembolsosEfectivo: totals.cashRefunds,
            reembolsosTotales: totals.totalRefunds,
            cantidadGastos: totals.expensesCount,
            gastosEfectivo: totals.cashExpenses,
            gastosTotales: totals.totalExpenses,
            ajustesEntrada: adjustmentsIn,
            ajustesSalida: adjustmentsOut,
            efectivoEsperado: expected,
            efectivoContado: count.counted,
            diferencia: count.counted.minus(expected),
            fondoDejado: floatLeft,
            denominaciones: count.denominations,
            notas: dto.notes?.trim() || null,
            adjustments: { create: adjustments },
          },
          select: { id: true },
        });

        await tx.sale.updateMany({
          where: { id: { in: pending.sales.map(({ id }) => id) } },
          data: { corteCajaId: closure.id },
        });
        await tx.expense.updateMany({
          where: { id: { in: pending.expenses.map(({ id }) => id) } },
          data: { corteCajaId: closure.id },
        });

        return toDto(
          await tx.cashClosure.findUniqueOrThrow({
            where: { id: closure.id },
            select: closureSelect,
          }),
        );
      });
    } catch (error) {
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
            fechaCierre: {
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
        orderBy: [{ fechaCierre: 'desc' }, { id: 'desc' }],
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
    const previous = await tx.cashClosure.findFirst({
      where: { siguienteCorte: null },
      select: { id: true, fechaCierre: true, fondoDejado: true },
    });
    const [sales, refunds, expenses] = await Promise.all([
      tx.sale.findMany({
        where: { corteCajaId: null, estado: { in: ['COMPLETED', 'CANCELLED', 'REFUNDED'] } },
        select: { id: true, total: true, metodoPago: true },
      }),
      tx.sale.findMany({
        where: {
          estado: { in: ['CANCELLED', 'REFUNDED'] },
          OR: [
            { corteCajaId: null },
            ...(previous ? [{ fechaCancelacion: { gte: previous.fechaCierre } }] : []),
          ],
        },
        select: { id: true, total: true, metodoPago: true },
      }),
      tx.expense.findMany({
        where: { corteCajaId: null },
        select: { id: true, monto: true, descontarDeCaja: true },
      }),
    ]);
    return {
      previous,
      sales: sales.map((s) => ({ id: s.id, amount: s.total, metodoPago: s.metodoPago })),
      refunds: refunds.map((r) => ({ id: r.id, amount: r.total, metodoPago: r.metodoPago })),
      expenses: expenses.map((e) => ({ id: e.id, amount: e.monto, descontarDeCaja: e.descontarDeCaja })),
    };
  }
}
