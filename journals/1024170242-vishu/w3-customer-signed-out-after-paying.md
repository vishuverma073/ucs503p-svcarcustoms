# Week 3 : Customer signed out after paying

**Team focus this week:** Login and accounts  
**Work this week:** Order confirmation page after payment

## Error

After paying on PayU the customer came back logged out and landed on the login page.

## Relevant Context

The refresh cookie was `SameSite=Lax`, and PayU redirected to `/orders/:n`, which needs login.

## Key Observation

The storefront and the API are different sites, so a `Lax` cookie is not sent on cross-site refresh calls; the PayU return is a full page load, so the session was lost.

## Solution

Refresh cookie set to `SameSite=None; Secure` in production; PayU now returns to a public `/order-confirmation/:n` page with the order number, a Track button and Retry on failure.

**Because** cross-site requests only carry cookies marked `SameSite=None; Secure`.
