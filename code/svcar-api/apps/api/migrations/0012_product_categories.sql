CREATE TABLE IF NOT EXISTS "product_categories" (
  "product_id" integer NOT NULL,
  "category_id" integer NOT NULL,
  CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_categories_category_idx" ON "product_categories" ("category_id");
