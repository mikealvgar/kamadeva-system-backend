TRUNCATE TABLE
  "cash_closure_adjustments",
  "cash_closures",
  "expenses",
  "idempotency_keys",
  "inventory_movements",
  "payments",
  "product_sizes",
  "products",
  "purchase_items",
  "purchases",
  "quote_items",
  "quotes",
  "refresh_tokens",
  "sale_items",
  "sales",
  "supplier_order_items",
  "supplier_orders",
  "user_roles",
  "users",
  "categories",
  "sizes",
  "roles",
  "expense_categories",
  "customers",
  "business_config",
  "providers",
  "folio_counters"
CASCADE;

-- DropForeignKey
ALTER TABLE "cash_closure_adjustments" DROP CONSTRAINT "cash_closure_adjustments_cashClosureId_fkey";

-- DropForeignKey
ALTER TABLE "cash_closures" DROP CONSTRAINT "cash_closures_closedById_fkey";

-- DropForeignKey
ALTER TABLE "cash_closures" DROP CONSTRAINT "cash_closures_previousClosureId_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_cashClosureId_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_createdById_fkey";

-- DropForeignKey
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_userId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_createdById_fkey";

-- DropForeignKey
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_productId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_saleItemId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_cashClosureId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_createdById_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_refundClosureId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_saleId_fkey";

-- DropForeignKey
ALTER TABLE "product_sizes" DROP CONSTRAINT "product_sizes_productId_fkey";

-- DropForeignKey
ALTER TABLE "product_sizes" DROP CONSTRAINT "product_sizes_sizeId_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_supplierOrderItemId_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_createdById_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_providerId_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_supplierOrderId_fkey";

-- DropForeignKey
ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_sizeId_fkey";

-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_createdById_fkey";

-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_customerId_fkey";

-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_userId_fkey";

-- DropForeignKey
ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_saleId_fkey";

-- DropForeignKey
ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_sizeId_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_cancelledById_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_createdById_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_customerId_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_order_items" DROP CONSTRAINT "supplier_order_items_orderId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_order_items" DROP CONSTRAINT "supplier_order_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_orders" DROP CONSTRAINT "supplier_orders_createdById_fkey";

-- DropForeignKey
ALTER TABLE "supplier_orders" DROP CONSTRAINT "supplier_orders_providerId_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_roleId_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_userId_fkey";

-- DropIndex
DROP INDEX "cash_closure_adjustments_cashClosureId_position_key";

-- DropIndex
DROP INDEX "cash_closures_closedAt_idx";

-- DropIndex
DROP INDEX "cash_closures_previousClosureId_key";

-- DropIndex
DROP INDEX "categories_slug_key";

-- DropIndex
DROP INDEX "customers_email_idx";

-- DropIndex
DROP INDEX "expense_categories_name_key";

-- DropIndex
DROP INDEX "expenses_cashClosureId_idx";

-- DropIndex
DROP INDEX "expenses_categoryId_idx";

-- DropIndex
DROP INDEX "expenses_createdById_idx";

-- DropIndex
DROP INDEX "expenses_spentAt_idx";

-- DropIndex
DROP INDEX "idempotency_keys_expiresAt_idx";

-- DropIndex
DROP INDEX "idempotency_keys_key_scope_key";

-- DropIndex
DROP INDEX "idempotency_keys_paymentId_idx";

-- DropIndex
DROP INDEX "idempotency_keys_userId_idx";

-- DropIndex
DROP INDEX "inventory_movements_productId_idx";

-- DropIndex
DROP INDEX "inventory_movements_referenceType_referenceId_idx";

-- DropIndex
DROP INDEX "inventory_movements_saleItemId_idx";

-- DropIndex
DROP INDEX "inventory_movements_type_idx";

-- DropIndex
DROP INDEX "products_barcode_key";

-- DropIndex
DROP INDEX "products_categoryId_idx";

-- DropIndex
DROP INDEX "providers_name_key";

-- DropIndex
DROP INDEX "purchase_items_productId_idx";

-- DropIndex
DROP INDEX "purchase_items_purchaseId_position_key";

-- DropIndex
DROP INDEX "purchases_providerId_receivedAt_idx";

-- DropIndex
DROP INDEX "purchases_receivedAt_idx";

