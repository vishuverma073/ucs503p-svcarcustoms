# Week 7 : A retried payment could charge twice

**Team focus this week:** Security and guest checkout  
**Work this week:** Payment audit (retry safety)

## Error

If the first attempt succeeded but both callbacks were lost, Retry started a second, real charge.

## Relevant Context

Retry created a new PayU transaction for the same order without asking PayU about earlier ones.

## Key Observation

PayU, not the browser, knows whether money was taken.

## Solution

Before a retry the API calls PayU `verify_payment` for earlier attempts; if one succeeded the order is marked paid and the retry refused with 409. Retry transaction ids are now unique.

**Because** the gateway is the source of truth for payments.
