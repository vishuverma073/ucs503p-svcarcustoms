# Week 5 : Security advisories in Next.js

**Team focus this week:** Payments and COD  
**Work this week:** Dependency security upgrade

## Error

`npm audit` reported critical advisories in Next.js 16.0.0–16.4.0.

## Relevant Context

The storefront ran Next.js 16.4.0.

## Key Observation

Advisories included remote code execution in the image optimiser.

## Solution

Upgraded to 16.4.2; type-check, tests and both builds passed, and the mock purchase journey passed 113/113.

**Because** dependencies need regular security updates.