-- DropIndex
DROP INDEX "purchases_supplierOrderId_idx";

-- DropIndex
DROP INDEX "quote_items_productId_idx";

-- DropIndex
DROP INDEX "quote_items_quoteId_idx";

-- DropIndex
DROP INDEX "quote_items_sizeId_idx";

-- DropIndex
DROP INDEX "quotes_customerId_idx";

-- DropIndex
DROP INDEX "quotes_status_idx";

-- DropIndex
DROP INDEX "refresh_tokens_userId_idx";

-- DropIndex
DROP INDEX "roles_name_key";

-- DropIndex
DROP INDEX "sale_items_productId_idx";

-- DropIndex
DROP INDEX "sale_items_saleId_idx";

-- DropIndex
DROP INDEX "sale_items_sizeId_idx";

-- DropIndex
DROP INDEX "sales_createdAt_idx";

-- DropIndex
DROP INDEX "sales_customerId_idx";

-- DropIndex
DROP INDEX "sales_quoteId_key";

-- DropIndex
DROP INDEX "sales_status_idx";

-- DropIndex
DROP INDEX "sizes_name_key";

-- DropIndex
DROP INDEX "sizes_sortOrder_name_idx";

-- AlterTable
ALTER TABLE "business_config" DROP CONSTRAINT "business_config_pkey",
DROP COLUMN "address",
DROP COLUMN "createdAt",
DROP COLUMN "key",
DROP COLUMN "municipality",
DROP COLUMN "name",
DROP COLUMN "neighborhood",
DROP COLUMN "phone",
DROP COLUMN "state",
DROP COLUMN "taxId",
DROP COLUMN "ticketFooter",
DROP COLUMN "updatedAt",
ADD COLUMN     "clave" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "colonia" TEXT NOT NULL,
ADD COLUMN     "direccion" TEXT NOT NULL,
ADD COLUMN     "estado" TEXT NOT NULL,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mensajePie" TEXT NOT NULL,
ADD COLUMN     "municipio" TEXT NOT NULL,
ADD COLUMN     "nombre" TEXT NOT NULL,
ADD COLUMN     "rfc" TEXT NOT NULL,
ADD COLUMN     "telefono" TEXT NOT NULL,
ADD CONSTRAINT "business_config_pkey" PRIMARY KEY ("clave");

-- AlterTable
ALTER TABLE "cash_closure_adjustments" DROP COLUMN "amount",
DROP COLUMN "cashClosureId",
DROP COLUMN "createdAt",
DROP COLUMN "description",
DROP COLUMN "position",
DROP COLUMN "type",
ADD COLUMN     "corteCajaId" UUID NOT NULL,
ADD COLUMN     "descripcion" TEXT NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "monto" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "posicion" INTEGER NOT NULL,
ADD COLUMN     "tipo" "CashAdjustmentType" NOT NULL;

-- AlterTable
ALTER TABLE "cash_closures" DROP COLUMN "adjustmentsIn",
DROP COLUMN "adjustmentsOut",
DROP COLUMN "cardSales",
DROP COLUMN "cashExpenses",
DROP COLUMN "cashRefunds",
DROP COLUMN "cashSales",
DROP COLUMN "closedAt",
DROP COLUMN "closedById",
DROP COLUMN "countedCash",
DROP COLUMN "createdAt",
DROP COLUMN "denominations",
DROP COLUMN "difference",
DROP COLUMN "expectedCash",
DROP COLUMN "expensesCount",
DROP COLUMN "floatLeft",
DROP COLUMN "notes",
DROP COLUMN "openingFloat",
DROP COLUMN "otherSales",
DROP COLUMN "periodStart",
DROP COLUMN "previousClosureId",
DROP COLUMN "salesCount",
DROP COLUMN "totalExpenses",
DROP COLUMN "totalRefunds",
DROP COLUMN "transferSales",
DROP COLUMN "updatedAt",
ADD COLUMN     "ajustesEntrada" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "ajustesSalida" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "cantidadGastos" INTEGER NOT NULL,
ADD COLUMN     "cantidadVentas" INTEGER NOT NULL,
ADD COLUMN     "cerradoPorId" UUID NOT NULL,
ADD COLUMN     "corteAnteriorId" UUID,
ADD COLUMN     "denominaciones" JSONB NOT NULL,
ADD COLUMN     "diferencia" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "efectivoContado" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "efectivoEsperado" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCierre" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fondoDejado" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "fondoInicial" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "gastosEfectivo" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "gastosTotales" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "inicioPeriodo" TIMESTAMP(3),
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "otrasVentas" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "reembolsosEfectivo" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "reembolsosTotales" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "ventasEfectivo" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "ventasTarjeta" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "ventasTransferencia" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "createdAt",
DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "name",
DROP COLUMN "slug",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "descripcion" TEXT NOT NULL,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "createdAt",
DROP COLUMN "email",
DROP COLUMN "isActive",
DROP COLUMN "isDefault",
DROP COLUMN "name",
DROP COLUMN "phone",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "correo" TEXT,
ADD COLUMN     "esPredeterminado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nombre" TEXT NOT NULL,
ADD COLUMN     "telefono" TEXT;

