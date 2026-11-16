import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessConfigController } from './business-config.controller.js';
import { BusinessConfigService } from './business-config.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BusinessConfigController],
  providers: [BusinessConfigService],
})
export class BusinessConfigModule {}
