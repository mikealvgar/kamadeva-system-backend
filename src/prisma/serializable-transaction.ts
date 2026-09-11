import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';

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
      if (
        attempt >= 4 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2034'
      )
        throw error;
    }
  }
}
