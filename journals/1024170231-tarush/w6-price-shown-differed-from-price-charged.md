# Week 6 : Price shown differed from price charged

**Team focus this week:** SEO, images and performance  
**Work this week:** Price-check testing

## Error

Testing found that a guest cart could be charged today's price while showing an older one.

## Relevant Context

Browser cart lines keep the price from when they were added.

## Key Observation

Once SKU ids survived admin edits, old lines still pointed at valid SKUs with new prices.

## Solution

New `/cart/price-check`; cart and checkout re-price every line on load, and Pay is blocked if the order total differs from the shown total.

**Because** what the customer sees must equal what they are charged.