-- AlterTable
ALTER TABLE "expense_categories" DROP COLUMN "createdAt",
DROP COLUMN "isActive",
DROP COLUMN "name",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nombre" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "expenses" DROP COLUMN "amount",
DROP COLUMN "cashClosureId",
DROP COLUMN "categoryId",
DROP COLUMN "concept",
DROP COLUMN "createdAt",
DROP COLUMN "createdById",
DROP COLUMN "deductFromCash",
DROP COLUMN "notes",
DROP COLUMN "spentAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "categoriaId" UUID NOT NULL,
ADD COLUMN     "concepto" TEXT NOT NULL,
ADD COLUMN     "corteCajaId" UUID,
ADD COLUMN     "creadoPorId" UUID NOT NULL,
ADD COLUMN     "descontarDeCaja" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechaGasto" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "monto" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "notas" TEXT;

-- AlterTable
ALTER TABLE "idempotency_keys" DROP COLUMN "createdAt",
DROP COLUMN "errorMessage",
DROP COLUMN "expiresAt",
DROP COLUMN "key",
DROP COLUMN "paymentId",
DROP COLUMN "requestHash",
DROP COLUMN "responseBody",
DROP COLUMN "responseStatusCode",
DROP COLUMN "scope",
DROP COLUMN "status",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "ambito" TEXT NOT NULL,
ADD COLUMN     "codigoRespuesta" INTEGER,
ADD COLUMN     "cuerpoRespuesta" JSONB,
ADD COLUMN     "estado" "IdempotencyStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechaVencimiento" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "hashPeticion" TEXT NOT NULL,
ADD COLUMN     "llave" TEXT NOT NULL,
ADD COLUMN     "mensajeError" TEXT,
ADD COLUMN     "usuarioId" UUID,
ADD COLUMN     "ventaId" UUID;

-- AlterTable
ALTER TABLE "inventory_movements" DROP COLUMN "createdAt",
DROP COLUMN "createdById",
DROP COLUMN "notes",
DROP COLUMN "productId",
DROP COLUMN "quantityChange",
DROP COLUMN "referenceId",
DROP COLUMN "referenceType",
DROP COLUMN "saleItemId",
DROP COLUMN "type",
DROP COLUMN "unitCost",
ADD COLUMN     "cambioExistencias" DECIMAL(14,3) NOT NULL,
ADD COLUMN     "costoUnitario" DECIMAL(12,2),
ADD COLUMN     "creadoPorId" UUID,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "productoId" UUID NOT NULL,
ADD COLUMN     "referenciaId" TEXT,
ADD COLUMN     "renglonVentaId" UUID,
ADD COLUMN     "tipo" "InventoryMovementType" NOT NULL,
ADD COLUMN     "tipoReferencia" TEXT;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "barcode",
DROP COLUMN "brand",
DROP COLUMN "categoryId",
DROP COLUMN "cost",
DROP COLUMN "createdAt",
DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "minStock",
DROP COLUMN "name",
DROP COLUMN "price",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "categoriaId" UUID,
ADD COLUMN     "codigoBarras" TEXT NOT NULL,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "existenciaMinima" DECIMAL(14,3),
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "marcaId" UUID,
ADD COLUMN     "nombre" TEXT NOT NULL,
ADD COLUMN     "precioCompra" DECIMAL(12,2),
ADD COLUMN     "precioVenta" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "providers" DROP COLUMN "address",
DROP COLUMN "contactName",
DROP COLUMN "createdAt",
DROP COLUMN "email",
DROP COLUMN "isActive",
DROP COLUMN "name",
DROP COLUMN "phone",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "correo" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nombre" TEXT NOT NULL,
ADD COLUMN     "nombreContacto" TEXT,
ADD COLUMN     "telefono" TEXT;

