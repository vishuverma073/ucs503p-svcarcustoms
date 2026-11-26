# Week 2 : A product could appear in only one category

**Team focus this week:** Catalogue and admin panel  
**Work this week:** Multi-category catalogue (junction table)

## Error

The same spoiler had to be listed under both "Spoilers" and "VW Parts".

## Relevant Context

`products` had a single `category_id`.

## Key Observation

This is a many-to-many relationship.

## Solution

Added the `product_categories` junction table; category listings match any of a product's categories; the admin editor got an "Also list under" field.

**Because** many-to-many relationships need a junction table.
