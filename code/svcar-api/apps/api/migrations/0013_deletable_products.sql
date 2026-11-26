-- Make products/categories hard-deletable once they have order history.
--
-- order_items.sku_id and cart_items.sku_id both pointed at skus with the default
-- ON DELETE NO ACTION. Deleting a product cascades to its skus, so the moment a
-- product had ever been ordered (or sat in someone's cart) the whole delete blew
-- up with a 23503 foreign-key violation — surfacing in the admin as a bare
-- "Delete failed" on both DELETE /admin/products/:id and DELETE /admin/categories/:id.
--
-- order_items already denormalizes product_name / sku_code / variant_label /
-- image_url / unit_price at checkout time, so a null sku_id costs order history
-- nothing: past orders still render in full. A cart line for a deleted product
-- has no meaning at all, so it just goes away.

ALTER TABLE "order_items" ALTER COLUMN "sku_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_sku_id_skus_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sku_id_skus_id_fk"
  FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "cart_items_sku_id_skus_id_fk";
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_sku_id_skus_id_fk"
  FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE CASCADE;
