import { Inject, Injectable } from '@nestjs/common';
import { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteItem } from '../../domain/entities/quote-item.entity.js';
import { QuoteCreatedEvent } from '../../domain/events/quote-events.js';
import {
  InvalidExpirationDateException,
  ProductNotFoundException,
} from '../../domain/exceptions/quote-exceptions.js';
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

export interface CreateQuoteItemCommand {
  productId: string;
  quantity: number;
  discount?: number;
  tax?: number;
}

export interface CreateQuoteCommand {
  customerId: string;
  items: CreateQuoteItemCommand[];
  notes?: string;
  expiresAt?: string;
  actorId: string;
}

function parseFutureDate(value?: string): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
    throw new InvalidExpirationDateException(
      'La fecha de expiración debe ser futura',
    );
  }
  return date;
}

@Injectable()
export class CreateQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: QuoteRepositoryPort,
    @Inject(UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(command: CreateQuoteCommand): Promise<QuoteAggregate> {
    const expiresAt = parseFutureDate(command.expiresAt);

    const quote = await this.unitOfWork.execute(async (tx) => {
      await this.quoteRepo.requireCustomerExists(command.customerId, tx);

      const productIds = [
        ...new Set(command.items.map((item) => item.productId)),
      ];
      const prices = await this.quoteRepo.getProductPrices(productIds, tx);

      const items = command.items.map((input) => {
        const unitPrice = prices.get(input.productId);
        if (unitPrice === undefined) {
          throw new ProductNotFoundException('Producto inexistente');
        }
        return new QuoteItem({
          productId: input.productId,
          quantity: input.quantity,
          unitPrice,
          discount: input.discount,
          tax: input.tax,
        });
      });

      const quoteAggregate = new QuoteAggregate({
        customerId: command.customerId,
        createdById: command.actorId,
        notes: command.notes?.trim() || null,
        expiresAt: expiresAt ?? null,
        items,
      });

      const saved = await this.quoteRepo.save(quoteAggregate, tx);
      quoteAggregate.rawRecord = saved;
      return quoteAggregate;
    }, true);

    await this.eventPublisher.publish(
      new QuoteCreatedEvent(
        quote.id,
        quote.folio.toString(),
        quote.customerId,
        quote.createdById ?? '',
        quote.total.toString(),
        quote.expiresAt ? quote.expiresAt.toISOString() : null,
      ),
    );

    return quote;
  }
}
