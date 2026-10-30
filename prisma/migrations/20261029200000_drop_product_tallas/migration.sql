-- Data: copy any "tallas" written after 20261029180000_sales_sizes_folio_counter
-- into the size catalog before dropping the column (trimmed, upper-case).
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

-- AlterTable
ALTER TABLE "products" DROP COLUMN "tallas";
