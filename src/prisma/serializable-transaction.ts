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

/** Retry the entire operation with a fresh snapshot after a serialization conflict. */
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
      if (attempt >= 4 || !isWriteConflict(error)) throw error;
    }
  }
}
