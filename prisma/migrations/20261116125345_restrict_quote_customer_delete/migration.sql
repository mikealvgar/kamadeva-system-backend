-- DropForeignKey
ALTER TABLE "cotizaciones" DROP CONSTRAINT "cotizaciones_clienteId_fkey";

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
