import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CatalogModule {}
