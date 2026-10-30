import { Inject, Injectable } from '@nestjs/common';
import { SaleNotFoundException } from '../../domain/sale-exceptions.js';
import {
  SALE_QUERY_PORT,
  type SaleDetailView,
  type SaleListFilter,
  type SalePage,
  type SaleQueryPort,
} from '../ports/sale-query.port.js';

@Injectable()
export class GetSaleUseCase {
  constructor(
    @Inject(SALE_QUERY_PORT) private readonly saleQuery: SaleQueryPort,
  ) {}

  async execute(id: string): Promise<SaleDetailView> {
    const sale = await this.saleQuery.findDetail(id);
    if (!sale) throw new SaleNotFoundException('Venta inexistente');
    return sale;
  }
}

@Injectable()
export class ListSalesUseCase {
  constructor(
    @Inject(SALE_QUERY_PORT) private readonly saleQuery: SaleQueryPort,
  ) {}

  execute(filter: SaleListFilter): Promise<SalePage> {
    return this.saleQuery.list(filter);
  }
}
