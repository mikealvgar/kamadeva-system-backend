import { Inject, Injectable } from '@nestjs/common';
import { isValidSizeSelection } from '../../../catalog/sizes/size-selection.js';
import { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteItem } from '../../domain/entities/quote-item.entity.js';
import { QuoteCreatedEvent } from '../../domain/events/quote-events.js';
import {
  InvalidExpirationDateException,
  InvalidSizeSelectionException,
  ProductNotFoundException,
} from '../../domain/exceptions/quote-exceptions.js';
import {
  QUOTE_REPOSITORY_PORT,
  type QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../../../common/application/unit-of-work.port.js';
import {
  EVENT_PUBLISHER_PORT,
  type EventPublisherPort,
} from '../ports/event-publisher.port.js';
import {
  FOLIO_SEQUENCE_PORT,
  type FolioSequencePort,
} from '../../../common/application/folio-sequence.port.js';

export interface CreateQuoteItemCommand {
  productId: string;
  sizeId?: string;
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

let quoteCreationQueue: Promise<unknown> = Promise.resolve();

async function withQuoteCreationLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = quoteCreationQueue;
  let resolveLock: () => void;
  const current = new Promise<void>((r) => {
    resolveLock = r;
  });
  quoteCreationQueue = current;
  try {
    await previous;
  } catch {
    // Ignore error from previous operation
  }
  try {
    return await fn();
  } finally {
    resolveLock!();
  }
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
    @Inject(FOLIO_SEQUENCE_PORT)
    private readonly folioSequence: FolioSequencePort,
  ) {}

  async execute(command: CreateQuoteCommand): Promise<QuoteAggregate> {
    return withQuoteCreationLock(async () => {
      const expiresAt = parseFutureDate(command.expiresAt);

      const quote = await this.unitOfWork.execute(async (tx) => {
        await this.quoteRepo.requireCustomerExists(command.customerId, tx);

      const productIds = [
        ...new Set(command.items.map((item) => item.productId)),
      ];
      const prices = await this.quoteRepo.getProductPrices(productIds, tx);
      const sizes = await this.quoteRepo.getActiveProductSizes(productIds, tx);

      const items = command.items.map((input) => {
        const unitPrice = prices.get(input.productId);
        if (unitPrice === undefined) {
          throw new ProductNotFoundException('Producto inexistente');
        }
        if (!isValidSizeSelection(input.sizeId, sizes.get(input.productId))) {
          throw new InvalidSizeSelectionException(
            'Talla inválida para el producto',
          );
        }
        return new QuoteItem({
          productId: input.productId,
          sizeId: input.sizeId,
          quantity: input.quantity,
          unitPrice,
          discount: input.discount,
          tax: input.tax,
        });
      });

      const quoteAggregate = new QuoteAggregate({
        folio: await this.folioSequence.next('C', tx),
        customerId: command.customerId,
        createdById: command.actorId,
        notes: command.notes?.trim() || null,
        expiresAt: expiresAt ?? null,
        items,
      });

      const saved = await this.quoteRepo.save(quoteAggregate, tx);
      quoteAggregate.rawRecord = saved;
      return quoteAggregate;
    });

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
    });
  }
}
