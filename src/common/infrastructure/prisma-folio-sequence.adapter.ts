import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { FolioSequencePort } from '../application/folio-sequence.port.js';
import { Folio, type FolioSeries } from '../domain/folio.js';

@Injectable()
export class PrismaFolioSequenceAdapter implements FolioSequencePort {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    series: FolioSeries,
    tx?: Prisma.TransactionClient,
  ): Promise<Folio> {
    // Row lock held until commit; concurrent callers serialize on it and the
    // serializable transaction helper retries the losers.
    const { lastValue } = await (tx ?? this.prisma).folioCounter.upsert({
      where: { prefix: series },
      create: { prefix: series, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    });
    return Folio.fromSequence(series, lastValue);
  }
}
