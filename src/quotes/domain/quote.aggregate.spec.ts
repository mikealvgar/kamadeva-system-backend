import { describe, expect, it } from 'vitest';
import { QuoteAggregate } from './entities/quote.aggregate.js';
import { QuoteItem } from './entities/quote-item.entity.js';
import { Money, Quantity } from '../../common/domain/money.js';
import { Folio } from '../../common/domain/folio.js';
import {
  InvalidAmountException,
  InvalidQuoteStateException,
  QuoteExpiredException,
  QuoteNotPayableException,
} from './exceptions/quote-exceptions.js';

describe('Pure Domain Core: QuoteAggregate & Value Objects', () => {
  describe('Value Objects', () => {
    it('creates Money with exact 2 decimal places and rounding', () => {
      const m1 = new Money(100.504);
      expect(m1.toString()).toBe('100.50');

      const m2 = new Money(100.505);
      expect(m2.toString()).toBe('100.51');
    });

    it('rejects negative Money or amounts exceeding max limit', () => {
      expect(() => new Money(-1)).toThrow(InvalidAmountException);
      expect(() => new Money('10000000000.00')).toThrow(InvalidAmountException);
    });

    it('creates Quantity with exact 3 decimal places', () => {
      const q = new Quantity('2.5');
      expect(q.toString()).toBe('2.500');
    });

    it('formats sequential folios and accepts legacy ones', () => {
      expect(Folio.fromSequence('C', 45).toString()).toBe('C-000045');
      expect(Folio.fromSequence('V', 1234567).toString()).toBe('V-1234567');
      expect(Folio.fromSequence('V', 1).series).toBe('V');
      expect(new Folio('COT-20260920-AB12CD').series).toBe('C');
      expect(new Folio('VEN-20260920-AB12CD').series).toBe('V');

      for (const value of ['INVALID-FOLIO', 'C-12345', 'X-000001', 'c-000001'])
        expect(() => new Folio(value)).toThrow();
      for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
        expect(() => Folio.fromSequence('C', value)).toThrow();
    });
  });

  describe('QuoteItem arithmetic', () => {
    it('computes subtotal, tax, discount and total accurately', () => {
      const item = new QuoteItem({
        productId: 'prod-1',
        quantity: '2.5',
        unitPrice: '1000.00',
        discount: '100.00',
        tax: '240.00',
      });

      expect(item.subtotal.toString()).toBe('2500.00');
      expect(item.discount.toString()).toBe('100.00');
      expect(item.tax.toString()).toBe('240.00');
      expect(item.total.toString()).toBe('2640.00');
    });
  });

  describe('QuoteAggregate Lifecycle & Calculations', () => {
    it('aggregates multiple line items into correct quote totals', () => {
      const item1 = new QuoteItem({
        productId: 'prod-1',
        quantity: '1',
        unitPrice: '500.00',
      });
      const item2 = new QuoteItem({
        productId: 'prod-2',
        quantity: '2',
        unitPrice: '250.00',
        discount: '50.00',
        tax: '40.00',
      });

      const quote = new QuoteAggregate({
        folio: 'C-000001',
        customerId: 'cust-1',
        items: [item1, item2],
      });

      expect(quote.status).toBe('DRAFT');
      expect(quote.subtotal.toString()).toBe('1000.00');
      expect(quote.discount.toString()).toBe('50.00');
      expect(quote.tax.toString()).toBe('40.00');
      expect(quote.total.toString()).toBe('990.00');
    });

    it('transitions to SENT when in DRAFT, but throws if already SENT', () => {
      const item = new QuoteItem({
        productId: 'prod-1',
        quantity: '1',
        unitPrice: '100.00',
      });
      const quote = new QuoteAggregate({
        folio: 'C-000001',
        customerId: 'cust-1',
        items: [item],
      });

      quote.send();
      expect(quote.status).toBe('SENT');

      expect(() => quote.send()).toThrow(InvalidQuoteStateException);
    });

    it('enforces expiration when checking payability', () => {
      const pastDate = new Date(Date.now() - 60000);
      const futureDate = new Date(Date.now() + 60000);

      const expiredQuote = new QuoteAggregate({
        folio: 'C-000001',
        customerId: 'cust-1',
        items: [new QuoteItem({ productId: 'p1', quantity: 1, unitPrice: 10 })],
        expiresAt: pastDate,
      });

      expect(() => expiredQuote.assertPayable()).toThrow(QuoteExpiredException);

      const validQuote = new QuoteAggregate({
        folio: 'C-000001',
        customerId: 'cust-1',
        items: [new QuoteItem({ productId: 'p1', quantity: 1, unitPrice: 10 })],
        expiresAt: futureDate,
      });

      expect(() => validQuote.assertPayable()).not.toThrow();
    });

    it('rejects payment assertion if quote is already CONVERTED or CANCELLED', () => {
      const quote = new QuoteAggregate({
        folio: 'C-000001',
        customerId: 'cust-1',
        status: 'CONVERTED',
        items: [new QuoteItem({ productId: 'p1', quantity: 1, unitPrice: 10 })],
      });

      expect(() => quote.assertPayable()).toThrow(QuoteNotPayableException);
    });

    it('updates details in DRAFT and recalculates totals', () => {
      const quote = new QuoteAggregate({
        folio: 'C-000001',
        customerId: 'cust-1',
        items: [new QuoteItem({ productId: 'p1', quantity: 1, unitPrice: 10 })],
      });

      expect(quote.total.toString()).toBe('10.00');

      quote.updateDetails({
        items: [new QuoteItem({ productId: 'p1', quantity: 3, unitPrice: 10 })],
      });

      expect(quote.total.toString()).toBe('30.00');
    });
  });
});
