import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnvironment } from './config/environment.js';
import { RolesModule } from './roles/roles.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CatalogProductsModule } from './catalog/products/catalog-products.module.js';
import { InventoryModule } from './catalog/inventory/inventory.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    RolesModule,
    CatalogModule,
    CatalogProductsModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
