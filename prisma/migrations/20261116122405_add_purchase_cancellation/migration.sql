-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "usuarios" DROP CONSTRAINT "users_rolId_fkey";

-- AlterTable
ALTER TABLE "ajustes_corte_caja" RENAME CONSTRAINT "cash_closure_adjustments_pkey" TO "ajustes_corte_caja_pkey";

-- AlterTable
ALTER TABLE "categorias" RENAME CONSTRAINT "categories_pkey" TO "categorias_pkey";

-- AlterTable
ALTER TABLE "categorias_gastos" RENAME CONSTRAINT "expense_categories_pkey" TO "categorias_gastos_pkey";

-- AlterTable
ALTER TABLE "claves_idempotencia" RENAME CONSTRAINT "idempotency_keys_pkey" TO "claves_idempotencia_pkey";

-- AlterTable
ALTER TABLE "clientes" RENAME CONSTRAINT "customers_pkey" TO "clientes_pkey";

-- AlterTable
ALTER TABLE "compras" ADD COLUMN     "canceladoPorId" UUID,
ADD COLUMN     "estado" "PurchaseStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "fechaCancelacion" TIMESTAMP(3),
ADD COLUMN     "motivoCancelacion" TEXT;
ALTER TABLE "compras" RENAME CONSTRAINT "purchases_pkey" TO "compras_pkey";

-- AlterTable
ALTER TABLE "configuracion_negocio" RENAME CONSTRAINT "business_config_pkey" TO "configuracion_negocio_pkey";

-- AlterTable
ALTER TABLE "cortes_caja" RENAME CONSTRAINT "cash_closures_pkey" TO "cortes_caja_pkey";

-- AlterTable
ALTER TABLE "cotizaciones" RENAME CONSTRAINT "quotes_pkey" TO "cotizaciones_pkey";

-- AlterTable
ALTER TABLE "gastos" RENAME CONSTRAINT "expenses_pkey" TO "gastos_pkey";

-- AlterTable
ALTER TABLE "marcas" RENAME CONSTRAINT "brands_pkey" TO "marcas_pkey";

-- AlterTable
ALTER TABLE "movimientos_inventario" RENAME CONSTRAINT "inventory_movements_pkey" TO "movimientos_inventario_pkey";

-- AlterTable
ALTER TABLE "productos" RENAME CONSTRAINT "products_pkey" TO "productos_pkey";

-- AlterTable
ALTER TABLE "proveedores" RENAME CONSTRAINT "providers_pkey" TO "proveedores_pkey";

-- AlterTable
ALTER TABLE "renglones_compra" RENAME CONSTRAINT "purchase_items_pkey" TO "renglones_compra_pkey";

-- AlterTable
ALTER TABLE "renglones_cotizacion" RENAME CONSTRAINT "quote_items_pkey" TO "renglones_cotizacion_pkey";

-- AlterTable
ALTER TABLE "renglones_venta" RENAME CONSTRAINT "sale_items_pkey" TO "renglones_venta_pkey";

-- AlterTable
ALTER TABLE "tallas" RENAME CONSTRAINT "sizes_pkey" TO "tallas_pkey";

-- AlterTable
ALTER TABLE "tokens_renovacion" RENAME CONSTRAINT "refresh_tokens_pkey" TO "tokens_renovacion_pkey";

-- AlterTable
ALTER TABLE "usuarios" RENAME CONSTRAINT "users_pkey" TO "usuarios_pkey";

-- AlterTable
ALTER TABLE "ventas" RENAME CONSTRAINT "sales_pkey" TO "ventas_pkey";

-- CreateIndex
CREATE INDEX "compras_estado_idx" ON "compras"("estado");

-- RenameForeignKey
ALTER TABLE "ajustes_corte_caja" RENAME CONSTRAINT "cash_closure_adjustments_corteCajaId_fkey" TO "ajustes_corte_caja_corteCajaId_fkey";

