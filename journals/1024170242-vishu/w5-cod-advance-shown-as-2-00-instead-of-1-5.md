# Week 5 : COD advance shown as ₹2.00 instead of ₹1.50

**Team focus this week:** Payments and COD  
**Work this week:** COD amounts in the checkout UI

## Error

The checkout button showed a different advance from what PayU charged.

## Relevant Context

The page computed `Math.round(total * 15) / 100`.

## Key Observation

Rounding before dividing by 100 rounds to whole rupees; the API rounds in paise.

## Solution

Changed to `Math.round(total * 100 * 0.15) / 100`, matching the backend.

**Because** money must be rounded at the same unit (paise) everywhere.
