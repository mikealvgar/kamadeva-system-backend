import { Inject, Injectable } from '@nestjs/common';
import { QuoteNotFoundException } from '../../domain/exceptions/quote-exceptions.js';
import {
  QUOTE_REPOSITORY_PORT,
  type QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../../../common/application/unit-of-work.port.js';

@Injectable()
export class DeleteQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: QuoteRepositoryPort,
    @Inject(UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(id: string): Promise<void> {
    await this.unitOfWork.execute(async (tx) => {
      const quote = await this.quoteRepo.findById(id, tx);
      if (!quote) {
        throw new QuoteNotFoundException('Cotización inexistente');
      }

      quote.assertDraft();
      await this.quoteRepo.delete(id, tx);
    });
  }
}