-- AlterTable
ALTER TABLE "purchase_items" DROP COLUMN "barcode",
DROP COLUMN "lineSubtotal",
DROP COLUMN "position",
DROP COLUMN "productId",
DROP COLUMN "productName",
DROP COLUMN "purchaseId",
DROP COLUMN "quantity",
DROP COLUMN "supplierOrderItemId",
DROP COLUMN "unitCost",
ADD COLUMN     "cantidad" DECIMAL(14,3) NOT NULL,
ADD COLUMN     "codigoBarras" TEXT NOT NULL,
ADD COLUMN     "compraId" UUID NOT NULL,
ADD COLUMN     "costoUnitario" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "nombreProducto" TEXT NOT NULL,
ADD COLUMN     "posicion" INTEGER NOT NULL,
ADD COLUMN     "productoId" UUID NOT NULL,
ADD COLUMN     "subtotalRenglon" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "purchases" DROP COLUMN "createdAt",
DROP COLUMN "createdById",
DROP COLUMN "notes",
DROP COLUMN "providerId",
DROP COLUMN "receivedAt",
DROP COLUMN "supplierFolio",
DROP COLUMN "supplierOrderId",
ADD COLUMN     "creadoPorId" UUID NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechaRecepcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "folioProveedor" TEXT,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "proveedorId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "quote_items" DROP COLUMN "createdAt",
DROP COLUMN "discount",
DROP COLUMN "productId",
DROP COLUMN "quantity",
DROP COLUMN "quoteId",
DROP COLUMN "sizeId",
DROP COLUMN "tax",
DROP COLUMN "unitPrice",
ADD COLUMN     "cantidad" DECIMAL(14,3) NOT NULL,
ADD COLUMN     "cotizacionId" UUID NOT NULL,
ADD COLUMN     "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "precioUnitario" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "productoId" UUID NOT NULL,
ADD COLUMN     "tallaId" UUID;

-- AlterTable
ALTER TABLE "quotes" DROP COLUMN "createdAt",
DROP COLUMN "createdById",
DROP COLUMN "customerId",
DROP COLUMN "discount",
DROP COLUMN "expiresAt",
DROP COLUMN "notes",
DROP COLUMN "status",
DROP COLUMN "tax",
DROP COLUMN "updatedAt",
ADD COLUMN     "clienteId" UUID NOT NULL,
ADD COLUMN     "creadoPorId" UUID,
ADD COLUMN     "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "estado" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechaVencimiento" TIMESTAMP(3),
ADD COLUMN     "notas" TEXT,
DROP COLUMN "folio",
ADD COLUMN     "folio" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "createdAt",
DROP COLUMN "expiresAt",
DROP COLUMN "revokedAt",
DROP COLUMN "userId",
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechaRevocacion" TIMESTAMP(3),
ADD COLUMN     "fechaVencimiento" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "usuarioId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "createdAt",
DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "name",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nombre" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sale_items" DROP COLUMN "createdAt",
DROP COLUMN "discount",
DROP COLUMN "productId",
DROP COLUMN "quantity",
DROP COLUMN "saleId",
DROP COLUMN "sizeId",
DROP COLUMN "tax",
DROP COLUMN "unitCost",
DROP COLUMN "unitPrice",
ADD COLUMN     "cantidad" DECIMAL(14,3) NOT NULL,
ADD COLUMN     "costoUnitario" DECIMAL(12,2),
ADD COLUMN     "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "precioUnitario" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "productoId" UUID NOT NULL,
ADD COLUMN     "tallaId" UUID,
ADD COLUMN     "ventaId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "sales" DROP COLUMN "cancelReason",
DROP COLUMN "cancelledAt",
DROP COLUMN "cancelledById",
DROP COLUMN "createdAt",
DROP COLUMN "createdById",
DROP COLUMN "customerId",
DROP COLUMN "discount",
DROP COLUMN "notes",
DROP COLUMN "quoteId",
DROP COLUMN "status",
DROP COLUMN "tax",
DROP COLUMN "updatedAt",
ADD COLUMN     "canceladoPorId" UUID,
ADD COLUMN     "clienteId" UUID,
ADD COLUMN     "corteCajaId" UUID,
ADD COLUMN     "cotizacionId" UUID,
ADD COLUMN     "creadoPorId" UUID,
ADD COLUMN     "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "estado" "SaleStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCancelacion" TIMESTAMP(3),
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fechaPago" TIMESTAMP(3),
ADD COLUMN     "metodoPago" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "motivoCancelacion" TEXT,
ADD COLUMN     "notas" TEXT,
DROP COLUMN "folio",
ADD COLUMN     "folio" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "sizes" DROP COLUMN "createdAt",
DROP COLUMN "isActive",
DROP COLUMN "name",
DROP COLUMN "sortOrder",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nombre" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "createdAt",
DROP COLUMN "isActive",
DROP COLUMN "name",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nombre" TEXT NOT NULL,
ADD COLUMN     "rolId" UUID,
ADD COLUMN     "telefono" TEXT;

