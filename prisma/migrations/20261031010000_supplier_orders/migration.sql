-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "supplierOrderItemId" UUID;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "supplierOrderId" UUID;

-- CreateTable
CREATE TABLE "supplier_orders" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedAt" TIMESTAMP(3),
    "supplierFolio" TEXT,
    "notes" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "receivedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "lineSubtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "supplier_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_orders_providerId_orderedAt_idx" ON "supplier_orders"("providerId", "orderedAt");

-- CreateIndex
CREATE INDEX "supplier_orders_status_expectedAt_idx" ON "supplier_orders"("status", "expectedAt");

-- CreateIndex
CREATE INDEX "supplier_order_items_productId_idx" ON "supplier_order_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_order_items_orderId_position_key" ON "supplier_order_items"("orderId", "position");

-- CreateIndex
CREATE INDEX "purchases_supplierOrderId_idx" ON "purchases"("supplierOrderId");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "supplier_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_supplierOrderItemId_fkey" FOREIGN KEY ("supplierOrderItemId") REFERENCES "supplier_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "supplier_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
