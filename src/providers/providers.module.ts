import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProvidersController } from './providers.controller.js';
import { ProvidersService } from './providers.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProvidersController],
  providers: [ProvidersService],
})
export class ProvidersModule {}
