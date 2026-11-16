import { Inject, Injectable } from '@nestjs/common';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../../../common/application/unit-of-work.port.js';
import { SaleNotFoundException } from '../../domain/sale-exceptions.js';
import {
  SALE_QUERY_PORT,
  type SaleDetailView,
  type SaleQueryPort,
} from '../ports/sale-query.port.js';
import {
  SALE_REPOSITORY_PORT,
  type SaleRepositoryPort,
} from '../ports/sale-repository.port.js';

export interface CancelSaleCommand {
  actorId: string;
  reason: string;
}

@Injectable()
export class CancelSaleUseCase {
  constructor(
    @Inject(SALE_REPOSITORY_PORT)
    private readonly saleRepo: SaleRepositoryPort,
    @Inject(SALE_QUERY_PORT)
    private readonly saleQuery: SaleQueryPort,
    @Inject(UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  /** Repeating a cancellation returns the same sale without moving stock again. */
  execute(id: string, command: CancelSaleCommand): Promise<SaleDetailView> {
    return this.unitOfWork.execute(async (tx) => {
      const sale = await this.saleRepo.findForCancellation(id, tx);
      if (!sale) throw new SaleNotFoundException('Venta inexistente');
      if (sale.cancel(command.actorId, command.reason)) {
        await this.saleRepo.saveCancellation(sale, tx);
      }
      const detail = await this.saleQuery.findDetail(id, tx);
      if (!detail) throw new SaleNotFoundException('Venta inexistente');
      return detail;
    });
  }
}
