-- AlterTable
ALTER TABLE "configuracion_negocio" ADD COLUMN     "impuestoPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "mensajeTicket" TEXT,
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'MXN',
ADD COLUMN     "razonSocial" TEXT;
