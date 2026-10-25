import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { serializableTransaction } from '../../../prisma/serializable-transaction.js';
import type { UnitOfWorkPort } from '../../application/ports/unit-of-work.port.js';
import {
  InvalidFolioException,
  QuoteAlreadyConvertedException,
  QuoteNotFoundException,
  RelatedRecordConflictException,
} from '../../domain/exceptions/quote-exceptions.js';

function isFolioConstraint(value: unknown): boolean {
  return Array.isArray(value)
    ? value.includes('folio')
    : typeof value === 'string' && /(?:^|_)folio(?:_|$)/.test(value);
}

function isFolioCollision(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  if (isFolioConstraint(error.meta?.target)) return true;
  const adapter: unknown = error.meta?.driverAdapterError;
  if (typeof adapter !== 'object' || adapter === null || !('cause' in adapter))
    return false;
  const cause = adapter.cause;
  if (typeof cause !== 'object' || cause === null || !('constraint' in cause))
    return false;
  const constraint = cause.constraint;
  if (typeof constraint !== 'object' || constraint === null) return false;
  return (
    ('fields' in constraint && isFolioConstraint(constraint.fields)) ||
    ('index' in constraint && isFolioConstraint(constraint.index))
  );
}

@Injectable()
export class PrismaUnitOfWorkAdapter implements UnitOfWorkPort {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    retryFolio = false,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await serializableTransaction(this.prisma, work);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            const isFolio = isFolioCollision(error);
            if (retryFolio && isFolio && attempt === 0) continue;
            throw isFolio
              ? new InvalidFolioException('No se pudo generar un folio único')
              : new QuoteAlreadyConvertedException(
                  'La cotización ya fue convertida',
                );
          }
          if (error.code === 'P2025') {
            throw new QuoteNotFoundException('Registro inexistente');
          }
          if (error.code === 'P2003') {
            throw new RelatedRecordConflictException(
              'Conflicto con un registro relacionado',
            );
          }
        }
        throw error;
      }
    }
  }
}
