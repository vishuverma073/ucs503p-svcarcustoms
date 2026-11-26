# Week 4 : COD advance not enforced at the gateway

**Team focus this week:** Vehicle fitment and navigation  
**Work this week:** COD advance amount in the API

## Error

A COD order could be sent to PayU with a stored amount instead of the 15% advance.

## Relevant Context

The webhook and checkout each worked out the advance in their own way.

## Key Observation

There was no single function for "how much goes to PayU".

## Solution

Added `gatewayPaymentAmount(total, method)` in `lib/payment-amount.ts` (15% for COD, 100% prepaid, in paise) and used it in checkout and webhook; tests in `payment-amount`, `checkout` and `webhooks`.

**Because** one shared function means checkout and verification can never disagree.
