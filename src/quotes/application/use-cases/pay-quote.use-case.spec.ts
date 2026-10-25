import { describe, expect, it, beforeEach } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import type { DomainEvent } from '../../../common/domain/domain-event.js';
import { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteItem } from '../../domain/entities/quote-item.entity.js';
import type { SaleAggregate } from '../../domain/entities/sale.aggregate.js';
import {
  InsufficientStockException,
  PaymentAmountMismatchException,
  QuoteExpiredException,
} from '../../domain/exceptions/quote-exceptions.js';
import type {
  InventoryQueryPort,
  QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';
import type { SaleRepositoryPort } from '../ports/sale-repository.port.js';
import type { UnitOfWorkPort } from '../ports/unit-of-work.port.js';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import { PayQuoteUseCase } from './pay-quote.use-case.js';

class MockQuoteRepo implements Partial<QuoteRepositoryPort> {
  quotes = new Map<string, QuoteAggregate>();

  async findById(id: string): Promise<QuoteAggregate | null> {
    return this.quotes.get(id) ?? null;
  }

  async update(quote: QuoteAggregate): Promise<void> {
    this.quotes.set(quote.id, quote);
  }

  async requireProductsExist(): Promise<void> {}
}

class MockSaleRepo implements SaleRepositoryPort {
  sales = new Map<string, SaleAggregate>();
  deductions: unknown[] = [];

  async save(sale: SaleAggregate): Promise<void> {
    this.sales.set(sale.id, sale);
    this.deductions.push(
      ...sale.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
    );
  }

  async findById(id: string): Promise<SaleAggregate | null> {
    return this.sales.get(id) ?? null;
  }

  async findByQuoteId(quoteId: string): Promise<SaleAggregate | null> {
    for (const sale of this.sales.values()) {
      if (sale.quoteId === quoteId) return sale;
    }
    return null;
  }

  async recordInventoryDeductions(items: unknown[]): Promise<void> {
    this.deductions.push(...items);
  }
}

class MockInventoryQuery implements InventoryQueryPort {
  stock = new Map<string, Prisma.Decimal>([
    ['prod-1', new Prisma.Decimal('10.000')],
  ]);

  async getStockForProducts(
    productIds: string[],
  ): Promise<Map<string, Prisma.Decimal>> {
    const res = new Map<string, Prisma.Decimal>();
    for (const id of productIds) {
      res.set(id, this.stock.get(id) ?? new Prisma.Decimal(0));
    }
    return res;
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

describe('Application Layer: PayQuoteUseCase', () => {
  let quoteRepo: MockQuoteRepo;
  let saleRepo: MockSaleRepo;
  let invQuery: MockInventoryQuery;
  let uow: DirectUnitOfWork;
  let events: RecordingEventPublisher;
  let useCase: PayQuoteUseCase;

  beforeEach(() => {
    quoteRepo = new MockQuoteRepo();
    saleRepo = new MockSaleRepo();
    invQuery = new MockInventoryQuery();
    uow = new DirectUnitOfWork();
    events = new RecordingEventPublisher();
    useCase = new PayQuoteUseCase(
      quoteRepo as unknown as QuoteRepositoryPort,
      saleRepo,
      invQuery,
      uow,
      events,
    );
  });

  it('converts quote to sale when payment matches and stock is sufficient', async () => {
    const quote = new QuoteAggregate({
      customerId: 'cust-1',
      items: [
        new QuoteItem({ productId: 'prod-1', quantity: 2, unitPrice: 150 }),
      ],
    });
    quoteRepo.quotes.set(quote.id, quote);

    const sale = await useCase.execute(quote.id, {
      amount: '300.00',
      method: 'CASH',
      actorId: 'user-1',
    });

    expect(sale.id).toBeDefined();
    expect(sale.status).toBe('COMPLETED');
    expect(sale.folio.prefix).toBe('VEN');
    expect(quote.status).toBe('CONVERTED');

    expect(saleRepo.deductions).toHaveLength(1);
    expect(
      events.events.some((e) => e.eventName === 'quote.converted-to-sale'),
    ).toBe(true);
    expect(
      events.events.some((e) => e.eventName === 'inventory.allocated'),
    ).toBe(true);
  });

  it('rejects conversion when payment amount differs from quote total', async () => {
    const quote = new QuoteAggregate({
      customerId: 'cust-1',
      items: [
        new QuoteItem({ productId: 'prod-1', quantity: 1, unitPrice: 100 }),
      ],
    });
    quoteRepo.quotes.set(quote.id, quote);

    await expect(
      useCase.execute(quote.id, {
        amount: '50.00',
        method: 'CASH',
        actorId: 'user-1',
      }),
    ).rejects.toThrow(PaymentAmountMismatchException);
  });

  it('rejects conversion when stock is insufficient', async () => {
    const quote = new QuoteAggregate({
      customerId: 'cust-1',
      items: [
        new QuoteItem({ productId: 'prod-1', quantity: 50, unitPrice: 10 }),
      ],
    });
    quoteRepo.quotes.set(quote.id, quote);

    await expect(
      useCase.execute(quote.id, {
        amount: '500.00',
        method: 'CARD',
        actorId: 'user-1',
      }),
    ).rejects.toThrow(InsufficientStockException);
  });

  it('rejects conversion when quote has expired', async () => {
    const quote = new QuoteAggregate({
      customerId: 'cust-1',
      expiresAt: new Date(Date.now() - 3600000),
      items: [
        new QuoteItem({ productId: 'prod-1', quantity: 1, unitPrice: 10 }),
      ],
    });
    quoteRepo.quotes.set(quote.id, quote);

    await expect(
      useCase.execute(quote.id, {
        amount: '10.00',
        method: 'TRANSFER',
        actorId: 'user-1',
      }),
    ).rejects.toThrow(QuoteExpiredException);
  });
});
