import { setTimeout } from 'node:timers/promises';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';

function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return error.code === 'P2034';
  // adapter-pg can surface COMMIT conflicts before Prisma maps them to P2034.
  return (
    error instanceof Error &&
    error.name === 'DriverAdapterError' &&
    typeof error.cause === 'object' &&
    error.cause !== null &&
    'kind' in error.cause &&
    error.cause.kind === 'TransactionWriteConflict'
  );
}

export const SERIALIZATION_CONFLICT_MESSAGE =
  'Conflicto de concurrencia, intente de nuevo';

/**
 * Retry the entire operation with a fresh snapshot after a serialization conflict.
 * Randomized, growing backoff spreads out callers contending on one hot row
 * (e.g. a folio counter); immediate retries would let only one win per round.
 * Exhausted retries surface as a retryable 409, not a 500.
 */
export async function serializableTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isWriteConflict(error)) throw error;
      if (attempt >= 4)
        throw new ConflictException(SERIALIZATION_CONFLICT_MESSAGE, {
          cause: error,
        });
      await setTimeout(Math.random() * 10 * 2 ** attempt);
    }
  }
}
