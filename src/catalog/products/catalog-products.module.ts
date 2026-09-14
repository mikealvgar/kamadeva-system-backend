import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { AuthModule } from '../../auth/auth.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import {
  CLOUDINARY_SDK,
  PRODUCT_IMAGES,
  ProductImagesService,
} from './product-images.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    { provide: PRODUCT_IMAGES, useClass: ProductImagesService },
    {
      provide: CLOUDINARY_SDK,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        cloudinary.config({
          cloud_name: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
          api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
          api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
          secure: true,
        });
        return cloudinary;
      },
    },
  ],
})
export class CatalogProductsModule {}