-- RenameForeignKey
ALTER TABLE "claves_idempotencia" RENAME CONSTRAINT "idempotency_keys_usuarioId_fkey" TO "claves_idempotencia_usuarioId_fkey";

-- RenameForeignKey
ALTER TABLE "claves_idempotencia" RENAME CONSTRAINT "idempotency_keys_ventaId_fkey" TO "claves_idempotencia_ventaId_fkey";

-- RenameForeignKey
ALTER TABLE "compras" RENAME CONSTRAINT "purchases_creadoPorId_fkey" TO "compras_creadoPorId_fkey";

-- RenameForeignKey
ALTER TABLE "compras" RENAME CONSTRAINT "purchases_proveedorId_fkey" TO "compras_proveedorId_fkey";

-- RenameForeignKey
ALTER TABLE "cortes_caja" RENAME CONSTRAINT "cash_closures_cerradoPorId_fkey" TO "cortes_caja_cerradoPorId_fkey";

-- RenameForeignKey
ALTER TABLE "cortes_caja" RENAME CONSTRAINT "cash_closures_corteAnteriorId_fkey" TO "cortes_caja_corteAnteriorId_fkey";

-- RenameForeignKey
ALTER TABLE "cotizaciones" RENAME CONSTRAINT "quotes_clienteId_fkey" TO "cotizaciones_clienteId_fkey";

-- RenameForeignKey
ALTER TABLE "cotizaciones" RENAME CONSTRAINT "quotes_creadoPorId_fkey" TO "cotizaciones_creadoPorId_fkey";

-- RenameForeignKey
ALTER TABLE "gastos" RENAME CONSTRAINT "expenses_categoriaId_fkey" TO "gastos_categoriaId_fkey";

-- RenameForeignKey
ALTER TABLE "gastos" RENAME CONSTRAINT "expenses_corteCajaId_fkey" TO "gastos_corteCajaId_fkey";

-- RenameForeignKey
ALTER TABLE "gastos" RENAME CONSTRAINT "expenses_creadoPorId_fkey" TO "gastos_creadoPorId_fkey";

-- RenameForeignKey
ALTER TABLE "movimientos_inventario" RENAME CONSTRAINT "inventory_movements_creadoPorId_fkey" TO "movimientos_inventario_creadoPorId_fkey";

-- RenameForeignKey
ALTER TABLE "movimientos_inventario" RENAME CONSTRAINT "inventory_movements_productoId_fkey" TO "movimientos_inventario_productoId_fkey";

-- RenameForeignKey
ALTER TABLE "movimientos_inventario" RENAME CONSTRAINT "inventory_movements_renglonVentaId_fkey" TO "movimientos_inventario_renglonVentaId_fkey";

-- RenameForeignKey
ALTER TABLE "productos" RENAME CONSTRAINT "products_categoriaId_fkey" TO "productos_categoriaId_fkey";

-- RenameForeignKey
ALTER TABLE "productos" RENAME CONSTRAINT "products_marcaId_fkey" TO "productos_marcaId_fkey";

-- RenameForeignKey
ALTER TABLE "renglones_compra" RENAME CONSTRAINT "purchase_items_compraId_fkey" TO "renglones_compra_compraId_fkey";

-- RenameForeignKey
ALTER TABLE "renglones_compra" RENAME CONSTRAINT "purchase_items_productoId_fkey" TO "renglones_compra_productoId_fkey";

-- RenameForeignKey
ALTER TABLE "renglones_cotizacion" RENAME CONSTRAINT "quote_items_cotizacionId_fkey" TO "renglones_cotizacion_cotizacionId_fkey";

-- RenameForeignKey
ALTER TABLE "renglones_cotizacion" RENAME CONSTRAINT "quote_items_productoId_fkey" TO "renglones_cotizacion_productoId_fkey";

-- RenameForeignKey
ALTER TABLE "renglones_cotizacion" RENAME CONSTRAINT "quote_items_tallaId_fkey" TO "renglones_cotizacion_tallaId_fkey";