-- DropTable
DROP TABLE "folio_counters";

-- DropTable
DROP TABLE "payments";

-- DropTable
DROP TABLE "product_sizes";

-- DropTable
DROP TABLE "supplier_order_items";

-- DropTable
DROP TABLE "supplier_orders";

-- DropTable
DROP TABLE "user_roles";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "SupplierOrderStatus";

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_descripcion_key" ON "brands"("descripcion");

-- CreateIndex
CREATE UNIQUE INDEX "cash_closure_adjustments_corteCajaId_posicion_key" ON "cash_closure_adjustments"("corteCajaId", "posicion");

-- CreateIndex
CREATE UNIQUE INDEX "cash_closures_corteAnteriorId_key" ON "cash_closures"("corteAnteriorId");

-- CreateIndex
CREATE INDEX "cash_closures_fechaCierre_idx" ON "cash_closures"("fechaCierre");

-- CreateIndex
CREATE UNIQUE INDEX "categories_descripcion_key" ON "categories"("descripcion");

-- CreateIndex
CREATE INDEX "customers_correo_idx" ON "customers"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_nombre_key" ON "expense_categories"("nombre");

-- CreateIndex
CREATE INDEX "expenses_corteCajaId_idx" ON "expenses"("corteCajaId");

-- CreateIndex
CREATE INDEX "expenses_fechaGasto_idx" ON "expenses"("fechaGasto");

-- CreateIndex
CREATE INDEX "expenses_categoriaId_idx" ON "expenses"("categoriaId");

-- CreateIndex
CREATE INDEX "expenses_creadoPorId_idx" ON "expenses"("creadoPorId");

-- CreateIndex
CREATE INDEX "idempotency_keys_usuarioId_idx" ON "idempotency_keys"("usuarioId");

-- CreateIndex
CREATE INDEX "idempotency_keys_ventaId_idx" ON "idempotency_keys"("ventaId");

