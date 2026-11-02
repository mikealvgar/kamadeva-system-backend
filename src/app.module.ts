import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnvironment } from './config/environment.js';
import { RolesModule } from './roles/roles.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CatalogProductsModule } from './catalog/products/catalog-products.module.js';
import { SizesModule } from './catalog/sizes/sizes.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { InventoryModule } from './catalog/inventory/inventory.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { SalesModule } from './sales/sales.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { CashClosuresModule } from './cash-closures/cash-closures.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { BusinessConfigModule } from './business-config/business-config.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    AuthModule,
    RolesModule,
    CatalogModule,
    CatalogProductsModule,
    SizesModule,
    InventoryModule,
    CustomersModule,
    SalesModule,
    QuotesModule,
    ExpensesModule,
    CashClosuresModule,
    DashboardModule,
    BusinessConfigModule,
    ProvidersModule,
    PurchasesModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
