import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CleanupService } from './cleanup.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('CleanupService', () => {
  let service: CleanupService;
  let prismaMock: {
    idempotencyKey: {
      deleteMany: ReturnType<typeof vi.fn>;
    };
    refreshToken: {
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prismaMock = {
      idempotencyKey: {
        deleteMany: vi.fn(),
      },
      refreshToken: {
        deleteMany: vi.fn(),
      },
    };

    service = new CleanupService(prismaMock as unknown as PrismaService);
  });

  it('deletes expired idempotency keys with expiresAt < now', async () => {
    prismaMock.idempotencyKey.deleteMany.mockResolvedValueOnce({ count: 5 });

    const now = new Date('2026-10-30T12:00:00Z');
    const deletedCount = await service.cleanExpiredIdempotencyKeys(now);

    expect(deletedCount).toBe(5);
    expect(prismaMock.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: {
        fechaVencimiento: { lt: now },
      },
    });
  });

  it('deletes expired or old revoked refresh tokens', async () => {
    prismaMock.refreshToken.deleteMany.mockResolvedValueOnce({ count: 12 });

    const now = new Date('2026-10-30T12:00:00Z');
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const deletedCount = await service.cleanExpiredRefreshTokens(now);

    expect(deletedCount).toBe(12);
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { fechaVencimiento: { lt: now } },
          { fechaRevocacion: { not: null, lt: sevenDaysAgo } },
        ],
      },
    });
  });

  it('runs periodic cleanup executing both tasks', async () => {
    prismaMock.idempotencyKey.deleteMany.mockResolvedValueOnce({ count: 3 });
    prismaMock.refreshToken.deleteMany.mockResolvedValueOnce({ count: 8 });

    await service.handleScheduledCleanup();

    expect(prismaMock.idempotencyKey.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
  });
});
