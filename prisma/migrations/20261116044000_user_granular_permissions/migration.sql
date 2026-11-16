-- Agregar seccionesPermitidas y permisosTemporales a usuarios
ALTER TABLE "usuarios"
  ADD COLUMN "seccionesPermitidas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "permisosTemporales" JSONB NOT NULL DEFAULT '[]'::jsonb;
