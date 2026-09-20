import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';
import { serializableTransaction } from './serializable-transaction.js';

const adapterError = (kind: string) =>
  Object.assign(
    new Error(kind, {
      cause: {
        kind,
        originalCode: '40001',
        originalMessage: 'serialization failure',
      },
    }),
    { name: 'DriverAdapterError' },
  );
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('Database failure', {
    code,
    clientVersion: '7.10.0',
  });

describe('serializableTransaction', () => {
  it.each([prismaError('P2034'), adapterError('TransactionWriteConflict')])(
    'retries a fresh transaction after %s',
    async (error) => {
      const operation = vi.fn().mockResolvedValue('result');
      const transaction = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockImplementationOnce(() => operation());
      const prisma = { $transaction: transaction } as unknown as PrismaService;
      expect(await serializableTransaction(prisma, operation)).toBe('result');
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(transaction).toHaveBeenNthCalledWith(2, operation, {
        isolationLevel: 'Serializable',
      });
    },
  );
  it.each([prismaError('P2034'), adapterError('TransactionWriteConflict')])(
    'stops after five attempts and preserves %s',
    async (error) => {
      const transaction = vi.fn().mockRejectedValue(error);
      await expect(
        serializableTransaction(
          { $transaction: transaction } as unknown as PrismaService,
          vi.fn(),
        ),
      ).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(5);
    },
  );
  it.each([
    prismaError('P2003'),
    adapterError('ConnectionClosed'),
    new Error('TransactionWriteConflict'),
    null,
  ])('does not retry unrelated failures: %s', async (error) => {
    const transaction = vi.fn().mockRejectedValue(error);
    await expect(
      serializableTransaction(
        { $transaction: transaction } as unknown as PrismaService,
        vi.fn(),
      ),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
