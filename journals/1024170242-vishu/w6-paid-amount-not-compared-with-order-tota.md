# Week 6 : Paid amount not compared with order total

**Team focus this week:** SEO, images and performance  
**Work this week:** Payment amount checks on return and webhook

## Error

Audit finding: the server trusted the hash alone before marking an order paid.

## Relevant Context

The reverse hash covers the amount, so this mattered only if the merchant salt ever leaked.

## Key Observation

That is exactly the case the amount check protects against, and PayU requires it.

## Solution

Both the return URL and the webhook compare the paid amount with the order total; a mismatch keeps the order pending, is logged and alerts the team.

**Because** defence in depth: a second check catches what the first misses.
