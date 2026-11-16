import { describe, expect, it, beforeEach } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import {
  CustomerNotFoundException,
  ProductNotFoundException,
  InvalidQuoteStateException,
} from '../../domain/exceptions/quote-exceptions.js';
import type {
  QuoteQueryFilter,
  QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';
import type { UnitOfWorkPort } from '../../../common/application/unit-of-work.port.js';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import type { DomainEvent } from '../../../common/domain/domain-event.js';
import { CreateQuoteUseCase } from './create-quote.use-case.js';
import { SendQuoteUseCase } from './send-quote.use-case.js';
import { DeleteQuoteUseCase } from './delete-quote.use-case.js';
import { UpdateQuoteUseCase } from './update-quote.use-case.js';
import type { FolioSequencePort } from '../../../common/application/folio-sequence.port.js';
import { Folio, type FolioSeries } from '../../../common/domain/folio.js';

class InMemoryQuoteRepo implements QuoteRepositoryPort {
  quotes = new Map<string, QuoteAggregate>();
  customers = new Set<string>(['cust-1']);
  productPrices = new Map<string, Prisma.Decimal>([
    ['prod-1', new Prisma.Decimal('100.00')],
    ['prod-2', new Prisma.Decimal('250.00')],
  ]);
  // prod-2 is sold in sizes; prod-1 has none.
  activeSizes = new Map<string, Set<string>>([
    ['prod-2', new Set(['size-m', 'size-g'])],
  ]);

  async findById(id: string): Promise<QuoteAggregate | null> {
    return this.quotes.get(id) ?? null;
  }

  async findAll(filter?: QuoteQueryFilter): Promise<QuoteAggregate[]> {
    let list = [...this.quotes.values()];
    if (filter?.status) {
      list = list.filter((q) => q.status === filter.status);
    }
    if (filter?.customerId) {
      list = list.filter((q) => q.customerId === filter.customerId);
    }
    return list;
  }

  async save(quote: QuoteAggregate): Promise<void> {
    this.quotes.set(quote.id, quote);
  }

  async update(quote: QuoteAggregate): Promise<void> {
    this.quotes.set(quote.id, quote);
  }

  async delete(id: string): Promise<void> {
    this.quotes.delete(id);
  }

  async requireCustomerExists(customerId: string): Promise<void> {
    if (!this.customers.has(customerId)) {
      throw new CustomerNotFoundException('Cliente inexistente');
    }
  }

  async requireProductsExist(productIds: string[]): Promise<void> {
    for (const id of productIds) {
      if (!this.productPrices.has(id)) {
        throw new ProductNotFoundException('Producto inexistente');
      }
    }
  }

  async getProductPrices(
    productIds: string[],
  ): Promise<Map<string, Prisma.Decimal>> {
    const map = new Map<string, Prisma.Decimal>();
    for (const id of productIds) {
      const price = this.productPrices.get(id);
      if (price) map.set(id, price);
    }
    return map;
  }

  async getActiveProductSizes(
    productIds: string[],
  ): Promise<Map<string, Set<string>>> {
    return new Map(
      [...this.activeSizes].filter(([id]) => productIds.includes(id)),
    );
  }
}

class InMemoryFolioSequence implements FolioSequencePort {
  counters = new Map<FolioSeries, number>();

  async next(series: FolioSeries): Promise<Folio> {
    const value = (this.counters.get(series) ?? 0) + 1;
    this.counters.set(series, value);
    return Folio.fromSequence(series, value);
  }
}

class DirectUnitOfWork implements UnitOfWorkPort {
  async execute<T>(
    work: (tx?: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return work();
  }
}

class RecordingEventPublisher implements EventPublisherPort {
  events: DomainEvent[] = [];

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    this.events.push(event);
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

describe('Application Layer: Quote Use Cases', () => {
  let repo: InMemoryQuoteRepo;
  let uow: DirectUnitOfWork;
  let events: RecordingEventPublisher;
  let folios: InMemoryFolioSequence;

  beforeEach(() => {
    repo = new InMemoryQuoteRepo();
    uow = new DirectUnitOfWork();
    events = new RecordingEventPublisher();
    folios = new InMemoryFolioSequence();
  });

  it('CreateQuoteUseCase creates quote, calculates totals from catalog, and publishes event', async () => {
    const useCase = new CreateQuoteUseCase(repo, uow, events, folios);

    const quote = await useCase.execute({
      customerId: 'cust-1',
      actorId: 'user-1',
      items: [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', sizeId: 'size-m', quantity: 1, discount: 20 },
      ],
    });

    expect(quote.id).toBeDefined();
    expect(quote.items.map((item) => item.sizeId)).toEqual([null, 'size-m']);
    expect(quote.status).toBe('DRAFT');
    expect(quote.subtotal.toString()).toBe('450.00');
    expect(quote.discount.toString()).toBe('20.00');
    expect(quote.total.toString()).toBe('430.00');

    expect(events.events).toHaveLength(1);
    expect(events.events[0].eventName).toBe('quote.created');
  });

  it('CreateQuoteUseCase throws if customer does not exist', async () => {
    const useCase = new CreateQuoteUseCase(repo, uow, events, folios);

    await expect(
      useCase.execute({
        customerId: 'non-existent',
        actorId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
      }),
    ).rejects.toThrow(CustomerNotFoundException);
  });

  it('CreateQuoteUseCase throws if product does not exist in catalog', async () => {
    const useCase = new CreateQuoteUseCase(repo, uow, events, folios);

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        actorId: 'user-1',
        items: [{ productId: 'unknown-prod', quantity: 1 }],
      }),
    ).rejects.toThrow(ProductNotFoundException);
  });

  it('SendQuoteUseCase transitions quote to SENT and publishes event', async () => {
    const createUC = new CreateQuoteUseCase(repo, uow, events, folios);
    const sendUC = new SendQuoteUseCase(repo, uow, events);

    const quote = await createUC.execute({
      customerId: 'cust-1',
      actorId: 'user-1',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });

    const sent = await sendUC.execute(quote.id);
    expect(sent.status).toBe('SENT');
    expect(events.events.some((e) => e.eventName === 'quote.sent')).toBe(true);
  });

  it('DeleteQuoteUseCase deletes draft quotes, but rejects sent quotes', async () => {
    const createUC = new CreateQuoteUseCase(repo, uow, events, folios);
    const sendUC = new SendQuoteUseCase(repo, uow, events);
    const deleteUC = new DeleteQuoteUseCase(repo, uow);

    const quote = await createUC.execute({
      customerId: 'cust-1',
      actorId: 'user-1',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });

    await sendUC.execute(quote.id);
    await expect(deleteUC.execute(quote.id)).rejects.toThrow(
      InvalidQuoteStateException,
    );
  });

  it('CreateQuoteUseCase accepts items with or without size', async () => {
    const useCase = new CreateQuoteUseCase(repo, uow, events, folios);
    const quote = await useCase.execute({
      customerId: 'cust-1',
      actorId: 'user-1',
      items: [
        { productId: 'prod-2', quantity: 1 },
        { productId: 'prod-2', sizeId: 'size-xl', quantity: 1 },
        { productId: 'prod-1', sizeId: 'size-m', quantity: 1 },
      ],
    });
    expect(quote.items).toHaveLength(3);
    expect(quote.items[0].sizeId).toBeNull();
    expect(quote.items[1].sizeId).toBe('size-xl');
    expect(quote.items[2].sizeId).toBe('size-m');
  });

  it('UpdateQuoteUseCase updates items and keeps the selected size', async () => {
    const createUC = new CreateQuoteUseCase(repo, uow, events, folios);
    const updateUC = new UpdateQuoteUseCase(repo, uow);
    const quote = await createUC.execute({
      customerId: 'cust-1',
      actorId: 'user-1',
      items: [{ productId: 'prod-1', quantity: 1 }],
    });

    const updated = await updateUC.execute(quote.id, {
      items: [{ productId: 'prod-2', sizeId: 'size-g', quantity: 2 }],
    });
    expect(updated.items.map((item) => item.sizeId)).toEqual(['size-g']);
  });
});
