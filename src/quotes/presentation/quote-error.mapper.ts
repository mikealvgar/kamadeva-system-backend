import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerNotFoundException,
  DomainException,
  InsufficientStockException,
  InvalidAmountException,
  InvalidExpirationDateException,
  InvalidFolioException,
  InvalidQuoteStateException,
  PaymentAmountMismatchException,
  ProductNotFoundException,
  QuoteAlreadyConvertedException,
  QuoteExpiredException,
  QuoteNotFoundException,
  QuoteNotPayableException,
  RelatedRecordConflictException,
} from '../domain/exceptions/quote-exceptions.js';

export function handleDomainError(error: unknown): never {
  if (
    error instanceof QuoteNotFoundException ||
    error instanceof CustomerNotFoundException ||
    error instanceof ProductNotFoundException
  ) {
    throw new NotFoundException(error.message);
  }

  if (
    error instanceof QuoteExpiredException ||
    error instanceof InvalidQuoteStateException ||
    error instanceof QuoteNotPayableException ||
    error instanceof QuoteAlreadyConvertedException ||
    error instanceof InsufficientStockException ||
    error instanceof InvalidFolioException ||
    error instanceof RelatedRecordConflictException
  ) {
    throw new ConflictException(error.message);
  }

  if (
    error instanceof InvalidAmountException ||
    error instanceof PaymentAmountMismatchException ||
    error instanceof InvalidExpirationDateException ||
    error instanceof DomainException
  ) {
    throw new BadRequestException(error.message);
  }

  throw error;
}
