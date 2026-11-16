import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CashClosuresController } from './cash-closures.controller.js';
import { CashClosuresService } from './cash-closures.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CashClosuresController],
  providers: [CashClosuresService],
})
export class CashClosuresModule {}
