import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import {
  compressBackup,
  computeBackupCounts,
  parseBackupFile,
  sortCashClosuresChain,
} from './backup.serializer.js';
import {
  BACKUP_FORMAT_VERSION,
  type BackupData,
  type BackupPayload,
  type RestoreBackupResultDto,
} from './backup.types.js';
import type { RestoreBackupDto } from './dto/restore-backup.dto.js';

export interface ExportBackupResult {
  buffer: Buffer;
  filename: string;
}

/** Exporta y restaura snapshots portables de las entidades persistentes del negocio. */
@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  async exportBackup(): Promise<ExportBackupResult> {
    const [
      roles,
      usuarios,
      configuracionNegocio,
      categorias,
      marcas,
      tallas,
      categoriasGastos,
      clientes,
      proveedores,
      productos,
      cortesCajaRaw,
      ajustesCorteCaja,
      compras,
      renglonesCompra,
      cotizaciones,
      renglonesCotizacion,
      ventas,
      renglonesVenta,
      movimientosInventario,
      gastos,
    ] = await Promise.all([
      this.prisma.role.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.user.findMany({ orderBy: { fechaCreacion: 'asc' } }),
      this.prisma.businessConfig.findMany(),
      this.prisma.category.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.brand.findMany({ orderBy: { descripcion: 'asc' } }),
      this.prisma.size.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.expenseCategory.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.customer.findMany({ orderBy: { fechaCreacion: 'asc' } }),
      this.prisma.provider.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.product.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.cashClosure.findMany({ orderBy: { fechaCierre: 'asc' } }),
      this.prisma.cashClosureAdjustment.findMany({
        orderBy: [{ corteCajaId: 'asc' }, { posicion: 'asc' }],
      }),
      this.prisma.purchase.findMany({ orderBy: { fechaCreacion: 'asc' } }),
      this.prisma.purchaseItem.findMany(),
      this.prisma.quote.findMany({ orderBy: { folio: 'asc' } }),
      this.prisma.quoteItem.findMany(),
      this.prisma.sale.findMany({ orderBy: { folio: 'asc' } }),
      this.prisma.saleItem.findMany(),
      this.prisma.inventoryMovement.findMany({
        orderBy: { fechaCreacion: 'asc' },
      }),
      this.prisma.expense.findMany({ orderBy: { fechaCreacion: 'asc' } }),
    ]);

    const datos: BackupData = {
      roles,
      usuarios: usuarios.map((u) => ({
        ...u,
        permisosTemporales: (u.permisosTemporales ?? []) as Prisma.InputJsonValue,
      })),
      configuracionNegocio,
      categorias,
      marcas,
      tallas,
      categoriasGastos,
      clientes,
      proveedores,
      productos,
      cortesCaja: sortCashClosuresChain(
        cortesCajaRaw.map((c) => ({
          ...c,
          denominaciones: (c.denominaciones ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
        })),
      ),
      ajustesCorteCaja,
      compras,
      renglonesCompra,
      cotizaciones,
      renglonesCotizacion,
      ventas,
      renglonesVenta,
      movimientosInventario,
      gastos,
    };

    const now = new Date();
    const payload: BackupPayload = {
      version: BACKUP_FORMAT_VERSION,
      fechaExportacion: now.toISOString(),
      conteos: computeBackupCounts(datos),
      datos,
    };

    return {
      buffer: compressBackup(payload),
      filename: `respaldo-kamadeva-${now.toISOString().slice(0, 10)}.json.gz`,
    };
  }

  async restoreBackup(
    fileBuffer: Buffer,
    options: RestoreBackupDto = {},
  ): Promise<RestoreBackupResultDto> {
    const payload = parseBackupFile(fileBuffer);
    const isDryRun = options.vistaPrevia === 'true';

    if (isDryRun) {
      return {
        version: payload.version,
        fechaExportacion: payload.fechaExportacion,
        vistaPrevia: true,
        restaurado: false,
        conteos: payload.conteos,
      };
    }

    if (options.confirmarReemplazo !== 'true') {
      throw new BadRequestException(
        'Debes confirmar el reemplazo completo enviando confirmarReemplazo=true',
      );
    }

    await serializableTransaction(this.prisma, async (tx) => {
      // 1. Limpiar tablas efímeras y dependientes en orden inverso de FK.
      await tx.idempotencyKey.deleteMany();
      await tx.refreshToken.deleteMany();
      await tx.expense.deleteMany();
      await tx.inventoryMovement.deleteMany();
      await tx.saleItem.deleteMany();
      await tx.sale.deleteMany();
      await tx.quoteItem.deleteMany();
      await tx.quote.deleteMany();
      await tx.purchaseItem.deleteMany();
      await tx.purchase.deleteMany();
      await tx.cashClosureAdjustment.deleteMany();

      // Eliminar cadena de cortes de caja desde el último nodo hasta el primero (RESTRICT).
      const existingClosures = await tx.cashClosure.findMany({
        select: { id: true, corteAnteriorId: true },
      });
      if (existingClosures.length > 0) {
        const orderedExisting = sortCashClosuresChain(
          existingClosures.map((c) => ({
            id: c.id,
            corteAnteriorId: c.corteAnteriorId,
          })) as never,
        );
        for (let i = orderedExisting.length - 1; i >= 0; i--) {
          await tx.cashClosure.delete({ where: { id: orderedExisting[i]!.id } });
        }
      }

      await tx.product.deleteMany();
      await tx.provider.deleteMany();
      await tx.customer.deleteMany();
      await tx.expenseCategory.deleteMany();
      await tx.size.deleteMany();
      await tx.brand.deleteMany();
      await tx.category.deleteMany();
      await tx.businessConfig.deleteMany();
      await tx.user.deleteMany();
      await tx.role.deleteMany();

      // 2. Insertar en orden topológico (padres antes que hijos).
      const d = payload.datos;
      if (d.roles.length > 0) await tx.role.createMany({ data: d.roles });
      if (d.usuarios.length > 0) await tx.user.createMany({ data: d.usuarios });
      if (d.configuracionNegocio.length > 0)
        await tx.businessConfig.createMany({ data: d.configuracionNegocio });
      if (d.categorias.length > 0)
        await tx.category.createMany({ data: d.categorias });
      if (d.marcas.length > 0) await tx.brand.createMany({ data: d.marcas });
      if (d.tallas.length > 0) await tx.size.createMany({ data: d.tallas });
      if (d.categoriasGastos.length > 0)
        await tx.expenseCategory.createMany({ data: d.categoriasGastos });
      if (d.clientes.length > 0)
        await tx.customer.createMany({ data: d.clientes });
      if (d.proveedores.length > 0)
        await tx.provider.createMany({ data: d.proveedores });
      if (d.productos.length > 0)
        await tx.product.createMany({ data: d.productos });
      if (d.cortesCaja.length > 0)
        await tx.cashClosure.createMany({
          data: d.cortesCaja.map((c) => ({
            ...c,
            denominaciones: (c.denominaciones ??
              Prisma.JsonNull) as Prisma.InputJsonValue,
          })),
        });
      if (d.ajustesCorteCaja.length > 0)
        await tx.cashClosureAdjustment.createMany({ data: d.ajustesCorteCaja });
      if (d.compras.length > 0)
        await tx.purchase.createMany({ data: d.compras });
      if (d.renglonesCompra.length > 0)
        await tx.purchaseItem.createMany({ data: d.renglonesCompra });
      if (d.cotizaciones.length > 0)
        await tx.quote.createMany({ data: d.cotizaciones });
      if (d.renglonesCotizacion.length > 0)
        await tx.quoteItem.createMany({ data: d.renglonesCotizacion });
      if (d.ventas.length > 0) await tx.sale.createMany({ data: d.ventas });
      if (d.renglonesVenta.length > 0)
        await tx.saleItem.createMany({ data: d.renglonesVenta });
      if (d.movimientosInventario.length > 0)
        await tx.inventoryMovement.createMany({
          data: d.movimientosInventario,
        });
      if (d.gastos.length > 0) await tx.expense.createMany({ data: d.gastos });

      // 3. Resincronizar secuencias nativas de folios en PostgreSQL.
      await tx.$executeRawUnsafe(
        "SELECT setval(pg_get_serial_sequence('cotizaciones', 'folio'), COALESCE((SELECT MAX(folio) FROM cotizaciones), 1), EXISTS (SELECT 1 FROM cotizaciones))",
      );
      await tx.$executeRawUnsafe(
        "SELECT setval(pg_get_serial_sequence('ventas', 'folio'), COALESCE((SELECT MAX(folio) FROM ventas), 1), EXISTS (SELECT 1 FROM ventas))",
      );
    });

    return {
      version: payload.version,
      fechaExportacion: payload.fechaExportacion,
      vistaPrevia: false,
      restaurado: true,
      conteos: payload.conteos,
    };
  }
}
