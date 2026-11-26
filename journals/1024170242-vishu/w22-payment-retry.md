# A retried payment could charge twice

## Error

During a payment audit we found that if a customer's first PayU attempt
succeeded but both the browser return and the webhook were lost, the order
stayed `pending`, and the **Retry** button started a second, real charge.

## Relevant Context

Retry creates a new PayU transaction for the same order. The order only knew
about the payment if a callback or webhook arrived.

## Key Observation

The server never asked PayU whether an earlier attempt for this order had
already succeeded before starting a new one.

## Solution

Before a retry, the API calls PayU's `verify_payment` for the order's earlier
attempts. If one succeeded, the order is marked paid and the retry is refused
with `409`; the storefront then refreshes the order instead of showing an
error. Related fixes in the same change: unique transaction ids per retry,
the webhook returns 500 on a processing error so PayU retries it, and COD
amounts are shown with paise so they match PayU exactly.

**Because** the payment gateway, not the browser, is the source of truth for
whether money was taken.
