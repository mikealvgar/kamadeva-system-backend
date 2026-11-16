import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { BrandsController } from './brands/brands.controller.js';
import { BrandsService } from './brands/brands.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CategoriesController, BrandsController],
  providers: [CategoriesService, BrandsService],
  exports: [CategoriesService, BrandsService],
})
export class CatalogModule {}
