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

const FUTURE_TOLERANCE_MS = 60_000;

const expenseSelect = {
  id: true,
  concepto: true,
  monto: true,
  descontarDeCaja: true,
  fechaGasto: true,
  notas: true,
  corteCajaId: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  categoria: { select: { id: true, nombre: true } },
  creadoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.ExpenseSelect;
type ExpenseRecord = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;

function toDto(expense: ExpenseRecord): ExpenseDto {
  return {
    id: expense.id,
    concepto: expense.concepto,
    concept: expense.concepto,
    monto: expense.monto.toFixed(2),
    amount: expense.monto.toFixed(2),
    descontarDeCaja: expense.descontarDeCaja,
    deductFromCash: expense.descontarDeCaja,
    fechaGasto: expense.fechaGasto.toISOString(),
    spentAt: expense.fechaGasto.toISOString(),
    categoria: {
      id: expense.categoria.id,
      nombre: expense.categoria.nombre,
      name: expense.categoria.nombre,
    },
    category: {
      id: expense.categoria.id,
      nombre: expense.categoria.nombre,
      name: expense.categoria.nombre,
    },
    creadoPor: {
      id: expense.creadoPor.id,
      nombre: expense.creadoPor.nombre,
      name: expense.creadoPor.nombre,
    },
    createdBy: {
      id: expense.creadoPor.id,
      nombre: expense.creadoPor.nombre,
      name: expense.creadoPor.nombre,
    },
    notas: expense.notas,
    notes: expense.notas,
    corteCajaId: expense.corteCajaId,
    cashClosureId: expense.corteCajaId,
    fechaCreacion: expense.fechaCreacion.toISOString(),
    fechaActualizacion: expense.fechaActualizacion.toISOString(),
    createdAt: expense.fechaCreacion.toISOString(),
    updatedAt: expense.fechaActualizacion.toISOString(),
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
    const rawConcept = dto.concepto ?? dto.concept;
    if (!rawConcept || !rawConcept.trim()) {
      throw new BadRequestException('El concepto del gasto es obligatorio');
    }
    const rawAmount = dto.monto ?? dto.amount;
    if (rawAmount == null || rawAmount <= 0) {
      throw new BadRequestException('El monto del gasto es obligatorio y debe ser mayor a 0');
    }
    const categoryId = dto.categoriaId ?? dto.categoryId;
    if (!categoryId) {
      throw new BadRequestException('La categoría de gasto es obligatoria');
    }

    const fechaGasto = parseDate(dto.fechaGasto ?? dto.spentAt) ?? new Date();
    if (fechaGasto.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('La fecha del gasto no puede ser futura');
    }
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: categoryId },
      select: { activo: true },
    });
    if (!category?.activo) {
      throw new BadRequestException(
        'Categoría de gasto inexistente o inactiva',
      );
    }
    try {
      const expense = await this.prisma.expense.create({
        data: {
          concepto: rawConcept.trim(),
          monto: new Prisma.Decimal(rawAmount),
          descontarDeCaja: dto.descontarDeCaja ?? dto.deductFromCash ?? false,
          fechaGasto,
          notas: (dto.notas ?? dto.notes)?.trim() || null,
          categoriaId: categoryId,
          creadoPorId: actorId,
        },
        select: expenseSelect,
      });
      return toDto(expense);
    } catch (error) {
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
    if (query.categoryId) where.categoriaId = query.categoryId;
    if (query.createdById) where.creadoPorId = query.createdById;
    if (query.deductFromCash)
      where.descontarDeCaja = query.deductFromCash === 'true';
    if (query.cashClosureId) where.corteCajaId = query.cashClosureId;
    else if (query.pendingClosure)
      where.corteCajaId =
        query.pendingClosure === 'true' ? null : { not: null };
    if (startDate || endDate)
      where.fechaGasto = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [total, sum, expenses] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { monto: true } }),
      this.prisma.expense.findMany({
        where,
        orderBy: [{ fechaGasto: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: expenseSelect,
      }),
    ]);
    const dtos = expenses.map(toDto);
    const totalAmount = sum._sum.monto?.toFixed(2) ?? '0.00';
    return {
      datos: dtos,
      data: dtos,
      total,
      pagina: page,
      page,
      limite: pageSize,
      pageSize,
      montoTotal: totalAmount,
      totalAmount,
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

  async delete(id: string): Promise<void> {
    const { count } = await this.prisma.expense.deleteMany({
      where: { id, corteCajaId: null },
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
