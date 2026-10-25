import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';
import { CreateQuoteUseCase } from './application/use-cases/create-quote.use-case.js';
import { UpdateQuoteUseCase } from './application/use-cases/update-quote.use-case.js';
import { SendQuoteUseCase } from './application/use-cases/send-quote.use-case.js';
import { PayQuoteUseCase } from './application/use-cases/pay-quote.use-case.js';
import { DeleteQuoteUseCase } from './application/use-cases/delete-quote.use-case.js';
import {
  GetQuoteByIdUseCase,
  ListQuotesUseCase,
} from './application/use-cases/query-quotes.use-case.js';
import {
  INVENTORY_QUERY_PORT,
  QUOTE_REPOSITORY_PORT,
} from './application/ports/quote-repository.port.js';
import { SALE_REPOSITORY_PORT } from './application/ports/sale-repository.port.js';
import { UNIT_OF_WORK_PORT } from './application/ports/unit-of-work.port.js';
import { EVENT_PUBLISHER_PORT } from './application/ports/event-publisher.port.js';
import { PrismaQuoteRepository } from './infrastructure/repositories/prisma-quote.repository.js';
import {
  PrismaInventoryQueryAdapter,
  PrismaSaleRepository,
} from './infrastructure/repositories/prisma-sale.repository.js';
import { PrismaUnitOfWorkAdapter } from './infrastructure/adapters/prisma-unit-of-work.adapter.js';
import { NestEventEmitterAdapter } from './infrastructure/adapters/nest-event-emitter.adapter.js';

@Module({
  imports: [AuthModule],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    CreateQuoteUseCase,
    UpdateQuoteUseCase,
    SendQuoteUseCase,
    PayQuoteUseCase,
    DeleteQuoteUseCase,
    GetQuoteByIdUseCase,
    ListQuotesUseCase,
    PrismaQuoteRepository,
    { provide: QUOTE_REPOSITORY_PORT, useClass: PrismaQuoteRepository },
    PrismaSaleRepository,
    { provide: SALE_REPOSITORY_PORT, useClass: PrismaSaleRepository },
    PrismaInventoryQueryAdapter,
    { provide: INVENTORY_QUERY_PORT, useClass: PrismaInventoryQueryAdapter },
    PrismaUnitOfWorkAdapter,
    { provide: UNIT_OF_WORK_PORT, useClass: PrismaUnitOfWorkAdapter },
    NestEventEmitterAdapter,
    { provide: EVENT_PUBLISHER_PORT, useClass: NestEventEmitterAdapter },
  ],
  exports: [QuotesService],
})
export class QuotesModule {}
