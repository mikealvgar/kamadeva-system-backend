-- Renombrar columnas de categorias a nombre e isActive
ALTER TABLE "categorias" RENAME COLUMN "descripcion" TO "nombre";
ALTER TABLE "categorias" RENAME COLUMN "activo" TO "isActive";
