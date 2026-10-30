import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateExpenseDto } from './dto/create-expense.dto.js';
import type { ExpenseDto, ExpensePageDto } from './dto/expense.dto.js';
import type { ListExpensesDto } from './dto/list-expenses.dto.js';

// Tolerates small clock differences between the till and the server.
const FUTURE_TOLERANCE_MS = 60_000;

const expenseSelect = {
  id: true,
  concept: true,
  amount: true,
  deductFromCash: true,
  spentAt: true,
  notes: true,
  cashClosureId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseSelect;
type ExpenseRecord = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;

function toDto(expense: ExpenseRecord): ExpenseDto {
  return {
    id: expense.id,
    concept: expense.concept,
    amount: expense.amount.toFixed(2),
    deductFromCash: expense.deductFromCash,
    spentAt: expense.spentAt.toISOString(),
    category: expense.category,
    createdBy: expense.createdBy,
    notes: expense.notes,
    cashClosureId: expense.cashClosureId,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

function parseDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new BadRequestException('Fecha inválida');
  return date;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExpenseDto, actorId: string): Promise<ExpenseDto> {
    const spentAt = parseDate(dto.spentAt) ?? new Date();
    if (spentAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('La fecha del gasto no puede ser futura');
    }
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.categoryId },
      select: { isActive: true },
    });
    if (!category?.isActive) {
      throw new BadRequestException(
        'Categoría de gasto inexistente o inactiva',
      );
    }
    try {
      const expense = await this.prisma.expense.create({
        data: {
          concept: dto.concept.trim(),
          amount: new Prisma.Decimal(dto.amount),
          deductFromCash: dto.deductFromCash ?? false,
          spentAt,
          notes: dto.notes?.trim() || null,
          categoryId: dto.categoryId,
          createdById: actorId,
        },
        select: expenseSelect,
      });
      return toDto(expense);
    } catch (error) {
      // Category deleted between the check and the insert.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      )
        throw new BadRequestException(
          'Categoría de gasto inexistente o inactiva',
        );
      throw error;
    }
  }

  async findAll(query: ListExpensesDto = {}): Promise<ExpensePageDto> {
    const startDate = parseDate(query.startDate);
    const endDate = parseDate(query.endDate);
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la final',
      );
    }
    const where: Prisma.ExpenseWhereInput = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.createdById) where.createdById = query.createdById;
    if (query.deductFromCash)
      where.deductFromCash = query.deductFromCash === 'true';
    if (query.cashClosureId) where.cashClosureId = query.cashClosureId;
    else if (query.pendingClosure)
      where.cashClosureId =
        query.pendingClosure === 'true' ? null : { not: null };
    if (startDate || endDate)
      where.spentAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [total, sum, expenses] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
      this.prisma.expense.findMany({
        where,
        orderBy: [{ spentAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: expenseSelect,
      }),
    ]);
    return {
      data: expenses.map(toDto),
      total,
      page,
      pageSize,
      totalAmount: sum._sum.amount?.toFixed(2) ?? '0.00',
    };
  }

  async findById(id: string): Promise<ExpenseDto> {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      select: expenseSelect,
    });
    if (!expense) throw new NotFoundException('Gasto inexistente');
    return toDto(expense);
  }

  /** Expenses already counted by a cash closure are part of its audit trail. */
  async delete(id: string): Promise<void> {
    const { count } = await this.prisma.expense.deleteMany({
      where: { id, cashClosureId: null },
    });
    if (count > 0) return;
    const exists = await this.prisma.expense.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Gasto inexistente');
    throw new ConflictException(
      'El gasto ya está incluido en un corte de caja y no puede eliminarse',
    );
  }
}
