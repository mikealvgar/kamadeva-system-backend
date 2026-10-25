import { Inject, Injectable } from '@nestjs/common';
import type { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteSentEvent } from '../../domain/events/quote-events.js';
import { QuoteNotFoundException } from '../../domain/exceptions/quote-exceptions.js';
import {
  QUOTE_REPOSITORY_PORT,
  type QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../ports/unit-of-work.port.js';
import {
  EVENT_PUBLISHER_PORT,
  type EventPublisherPort,
} from '../ports/event-publisher.port.js';

@Injectable()
export class SendQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: QuoteRepositoryPort,
    @Inject(UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(id: string): Promise<QuoteAggregate> {
    const quote = await this.unitOfWork.execute(async (tx) => {
      const existing = await this.quoteRepo.findById(id, tx);
      if (!existing) {
        throw new QuoteNotFoundException('Cotización inexistente');
      }

      existing.send();
      const updatedRecord = await this.quoteRepo.update(existing, tx, {
        status: 'SENT',
      });
      existing.rawRecord = updatedRecord;
      return existing;
    });

    await this.eventPublisher.publish(
      new QuoteSentEvent(
        quote.id,
        quote.folio.toString(),
        quote.customerId,
        quote.total.toString(),
      ),
    );

    return quote;
  }
}
