import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SizesController } from './sizes.controller.js';
import { SizesService } from './sizes.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SizesController],
  providers: [SizesService],
})
export class SizesModule {}
