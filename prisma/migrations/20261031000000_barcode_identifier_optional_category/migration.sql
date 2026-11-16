-- Products: the barcode replaces the SKU as the product identifier.

-- 1. Products without a barcode take their former SKU (prefixed if that value
--    is already another product's barcode).
UPDATE "products" p
SET "barcode" = CASE
    WHEN EXISTS (SELECT 1 FROM "products" o WHERE o."barcode" = p."sku" AND o."id" <> p."id")
        THEN 'SKU-' || p."sku"
    ELSE p."sku"
END
WHERE p."barcode" IS NULL;

-- 2. Barcodes are stored upper-case; skip any row whose upper-case form would
--    collide with another product.
UPDATE "products" p
SET "barcode" = upper(p."barcode")
WHERE p."barcode" <> upper(p."barcode")
  AND NOT EXISTS (
      SELECT 1 FROM "products" o
      WHERE o."id" <> p."id" AND upper(o."barcode") = upper(p."barcode")
  );

-- DropIndex
DROP INDEX "products_sku_key";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "sku",
ALTER COLUMN "barcode" SET NOT NULL,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- Categories are stored upper-case; slugs are unchanged.
UPDATE "categories" SET "name" = upper("name") WHERE "name" <> upper("name");
