CREATE TABLE "password_resets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "parent_category_id" INTEGER,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "logo_url" VARCHAR(255),
    "banner_url" VARCHAR(255),
    "sticker_url" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(8,2) NOT NULL,
    "stock" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "image_url" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_ratings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_ratings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_comments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "store_rating_id" INTEGER,
    "product_rating_id" INTEGER,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "categories_parent_category_id_idx" ON "categories"("parent_category_id");

-- CreateIndex
CREATE INDEX "stores_user_id_idx" ON "stores"("user_id");

-- CreateIndex
CREATE INDEX "stores_category_id_idx" ON "stores"("category_id");

-- CreateIndex
CREATE INDEX "products_store_id_idx" ON "products"("store_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_sort_order_key" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "store_ratings_store_id_idx" ON "store_ratings"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_ratings_user_id_store_id_key" ON "store_ratings"("user_id", "store_id");

-- CreateIndex
CREATE INDEX "product_ratings_product_id_idx" ON "product_ratings"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_ratings_user_id_product_id_key" ON "product_ratings"("user_id", "product_id");

-- CreateIndex
CREATE INDEX "rating_comments_user_id_idx" ON "rating_comments"("user_id");

-- CreateIndex
CREATE INDEX "rating_comments_store_rating_id_idx" ON "rating_comments"("store_rating_id");

-- CreateIndex
CREATE INDEX "rating_comments_product_rating_id_idx" ON "rating_comments"("product_rating_id");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_ratings" ADD CONSTRAINT "store_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_ratings" ADD CONSTRAINT "store_ratings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ratings" ADD CONSTRAINT "product_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ratings" ADD CONSTRAINT "product_ratings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_comments" ADD CONSTRAINT "rating_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_comments" ADD CONSTRAINT "rating_comments_store_rating_id_fkey" FOREIGN KEY ("store_rating_id") REFERENCES "store_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_comments" ADD CONSTRAINT "rating_comments_product_rating_id_fkey" FOREIGN KEY ("product_rating_id") REFERENCES "product_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints that the Prisma schema cannot express.
-- Stars range from 0 to 5 (RF45, RNF07).
ALTER TABLE "store_ratings" ADD CONSTRAINT "store_ratings_rating_range_check" CHECK ("rating" BETWEEN 0 AND 5);
ALTER TABLE "product_ratings" ADD CONSTRAINT "product_ratings_rating_range_check" CHECK ("rating" BETWEEN 0 AND 5);
-- A comment answers exactly one rating: a store rating or a product rating (RF46, RF49).
ALTER TABLE "rating_comments" ADD CONSTRAINT "rating_comments_exactly_one_target_check" CHECK (("store_rating_id" IS NULL) <> ("product_rating_id" IS NULL));
ALTER TABLE "rating_comments" ADD CONSTRAINT "rating_comments_content_not_blank_check" CHECK (char_length(btrim("content")) > 0);
-- Prices and stock cannot be negative (RF27, RNF07).
ALTER TABLE "products" ADD CONSTRAINT "products_price_non_negative_check" CHECK ("price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative_check" CHECK ("stock" >= 0);
-- A category cannot be its own parent.
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent_check" CHECK ("parent_category_id" IS NULL OR "parent_category_id" <> "id");
-- Wrong-code attempts are never negative.
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_attempts_non_negative_check" CHECK ("attempts" >= 0);
