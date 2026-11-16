import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { FOLIO_SEQUENCE_PORT } from '../common/application/folio-sequence.port.js';
import { UNIT_OF_WORK_PORT } from '../common/application/unit-of-work.port.js';
import { PrismaFolioSequenceAdapter } from '../common/infrastructure/prisma-folio-sequence.adapter.js';
import { PrismaUnitOfWork } from '../common/infrastructure/prisma-unit-of-work.adapter.js';
import { IDEMPOTENCY_STORE_PORT } from './application/ports/idempotency-store.port.js';
import { INVENTORY_QUERY_PORT } from './application/ports/inventory-query.port.js';
import { SALE_CATALOG_PORT } from './application/ports/sale-catalog.port.js';
import { SALE_QUERY_PORT } from './application/ports/sale-query.port.js';
import { SALE_REPOSITORY_PORT } from './application/ports/sale-repository.port.js';
import { CancelSaleUseCase } from './application/use-cases/cancel-sale.use-case.js';
import { CreateSaleUseCase } from './application/use-cases/create-sale.use-case.js';
import { ReturnSaleUseCase } from './application/use-cases/return-sale.use-case.js';
import {
  GetSaleUseCase,
  ListSalesUseCase,
} from './application/use-cases/query-sales.use-case.js';
import { RegisterSaleUseCase } from './application/use-cases/register-sale.use-case.js';
import { PrismaIdempotencyStore } from './infrastructure/prisma-idempotency.store.js';
import { PrismaInventoryQueryAdapter } from './infrastructure/prisma-inventory-query.adapter.js';
import { PrismaSaleCatalogAdapter } from './infrastructure/prisma-sale-catalog.adapter.js';
import { PrismaSaleQueryAdapter } from './infrastructure/prisma-sale-query.adapter.js';
import { PrismaSaleRepository } from './infrastructure/prisma-sale.repository.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [AuthModule, CustomersModule],
  controllers: [SalesController],
  providers: [
    SalesService,
    RegisterSaleUseCase,
    CreateSaleUseCase,
    CancelSaleUseCase,
    ReturnSaleUseCase,
    GetSaleUseCase,
    ListSalesUseCase,
    { provide: SALE_REPOSITORY_PORT, useClass: PrismaSaleRepository },
    { provide: INVENTORY_QUERY_PORT, useClass: PrismaInventoryQueryAdapter },
    { provide: SALE_CATALOG_PORT, useClass: PrismaSaleCatalogAdapter },
    { provide: SALE_QUERY_PORT, useClass: PrismaSaleQueryAdapter },
    { provide: IDEMPOTENCY_STORE_PORT, useClass: PrismaIdempotencyStore },
    { provide: FOLIO_SEQUENCE_PORT, useClass: PrismaFolioSequenceAdapter },
    { provide: UNIT_OF_WORK_PORT, useClass: PrismaUnitOfWork },
  ],
  // Quotes reuse the registration path and the "already converted" check.
  exports: [RegisterSaleUseCase, SALE_REPOSITORY_PORT],
})
export class SalesModule {}
