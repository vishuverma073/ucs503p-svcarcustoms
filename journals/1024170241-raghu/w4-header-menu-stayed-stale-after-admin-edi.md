# Week 4 : Header menu stayed stale after admin edits

**Team focus this week:** Vehicle fitment and navigation  
**Work this week:** Category caching and invalidation

## Error

Changing which categories show in the header had no effect until the cache expired.

## Relevant Context

Cache invalidation cleared keys starting with `category:`.

## Key Observation

The header reads the key `categories:all`, which that prefix does not match.

## Solution

Added `categories:all` to the invalidation explicitly; the frontend now revalidates the SWR key the header really uses (`shop-nav`).

**Because** cache invalidation must name every key that holds the data.
