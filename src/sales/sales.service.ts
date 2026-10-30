import { BadRequestException, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CancelSaleUseCase } from './application/use-cases/cancel-sale.use-case.js';
import {
  CreateSaleUseCase,
  type CreateSaleResult,
} from './application/use-cases/create-sale.use-case.js';
import {
  GetSaleUseCase,
  ListSalesUseCase,
} from './application/use-cases/query-sales.use-case.js';
import type { CancelSaleDto } from './dto/cancel-sale.dto.js';
import type { CreateSaleDto } from './dto/create-sale.dto.js';
import type { ListSalesDto } from './dto/list-sales.dto.js';
import type { SaleDetailDto, SalePageDto } from './dto/sale.dto.js';
import { handleSaleError } from './presentation/sale-error.mapper.js';

@Injectable()
export class SalesService {
  constructor(
    private readonly createSale: CreateSaleUseCase,
    private readonly cancelSale: CancelSaleUseCase,
    private readonly getSale: GetSaleUseCase,
    private readonly listSales: ListSalesUseCase,
  ) {}

  async create(
    dto: CreateSaleDto,
    idempotencyKey: string | undefined,
    actorId: string,
  ): Promise<CreateSaleResult> {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key debe ser un UUID');
    }
    try {
      return await this.createSale.execute({
        idempotencyKey: idempotencyKey.toLowerCase(),
        actorId,
        customerId: dto.customerId,
        notes: dto.notes,
        items: dto.items.map((item) => ({ ...item })),
        payment: { method: dto.payment.method, amount: dto.payment.amount },
      });
    } catch (error) {
      handleSaleError(error);
    }
  }

  async findAll(query: ListSalesDto): Promise<SalePageDto> {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    for (const date of [startDate, endDate]) {
      if (date && !Number.isFinite(date.getTime()))
        throw new BadRequestException('Fecha inválida');
    }
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la final',
      );
    }
    return this.listSales.execute({
      startDate,
      endDate,
      status: query.status,
      createdById: query.createdById,
      customerId: query.customerId,
      paymentMethod: query.paymentMethod,
      folio: query.folio,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  async findById(id: string): Promise<SaleDetailDto> {
    try {
      return await this.getSale.execute(id);
    } catch (error) {
      handleSaleError(error);
    }
  }

  async cancel(
    id: string,
    dto: CancelSaleDto,
    actorId: string,
  ): Promise<SaleDetailDto> {
    try {
      return await this.cancelSale.execute(id, {
        actorId,
        reason: dto.reason,
      });
    } catch (error) {
      handleSaleError(error);
    }
  }
}
