import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module.js';
import { CashClosuresController } from './cash-closures.controller.js';
import { CashClosuresService } from './cash-closures.service.js';

function mapSpanishAlias(
  target: Record<string, unknown>,
  spanishKey: string,
  internalKey: string,
): void {
  if (spanishKey in target && !(internalKey in target)) {
    target[internalKey] = target[spanishKey];
    delete target[spanishKey];
  }
}

function spanishCashClosureBodyMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const body = req.body as unknown;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    mapSpanishAlias(record, 'corteAnteriorId', 'previousClosureId');
    mapSpanishAlias(record, 'denominaciones', 'denominations');
    mapSpanishAlias(record, 'fondoDejado', 'floatLeft');
    mapSpanishAlias(record, 'ajustes', 'adjustments');
    mapSpanishAlias(record, 'notas', 'notes');

    if (Array.isArray(record.adjustments)) {
      record.adjustments = record.adjustments.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return item;
        }
        const adj = { ...(item as Record<string, unknown>) };
        mapSpanishAlias(adj, 'tipo', 'type');
        mapSpanishAlias(adj, 'monto', 'amount');
        mapSpanishAlias(adj, 'descripcion', 'description');
        return adj;
      });
    }
  }
  next();
}

@Module({
  imports: [AuthModule],
  controllers: [CashClosuresController],
  providers: [CashClosuresService],
})
export class CashClosuresModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(spanishCashClosureBodyMiddleware)
      .forRoutes({ path: 'cortes-caja', method: RequestMethod.POST });
  }
}
