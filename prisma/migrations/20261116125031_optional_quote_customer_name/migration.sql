-- DropForeignKey
ALTER TABLE "cotizaciones" DROP CONSTRAINT "cotizaciones_clienteId_fkey";

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN     "clienteNombre" TEXT,
ALTER COLUMN "clienteId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
