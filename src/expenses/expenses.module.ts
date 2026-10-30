import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ExpenseCategoriesController } from './expense-categories.controller.js';
import { ExpenseCategoriesService } from './expense-categories.service.js';
import { ExpensesController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ExpenseCategoriesController, ExpensesController],
  providers: [ExpenseCategoriesService, ExpensesService],
})
export class ExpensesModule {}
