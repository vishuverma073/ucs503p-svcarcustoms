# Week 3 : Duplicate products competing in search

**Team focus this week:** Login and accounts  
**Work this week:** Duplicate product URLs

## Error

Three products existed twice in the catalogue and competed for the same searches.

## Relevant Context

Each copy had its own URL in the sitemap and feed.

## Key Observation

Google treats them as duplicate content.

## Solution

`lib/duplicate-products.ts` maps copies to the primary: canonical points to the primary, copies are `noindex` and left out of sitemap and feed.

**Because** one canonical URL per product concentrates ranking.
