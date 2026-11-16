-- Agregar fechaCompra y eliminar subtotal de compras
ALTER TABLE "compras"
  DROP COLUMN IF EXISTS "subtotal",
  ADD COLUMN "fechaCompra" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
