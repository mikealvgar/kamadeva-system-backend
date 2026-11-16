import { ApiProperty } from '@nestjs/swagger';
import type { Prisma } from '../generated/prisma/client.js';

export const BACKUP_FORMAT_VERSION = '1.0.0' as const;

export const BACKUP_TABLE_KEYS = [
  'roles',
  'usuarios',
  'configuracionNegocio',
  'categorias',
  'marcas',
  'tallas',
  'categoriasGastos',
  'clientes',
  'proveedores',
  'productos',
  'cortesCaja',
  'ajustesCorteCaja',
  'compras',
  'renglonesCompra',
  'cotizaciones',
  'renglonesCotizacion',
  'ventas',
  'renglonesVenta',
  'movimientosInventario',
  'gastos',
] as const;

export type BackupTableKey = (typeof BACKUP_TABLE_KEYS)[number];

export type BackupCounts = Record<BackupTableKey, number>;

export interface BackupData {
  roles: Prisma.RoleCreateManyInput[];
  usuarios: Prisma.UserCreateManyInput[];
  configuracionNegocio: Prisma.BusinessConfigCreateManyInput[];
  categorias: Prisma.CategoryCreateManyInput[];
  marcas: Prisma.BrandCreateManyInput[];
  tallas: Prisma.SizeCreateManyInput[];
  categoriasGastos: Prisma.ExpenseCategoryCreateManyInput[];
  clientes: Prisma.CustomerCreateManyInput[];
  proveedores: Prisma.ProviderCreateManyInput[];
  productos: Prisma.ProductCreateManyInput[];
  cortesCaja: Prisma.CashClosureCreateManyInput[];
  ajustesCorteCaja: Prisma.CashClosureAdjustmentCreateManyInput[];
  compras: Prisma.PurchaseCreateManyInput[];
  renglonesCompra: Prisma.PurchaseItemCreateManyInput[];
  cotizaciones: Prisma.QuoteCreateManyInput[];
  renglonesCotizacion: Prisma.QuoteItemCreateManyInput[];
  ventas: Prisma.SaleCreateManyInput[];
  renglonesVenta: Prisma.SaleItemCreateManyInput[];
  movimientosInventario: Prisma.InventoryMovementCreateManyInput[];
  gastos: Prisma.ExpenseCreateManyInput[];
}

export interface BackupPayload {
  version: string;
  fechaExportacion: string;
  conteos: BackupCounts;
  datos: BackupData;
}

export class RestoreBackupResultDto {
  @ApiProperty({ example: '1.0.0' })
  version!: string;

  @ApiProperty({ format: 'date-time' })
  fechaExportacion!: string;

  @ApiProperty()
  vistaPrevia!: boolean;

  @ApiProperty()
  restaurado!: boolean;

  @ApiProperty({ type: Object })
  conteos!: BackupCounts;
}