-- CreateIndex
CREATE INDEX "idempotency_keys_fechaVencimiento_idx" ON "idempotency_keys"("fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_llave_ambito_key" ON "idempotency_keys"("llave", "ambito");

-- CreateIndex
CREATE INDEX "inventory_movements_productoId_idx" ON "inventory_movements"("productoId");

-- CreateIndex
CREATE INDEX "inventory_movements_tipo_idx" ON "inventory_movements"("tipo");

-- CreateIndex
CREATE INDEX "inventory_movements_tipoReferencia_referenciaId_idx" ON "inventory_movements"("tipoReferencia", "referenciaId");

-- CreateIndex
CREATE INDEX "inventory_movements_renglonVentaId_idx" ON "inventory_movements"("renglonVentaId");

-- CreateIndex
CREATE UNIQUE INDEX "products_codigoBarras_key" ON "products"("codigoBarras");

-- CreateIndex
CREATE INDEX "products_categoriaId_idx" ON "products"("categoriaId");

-- CreateIndex
CREATE INDEX "products_marcaId_idx" ON "products"("marcaId");

-- CreateIndex
CREATE UNIQUE INDEX "providers_nombre_key" ON "providers"("nombre");

-- CreateIndex
CREATE INDEX "purchase_items_productoId_idx" ON "purchase_items"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_compraId_posicion_key" ON "purchase_items"("compraId", "posicion");

-- CreateIndex
CREATE INDEX "purchases_proveedorId_fechaRecepcion_idx" ON "purchases"("proveedorId", "fechaRecepcion");

-- CreateIndex
CREATE INDEX "purchases_fechaRecepcion_idx" ON "purchases"("fechaRecepcion");

-- CreateIndex
CREATE INDEX "quote_items_tallaId_idx" ON "quote_items"("tallaId");

-- CreateIndex
CREATE INDEX "quote_items_cotizacionId_idx" ON "quote_items"("cotizacionId");

-- CreateIndex
CREATE INDEX "quote_items_productoId_idx" ON "quote_items"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_folio_key" ON "quotes"("folio");

-- CreateIndex
CREATE INDEX "quotes_clienteId_idx" ON "quotes"("clienteId");

-- CreateIndex
CREATE INDEX "quotes_estado_idx" ON "quotes"("estado");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuarioId_idx" ON "refresh_tokens"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE INDEX "sale_items_tallaId_idx" ON "sale_items"("tallaId");

-- CreateIndex
CREATE INDEX "sale_items_ventaId_idx" ON "sale_items"("ventaId");

-- CreateIndex
CREATE INDEX "sale_items_productoId_idx" ON "sale_items"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_folio_key" ON "sales"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "sales_cotizacionId_key" ON "sales"("cotizacionId");

-- CreateIndex
CREATE INDEX "sales_clienteId_idx" ON "sales"("clienteId");

-- CreateIndex
CREATE INDEX "sales_estado_idx" ON "sales"("estado");

-- CreateIndex
CREATE INDEX "sales_corteCajaId_idx" ON "sales"("corteCajaId");

-- CreateIndex
CREATE INDEX "sales_fechaCreacion_idx" ON "sales"("fechaCreacion");

-- CreateIndex
CREATE UNIQUE INDEX "sizes_nombre_key" ON "sizes"("nombre");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_renglonVentaId_fkey" FOREIGN KEY ("renglonVentaId") REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_corteCajaId_fkey" FOREIGN KEY ("corteCajaId") REFERENCES "cash_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_corteCajaId_fkey" FOREIGN KEY ("corteCajaId") REFERENCES "cash_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_corteAnteriorId_fkey" FOREIGN KEY ("corteAnteriorId") REFERENCES "cash_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closure_adjustments" ADD CONSTRAINT "cash_closure_adjustments_corteCajaId_fkey" FOREIGN KEY ("corteCajaId") REFERENCES "cash_closures"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed essential initial roles
INSERT INTO "roles" ("id", "nombre", "descripcion", "activo", "fechaCreacion", "fechaActualizacion")
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'ADMIN', 'Administrador total del sistema', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-0000-0000-000000000002', 'VENDEDOR', 'Vendedor de sucursal', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;

-- Seed default customer
INSERT INTO "customers" ("id", "nombre", "activo", "esPredeterminado", "fechaCreacion", "fechaActualizacion")
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'PÚBLICO EN GENERAL', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Seed default expense categories
INSERT INTO "expense_categories" ("id", "nombre", "activo", "fechaCreacion", "fechaActualizacion")
VALUES
  (gen_random_uuid(), 'Servicios', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Mantenimiento', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Papelería', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Otros', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;

-- Seed default business configuration
INSERT INTO "business_config" ("clave", "nombre", "direccion", "colonia", "municipio", "estado", "telefono", "rfc", "mensajePie", "fechaCreacion", "fechaActualizacion")
VALUES
  ('default', 'Kamadeva Boutique', 'Av. Principal 123', 'Centro', 'Monterrey', 'Nuevo León', '8112345678', 'XAXX010101000', 'Gracias por su compra', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("clave") DO NOTHING;
