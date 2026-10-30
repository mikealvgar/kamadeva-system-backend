-- CreateEnum
CREATE TYPE "CashAdjustmentType" AS ENUM ('INCOME', 'WITHDRAWAL');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cashClosureId" UUID,
ADD COLUMN     "refundClosureId" UUID;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "cashClosureId" UUID;

-- CreateTable
CREATE TABLE "cash_closures" (
    "id" UUID NOT NULL,
    "previousClosureId" UUID,
    "periodStart" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" UUID NOT NULL,
    "openingFloat" DECIMAL(12,2) NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "cashSales" DECIMAL(12,2) NOT NULL,
    "cardSales" DECIMAL(12,2) NOT NULL,
    "transferSales" DECIMAL(12,2) NOT NULL,
    "otherSales" DECIMAL(12,2) NOT NULL,
    "cashRefunds" DECIMAL(12,2) NOT NULL,
    "totalRefunds" DECIMAL(12,2) NOT NULL,
    "expensesCount" INTEGER NOT NULL,
    "cashExpenses" DECIMAL(12,2) NOT NULL,
    "totalExpenses" DECIMAL(12,2) NOT NULL,
    "adjustmentsIn" DECIMAL(12,2) NOT NULL,
    "adjustmentsOut" DECIMAL(12,2) NOT NULL,
    "expectedCash" DECIMAL(12,2) NOT NULL,
    "countedCash" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "floatLeft" DECIMAL(12,2) NOT NULL,
    "denominations" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_closure_adjustments" (
    "id" UUID NOT NULL,
    "cashClosureId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "CashAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_closure_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_closures_previousClosureId_key" ON "cash_closures"("previousClosureId");

-- CreateIndex
CREATE INDEX "cash_closures_closedAt_idx" ON "cash_closures"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "cash_closure_adjustments_cashClosureId_position_key" ON "cash_closure_adjustments"("cashClosureId", "position");

-- CreateIndex
CREATE INDEX "payments_cashClosureId_idx" ON "payments"("cashClosureId");

-- CreateIndex
CREATE INDEX "payments_refundClosureId_idx" ON "payments"("refundClosureId");

-- CreateIndex
CREATE INDEX "expenses_cashClosureId_idx" ON "expenses"("cashClosureId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashClosureId_fkey" FOREIGN KEY ("cashClosureId") REFERENCES "cash_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refundClosureId_fkey" FOREIGN KEY ("refundClosureId") REFERENCES "cash_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cashClosureId_fkey" FOREIGN KEY ("cashClosureId") REFERENCES "cash_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_previousClosureId_fkey" FOREIGN KEY ("previousClosureId") REFERENCES "cash_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closure_adjustments" ADD CONSTRAINT "cash_closure_adjustments_cashClosureId_fkey" FOREIGN KEY ("cashClosureId") REFERENCES "cash_closures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

