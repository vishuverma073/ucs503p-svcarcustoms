# Week 8 : Editing a price emptied customers' carts

**Team focus this week:** Testing, fixes and launch  
**Work this week:** Admin product API (SKU sync)

## Error

After an admin saved a product, carts containing it became empty.

## Relevant Context

`PATCH /admin/products/:id` deleted every SKU row and inserted new ones.

## Key Observation

`cart_items.sku_id` cascades on delete, so every save wiped those cart lines.

## Solution

SKUs are now synced in place: matched by id then code, updated; only removed SKUs are deleted.

**Because** updating rows keeps their ids, so references to them survive.
