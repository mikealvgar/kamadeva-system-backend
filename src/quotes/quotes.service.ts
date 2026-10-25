import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateQuoteDto,
  UpdateQuoteDto,
} from './dto/create-quote.dto.js';
import type { ListQuotesDto } from './dto/list-quotes.dto.js';
import type { PayQuoteDto } from './dto/pay-quote.dto.js';
import type { QuoteDto, SaleDto } from './dto/quote.dto.js';
import { quoteDto, saleDto, type QuoteRecord, type SaleRecord } from './quote-records.js';
import { CreateQuoteUseCase } from './application/use-cases/create-quote.use-case.js';
import { UpdateQuoteUseCase } from './application/use-cases/update-quote.use-case.js';
import { SendQuoteUseCase } from './application/use-cases/send-quote.use-case.js';
import { PayQuoteUseCase } from './application/use-cases/pay-quote.use-case.js';
import { DeleteQuoteUseCase } from './application/use-cases/delete-quote.use-case.js';
import {
  GetQuoteByIdUseCase,
  ListQuotesUseCase,
} from './application/use-cases/query-quotes.use-case.js';
import { PrismaQuoteRepository } from './infrastructure/repositories/prisma-quote.repository.js';
import {
  PrismaInventoryQueryAdapter,
  PrismaSaleRepository,
} from './infrastructure/repositories/prisma-sale.repository.js';
import { PrismaUnitOfWorkAdapter } from './infrastructure/adapters/prisma-unit-of-work.adapter.js';
import {
  EVENT_PUBLISHER_PORT,
  type EventPublisherPort,
} from './application/ports/event-publisher.port.js';
import { handleDomainError } from './presentation/quote-error.mapper.js';

@Injectable()
export class QuotesService {
  private readonly createQuoteUseCase: CreateQuoteUseCase;
  private readonly updateQuoteUseCase: UpdateQuoteUseCase;
  private readonly sendQuoteUseCase: SendQuoteUseCase;
  private readonly payQuoteUseCase: PayQuoteUseCase;
  private readonly deleteQuoteUseCase: DeleteQuoteUseCase;
  private readonly getQuoteByIdUseCase: GetQuoteByIdUseCase;
  private readonly listQuotesUseCase: ListQuotesUseCase;
  private readonly quoteRepo: PrismaQuoteRepository;
  private readonly saleRepo: PrismaSaleRepository;
  private readonly inventoryQuery: PrismaInventoryQueryAdapter;
  private readonly unitOfWork: PrismaUnitOfWorkAdapter;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(EVENT_PUBLISHER_PORT)
    eventPublisher?: EventPublisherPort,
  ) {
    this.quoteRepo = new PrismaQuoteRepository(this.prisma);
    this.saleRepo = new PrismaSaleRepository(this.prisma);
    this.inventoryQuery = new PrismaInventoryQueryAdapter(this.prisma);
    this.unitOfWork = new PrismaUnitOfWorkAdapter(this.prisma);
    const publisher: EventPublisherPort = eventPublisher ?? {
      publish: async () => {},
      publishAll: async () => {},
    };

    this.createQuoteUseCase = new CreateQuoteUseCase(
      this.quoteRepo,
      this.unitOfWork,
      publisher,
    );
    this.updateQuoteUseCase = new UpdateQuoteUseCase(
      this.quoteRepo,
      this.unitOfWork,
    );
    this.sendQuoteUseCase = new SendQuoteUseCase(
      this.quoteRepo,
      this.unitOfWork,
      publisher,
    );
    this.payQuoteUseCase = new PayQuoteUseCase(
      this.quoteRepo,
      this.saleRepo,
      this.inventoryQuery,
      this.unitOfWork,
      publisher,
    );
    this.deleteQuoteUseCase = new DeleteQuoteUseCase(
      this.quoteRepo,
      this.unitOfWork,
    );
    this.getQuoteByIdUseCase = new GetQuoteByIdUseCase(this.quoteRepo);
    this.listQuotesUseCase = new ListQuotesUseCase(this.quoteRepo);
  }

  async create(dto: CreateQuoteDto, actorId: string): Promise<QuoteDto> {
    try {
      const quote = await this.createQuoteUseCase.execute({
        customerId: dto.customerId,
        items: dto.items,
        notes: dto.notes,
        expiresAt: dto.expiresAt,
        actorId,
      });
      const resolved =
        (quote.rawRecord as QuoteRecord) ??
        (await this.quoteRepo.findRecordById(quote.id));
      return quoteDto(resolved!);
    } catch (err) {
      handleDomainError(err);
    }
  }

  async findAll(query: ListQuotesDto = {}): Promise<QuoteDto[]> {
    try {
      if (query.customerId) {
        await this.quoteRepo.requireCustomerExists(query.customerId);
      }
      const records = await this.quoteRepo.findAllRecords(query);
      return records.map(quoteDto);
    } catch (err) {
      handleDomainError(err);
    }
  }

  async findById(id: string): Promise<QuoteDto> {
    try {
      const record = await this.quoteRepo.findRecordById(id);
      if (!record) throw new NotFoundException('Cotización inexistente');
      return quoteDto(record);
    } catch (err) {
      handleDomainError(err);
    }
  }

  async update(id: string, dto: UpdateQuoteDto): Promise<QuoteDto> {
    try {
      const quote = await this.updateQuoteUseCase.execute(id, dto);
      const resolved =
        (quote.rawRecord as QuoteRecord) ??
        (await this.quoteRepo.findRecordById(quote.id));
      return quoteDto(resolved!);
    } catch (err) {
      handleDomainError(err);
    }
  }

  async send(id: string): Promise<QuoteDto> {
    try {
      const quote = await this.sendQuoteUseCase.execute(id);
      const resolved =
        (quote.rawRecord as QuoteRecord) ??
        (await this.quoteRepo.findRecordById(quote.id));
      return quoteDto(resolved!);
    } catch (err) {
      handleDomainError(err);
    }
  }

  async pay(id: string, dto: PayQuoteDto, actorId: string): Promise<SaleDto> {
    try {
      const sale = await this.payQuoteUseCase.execute(id, {
        amount: dto.amount,
        method: dto.method,
        actorId,
      });
      const resolved =
        (sale.rawRecord as SaleRecord) ??
        (await this.saleRepo.findRecordById(sale.id));
      return saleDto(resolved!);
    } catch (err) {
      handleDomainError(err);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.deleteQuoteUseCase.execute(id);
    } catch (err) {
      handleDomainError(err);
    }
  }
}
