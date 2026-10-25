import { Inject, Injectable } from '@nestjs/common';
import type { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteNotFoundException } from '../../domain/exceptions/quote-exceptions.js';
import {
  QUOTE_REPOSITORY_PORT,
  type QuoteQueryFilter,
  type QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';

@Injectable()
export class GetQuoteByIdUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: QuoteRepositoryPort,
  ) {}

  async execute(id: string): Promise<QuoteAggregate> {
    const quote = await this.quoteRepo.findById(id);
    if (!quote) {
      throw new QuoteNotFoundException('Cotización inexistente');
    }
    return quote;
  }
}

@Injectable()
export class ListQuotesUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: QuoteRepositoryPort,
  ) {}

  async execute(filter: QuoteQueryFilter = {}): Promise<QuoteAggregate[]> {
    if (filter.customerId) {
      await this.quoteRepo.requireCustomerExists(filter.customerId);
    }
    return this.quoteRepo.findAll(filter);
  }
}
