-- AlterTable: gallery of up to 5 illustration images per article (images[0] is the cover).
ALTER TABLE "articles" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: existing single cover images become the first gallery image.
UPDATE "articles" SET "images" = ARRAY["image"]::TEXT[] WHERE "image" IS NOT NULL AND ("images" IS NULL OR cardinality("images") = 0);
