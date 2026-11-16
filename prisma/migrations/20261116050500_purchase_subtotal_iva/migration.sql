-- Agregar subtotal e iva a compras
ALTER TABLE "compras"
  ADD COLUMN "subtotal" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "iva" DECIMAL(12, 2) NOT NULL DEFAULT 0;
