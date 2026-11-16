import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryMovementsService } from './inventory.service.js';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryMovementsService],
})
export class InventoryModule {}
