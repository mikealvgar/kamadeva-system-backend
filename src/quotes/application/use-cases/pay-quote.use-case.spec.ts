import { describe, expect, it, beforeEach } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import type { DomainEvent } from '../../../common/domain/domain-event.js';
import { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteItem } from '../../domain/entities/quote-item.entity.js';
import type { SaleAggregate } from '../../../sales/domain/sale.aggregate.js';
import {
  InsufficientStockException,
  PaymentAmountMismatchException,
  QuoteExpiredException,
} from '../../domain/exceptions/quote-exceptions.js';
import type { QuoteRepositoryPort } from '../ports/quote-repository.port.js';
import type { InventoryQueryPort } from '../../../sales/application/ports/inventory-query.port.js';
import type { SaleRepositoryPort } from '../../../sales/application/ports/sale-repository.port.js';
import { RegisterSaleUseCase } from '../../../sales/application/use-cases/register-sale.use-case.js';
import type { UnitOfWorkPort } from '../../../common/application/unit-of-work.port.js';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import { PayQuoteUseCase } from './pay-quote.use-case.js';
import type { FolioSequencePort } from '../../../common/application/folio-sequence.port.js';
import { Folio, type FolioSeries } from '../../../common/domain/folio.js';

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

  async save(sale: SaleAggregate): Promise<void> {
    this.sales.set(sale.id, sale);
  }

  async existsForQuote(quoteId: string): Promise<boolean> {
    return [...this.sales.values()].some((sale) => sale.quoteId === quoteId);
  }

  async findForCancellation(): Promise<SaleAggregate | null> {
    return null;
  }

  async saveCancellation(): Promise<void> {}
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

describe('Application Layer: PayQuoteUseCase', () => {
  let quoteRepo: MockQuoteRepo;
  let saleRepo: MockSaleRepo;
  let invQuery: MockInventoryQuery;
  let uow: DirectUnitOfWork;
  let events: RecordingEventPublisher;
  let useCase: PayQuoteUseCase;
  let folios: InMemoryFolioSequence;

  beforeEach(() => {
    quoteRepo = new MockQuoteRepo();
    saleRepo = new MockSaleRepo();
    invQuery = new MockInventoryQuery();
    uow = new DirectUnitOfWork();
    events = new RecordingEventPublisher();
    folios = new InMemoryFolioSequence();
    useCase = new PayQuoteUseCase(
      quoteRepo as unknown as QuoteRepositoryPort,
      saleRepo,
      new RegisterSaleUseCase(saleRepo, invQuery, folios),
      uow,
      events,
    );
  });

  it('converts quote to sale when payment matches and stock is sufficient', async () => {
    const quote = new QuoteAggregate({
      folio: 'C-000001',
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
    expect(sale.folio.toString()).toBe('V-000001');
    expect(quote.status).toBe('CONVERTED');

    const saved = saleRepo.sales.get(sale.id)!;
    expect(saved.quoteId).toBe(quote.id);
    expect(saved.items).toHaveLength(1);
    expect(saved.payment).toMatchObject({ method: 'CASH', status: 'PAID' });
    expect(
      events.events.some((e) => e.eventName === 'quote.converted-to-sale'),
    ).toBe(true);
    expect(
      events.events.some((e) => e.eventName === 'inventory.allocated'),
    ).toBe(true);
  });

  it('rejects conversion when payment amount differs from quote total', async () => {
    const quote = new QuoteAggregate({
      folio: 'C-000001',
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
      folio: 'C-000001',
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
    expect(folios.counters.size).toBe(0);
  });

  it('rejects conversion when quote has expired', async () => {
    const quote = new QuoteAggregate({
      folio: 'C-000001',
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
