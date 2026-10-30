-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "sizeId" UUID;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" UUID;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "sizeId" UUID;

-- CreateTable
CREATE TABLE "sizes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sizes" (
    "productId" UUID NOT NULL,
    "sizeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_sizes_pkey" PRIMARY KEY ("productId","sizeId")
);

-- CreateTable
CREATE TABLE "folio_counters" (
    "prefix" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folio_counters_pkey" PRIMARY KEY ("prefix")
);

-- CreateIndex
CREATE UNIQUE INDEX "sizes_name_key" ON "sizes"("name");

-- CreateIndex
CREATE INDEX "sizes_sortOrder_name_idx" ON "sizes"("sortOrder", "name");

-- CreateIndex
CREATE INDEX "product_sizes_sizeId_idx" ON "product_sizes"("sizeId");

-- CreateIndex
CREATE INDEX "quote_items_sizeId_idx" ON "quote_items"("sizeId");

-- CreateIndex
CREATE INDEX "sales_createdAt_idx" ON "sales"("createdAt");

-- CreateIndex
CREATE INDEX "sale_items_sizeId_idx" ON "sale_items"("sizeId");

-- AddForeignKey
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Data: copy free-text "products"."tallas" into the size catalog (trimmed, upper-case).
-- "tallas" stays until the product service switches to sizeIds.
INSERT INTO "sizes" ("id", "name", "updatedAt")
SELECT gen_random_uuid(), t."name", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT upper(btrim(s)) AS "name"
    FROM "products" p
    CROSS JOIN LATERAL unnest(p."tallas") AS s
    WHERE btrim(s) <> ''
) t
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "product_sizes" ("productId", "sizeId")
SELECT DISTINCT p."id", z."id"
FROM "products" p
CROSS JOIN LATERAL unnest(p."tallas") AS s
JOIN "sizes" z ON z."name" = upper(btrim(s))
WHERE btrim(s) <> ''
ON CONFLICT DO NOTHING;

-- Data: gapless folio counters for sales (V-) and quotes (C-).
INSERT INTO "folio_counters" ("prefix", "lastValue", "updatedAt")
VALUES ('V', 0, CURRENT_TIMESTAMP), ('C', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("prefix") DO NOTHING;
