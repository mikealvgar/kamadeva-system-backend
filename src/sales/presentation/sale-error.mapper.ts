import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DomainException } from '../../common/domain/domain-exception.js';
import {
  IdempotencyKeyRaceException,
  IdempotencyKeyReuseException,
  InactiveProductException,
  InsufficientStockException,
  SaleCustomerNotFoundException,
  SaleNotCancellableException,
  SaleNotFoundException,
  SaleProductNotFoundException,
} from '../domain/sale-exceptions.js';

/** Translate sales domain failures to HTTP; anything else propagates. */
export function handleSaleError(error: unknown): never {
  if (
    error instanceof SaleNotFoundException ||
    error instanceof SaleCustomerNotFoundException ||
    error instanceof SaleProductNotFoundException
  ) {
    throw new NotFoundException(error.message);
  }
  if (
    error instanceof InsufficientStockException ||
    error instanceof InactiveProductException ||
    error instanceof SaleNotCancellableException ||
    error instanceof IdempotencyKeyReuseException ||
    error instanceof IdempotencyKeyRaceException
  ) {
    throw new ConflictException(error.message);
  }
  // Remaining domain rules (size, payment mismatch, amount range) are input errors.
  if (error instanceof DomainException) {
    throw new BadRequestException(error.message);
  }
  throw error;
}