-- RenameForeignKey
ALTER TABLE "renglones_venta" RENAME CONSTRAINT "sale_items_productoId_fkey" TO "renglones_venta_productoId_fkey";

-- RenameForeignKey
ALTER TABLE "renglones_venta" RENAME CONSTRAINT "sale_items_tallaId_fkey" TO "renglones_venta_tallaId_fkey";

-- RenameForeignKey
ALTER TABLE "renglones_venta" RENAME CONSTRAINT "sale_items_ventaId_fkey" TO "renglones_venta_ventaId_fkey";

-- RenameForeignKey
ALTER TABLE "tokens_renovacion" RENAME CONSTRAINT "refresh_tokens_usuarioId_fkey" TO "tokens_renovacion_usuarioId_fkey";

-- RenameForeignKey
ALTER TABLE "ventas" RENAME CONSTRAINT "sales_canceladoPorId_fkey" TO "ventas_canceladoPorId_fkey";

-- RenameForeignKey
ALTER TABLE "ventas" RENAME CONSTRAINT "sales_clienteId_fkey" TO "ventas_clienteId_fkey";

-- RenameForeignKey
ALTER TABLE "ventas" RENAME CONSTRAINT "sales_corteCajaId_fkey" TO "ventas_corteCajaId_fkey";

-- RenameForeignKey
ALTER TABLE "ventas" RENAME CONSTRAINT "sales_cotizacionId_fkey" TO "ventas_cotizacionId_fkey";

-- RenameForeignKey
ALTER TABLE "ventas" RENAME CONSTRAINT "sales_creadoPorId_fkey" TO "ventas_creadoPorId_fkey";

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "cash_closure_adjustments_corteCajaId_posicion_key" RENAME TO "ajustes_corte_caja_corteCajaId_posicion_key";

-- RenameIndex
ALTER INDEX "categories_descripcion_key" RENAME TO "categorias_nombre_key";

-- RenameIndex
ALTER INDEX "expense_categories_nombre_key" RENAME TO "categorias_gastos_nombre_key";

-- RenameIndex
ALTER INDEX "idempotency_keys_fechaVencimiento_idx" RENAME TO "claves_idempotencia_fechaVencimiento_idx";

-- RenameIndex
ALTER INDEX "idempotency_keys_llave_ambito_key" RENAME TO "claves_idempotencia_llave_ambito_key";

-- RenameIndex
ALTER INDEX "idempotency_keys_usuarioId_idx" RENAME TO "claves_idempotencia_usuarioId_idx";

-- RenameIndex
ALTER INDEX "idempotency_keys_ventaId_idx" RENAME TO "claves_idempotencia_ventaId_idx";

-- RenameIndex
ALTER INDEX "customers_correo_idx" RENAME TO "clientes_correo_idx";

-- RenameIndex
ALTER INDEX "purchases_fechaRecepcion_idx" RENAME TO "compras_fechaRecepcion_idx";

-- RenameIndex
ALTER INDEX "purchases_proveedorId_fechaRecepcion_idx" RENAME TO "compras_proveedorId_fechaRecepcion_idx";

-- RenameIndex
ALTER INDEX "cash_closures_corteAnteriorId_key" RENAME TO "cortes_caja_corteAnteriorId_key";

-- RenameIndex
ALTER INDEX "cash_closures_fechaCierre_idx" RENAME TO "cortes_caja_fechaCierre_idx";

-- RenameIndex
ALTER INDEX "quotes_clienteId_idx" RENAME TO "cotizaciones_clienteId_idx";

-- RenameIndex
ALTER INDEX "quotes_estado_idx" RENAME TO "cotizaciones_estado_idx";

-- RenameIndex
ALTER INDEX "quotes_folio_key" RENAME TO "cotizaciones_folio_key";

-- RenameIndex
ALTER INDEX "expenses_categoriaId_idx" RENAME TO "gastos_categoriaId_idx";

