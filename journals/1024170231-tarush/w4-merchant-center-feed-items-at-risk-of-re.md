# Week 4 : Merchant Center feed items at risk of rejection

**Team focus this week:** Vehicle fitment and navigation  
**Work this week:** Google Merchant Center feed

## Error

Some feed items would break Google Merchant Center policies.

## Relevant Context

The feed listed every product with its raw title.

## Key Observation

Titles naming third-party brands or "OEM/original" claims risk policy strikes; XML control characters break the feed.

## Solution

Feed built by a tested `lib/merchant-feed.ts`: sale price, Google category ids, safe titles, illegal characters stripped; 95 items listed, 27 held back with reasons.

**Because** only list what the business can confirm.
