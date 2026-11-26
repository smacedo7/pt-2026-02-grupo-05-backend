-- AlterTable
ALTER TABLE "rating_comments" ADD COLUMN     "parent_id" INTEGER;

-- CreateIndex
CREATE INDEX "rating_comments_parent_id_idx" ON "rating_comments"("parent_id");

-- AddForeignKey
ALTER TABLE "rating_comments" ADD CONSTRAINT "rating_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "rating_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