-- RenameIndex
ALTER INDEX "expenses_corteCajaId_idx" RENAME TO "gastos_corteCajaId_idx";

-- RenameIndex
ALTER INDEX "expenses_creadoPorId_idx" RENAME TO "gastos_creadoPorId_idx";

-- RenameIndex
ALTER INDEX "expenses_fechaGasto_idx" RENAME TO "gastos_fechaGasto_idx";

-- RenameIndex
ALTER INDEX "brands_descripcion_key" RENAME TO "marcas_descripcion_key";

-- RenameIndex
ALTER INDEX "inventory_movements_productoId_idx" RENAME TO "movimientos_inventario_productoId_idx";

-- RenameIndex
ALTER INDEX "inventory_movements_renglonVentaId_idx" RENAME TO "movimientos_inventario_renglonVentaId_idx";

-- RenameIndex
ALTER INDEX "inventory_movements_tipoReferencia_referenciaId_idx" RENAME TO "movimientos_inventario_tipoReferencia_referenciaId_idx";

-- RenameIndex
ALTER INDEX "inventory_movements_tipo_idx" RENAME TO "movimientos_inventario_tipo_idx";

-- RenameIndex
ALTER INDEX "products_categoriaId_idx" RENAME TO "productos_categoriaId_idx";

-- RenameIndex
ALTER INDEX "products_codigoBarras_key" RENAME TO "productos_codigoBarras_key";

-- RenameIndex
ALTER INDEX "products_marcaId_idx" RENAME TO "productos_marcaId_idx";

-- RenameIndex
ALTER INDEX "providers_nombre_key" RENAME TO "proveedores_nombre_key";

-- RenameIndex
ALTER INDEX "purchase_items_compraId_posicion_key" RENAME TO "renglones_compra_compraId_posicion_key";

-- RenameIndex
ALTER INDEX "purchase_items_productoId_idx" RENAME TO "renglones_compra_productoId_idx";

-- RenameIndex
ALTER INDEX "quote_items_cotizacionId_idx" RENAME TO "renglones_cotizacion_cotizacionId_idx";

-- RenameIndex
ALTER INDEX "quote_items_productoId_idx" RENAME TO "renglones_cotizacion_productoId_idx";

-- RenameIndex
ALTER INDEX "quote_items_tallaId_idx" RENAME TO "renglones_cotizacion_tallaId_idx";

-- RenameIndex
ALTER INDEX "sale_items_productoId_idx" RENAME TO "renglones_venta_productoId_idx";

-- RenameIndex
ALTER INDEX "sale_items_tallaId_idx" RENAME TO "renglones_venta_tallaId_idx";

-- RenameIndex
ALTER INDEX "sale_items_ventaId_idx" RENAME TO "renglones_venta_ventaId_idx";

-- RenameIndex
ALTER INDEX "sizes_nombre_key" RENAME TO "tallas_nombre_key";

-- RenameIndex
ALTER INDEX "refresh_tokens_usuarioId_idx" RENAME TO "tokens_renovacion_usuarioId_idx";

-- RenameIndex
ALTER INDEX "users_email_key" RENAME TO "usuarios_email_key";

-- RenameIndex
ALTER INDEX "sales_clienteId_idx" RENAME TO "ventas_clienteId_idx";

-- RenameIndex
ALTER INDEX "sales_corteCajaId_idx" RENAME TO "ventas_corteCajaId_idx";

-- RenameIndex
ALTER INDEX "sales_cotizacionId_key" RENAME TO "ventas_cotizacionId_key";

-- RenameIndex
ALTER INDEX "sales_estado_idx" RENAME TO "ventas_estado_idx";

-- RenameIndex
ALTER INDEX "sales_fechaCreacion_idx" RENAME TO "ventas_fechaCreacion_idx";

-- RenameIndex
ALTER INDEX "sales_folio_key" RENAME TO "ventas_folio_key";
