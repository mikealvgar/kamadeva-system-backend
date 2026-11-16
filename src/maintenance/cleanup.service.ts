import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Elimina todas las llaves de idempotencia que ya hayan expirado.
   */
  async cleanExpiredIdempotencyKeys(now = new Date()): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: {
        fechaVencimiento: { lt: now },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Limpieza: se eliminaron ${result.count} llaves de idempotencia vencidas.`,
      );
    }

    return result.count;
  }

  /**
   * Elimina refresh tokens vencidos o revocados hace más de 7 días.
   */
  async cleanExpiredRefreshTokens(now = new Date()): Promise<number> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { fechaVencimiento: { lt: now } },
          { fechaRevocacion: { not: null, lt: sevenDaysAgo } },
        ],
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Limpieza: se eliminaron ${result.count} refresh tokens vencidos o revocados.`,
      );
    }

    return result.count;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleScheduledCleanup(): Promise<void> {
    this.logger.log('Iniciando tareas programadas de mantenimiento y limpieza...');
    await this.cleanExpiredIdempotencyKeys();
    await this.cleanExpiredRefreshTokens();
    this.logger.log('Tareas de mantenimiento finalizadas exitosamente.');
  }
}
