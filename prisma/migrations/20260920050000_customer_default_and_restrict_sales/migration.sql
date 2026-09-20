-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_customerId_fkey";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
