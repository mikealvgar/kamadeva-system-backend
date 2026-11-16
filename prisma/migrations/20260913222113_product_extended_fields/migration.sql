-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "tallas" TEXT[] DEFAULT ARRAY[]::TEXT[];
