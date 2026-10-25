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
import type { UnitOfWorkPort } from '../ports/unit-of-work.port.js';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import type { DomainEvent } from '../../../common/domain/domain-event.js';
import { CreateQuoteUseCase } from './create-quote.use-case.js';
import { SendQuoteUseCase } from './send-quote.use-case.js';
import { DeleteQuoteUseCase } from './delete-quote.use-case.js';

class InMemoryQuoteRepo implements QuoteRepositoryPort {
  quotes = new Map<string, QuoteAggregate>();
  customers = new Set<string>(['cust-1']);
  productPrices = new Map<string, Prisma.Decimal>([
    ['prod-1', new Prisma.Decimal('100.00')],
    ['prod-2', new Prisma.Decimal('250.00')],
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

  beforeEach(() => {
    repo = new InMemoryQuoteRepo();
    uow = new DirectUnitOfWork();
    events = new RecordingEventPublisher();
  });

  it('CreateQuoteUseCase creates quote, calculates totals from catalog, and publishes event', async () => {
    const useCase = new CreateQuoteUseCase(repo, uow, events);

    const quote = await useCase.execute({
      customerId: 'cust-1',
      actorId: 'user-1',
      items: [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 1, discount: 20 },
      ],
    });

    expect(quote.id).toBeDefined();
    expect(quote.status).toBe('DRAFT');
    expect(quote.subtotal.toString()).toBe('450.00');
    expect(quote.discount.toString()).toBe('20.00');
    expect(quote.total.toString()).toBe('430.00');

    expect(events.events).toHaveLength(1);
    expect(events.events[0].eventName).toBe('quote.created');
  });

  it('CreateQuoteUseCase throws if customer does not exist', async () => {
    const useCase = new CreateQuoteUseCase(repo, uow, events);

    await expect(
      useCase.execute({
        customerId: 'non-existent',
        actorId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
      }),
    ).rejects.toThrow(CustomerNotFoundException);
  });

  it('CreateQuoteUseCase throws if product does not exist in catalog', async () => {
    const useCase = new CreateQuoteUseCase(repo, uow, events);

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        actorId: 'user-1',
        items: [{ productId: 'unknown-prod', quantity: 1 }],
      }),
    ).rejects.toThrow(ProductNotFoundException);
  });

  it('SendQuoteUseCase transitions quote to SENT and publishes event', async () => {
    const createUC = new CreateQuoteUseCase(repo, uow, events);
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
    const createUC = new CreateQuoteUseCase(repo, uow, events);
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
});
