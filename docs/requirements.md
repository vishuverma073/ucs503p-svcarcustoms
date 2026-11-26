# Requirements (SRS summary)

The full Software Requirements Specification is
[`srs/main.pdf`](https://github.com/vishuverma073/ucs503p-svcarcustoms/blob/master/srs/main.pdf)
(version 1.1, 26 Nov 2026). It follows the IEEE 830 structure and defines
**47 functional** and **15 non-functional** requirements.

## Users

| User class | What they do |
|------------|--------------|
| Guest | Browse, search, use the cart and check out with email, phone and address |
| Registered customer | Everything a guest can, plus order history and saved addresses (login by email OTP) |
| Admin | Manages products, orders, settings and marketing from the admin panel |
| System actors | PayU webhooks, background jobs, search-engine crawlers |

## Functional requirement groups

| Group | IDs | Examples |
|-------|-----|----------|
| Catalogue | FR-CAT-01 to 06 | Category pages (48 per page), product pages, hide drafts |
| Search and fitment | FR-SRC-01 to 05 | Search, vehicle fitment, My Garage |
| Cart and checkout | FR-CHK-01 to 07 | Pincode lookup, server pricing, guest checkout, promo codes |
| Payments | FR-PAY-01 to 06 | Signed PayU request, hash verification, COD advance, reconciliation |
| Accounts | FR-ACC-01 to 06 | Email OTP, order history, tracking page, notifications |
| Admin | FR-ADM-01 to 12 | Products, categories, orders, settings, audit log, cache refresh |
| SEO | FR-SEO-01 to 05 | Sitemap, Product JSON-LD, Merchant Center feed |

## Business rules

- Prices include GST (default 28%, set by the admin).
- Shipping is free from the admin-set threshold (default ₹5,000); otherwise a
  flat fee applies (default ₹200).
- COD orders pay a 15% advance online; the balance is collected on delivery.
- Only active products can be ordered.

## Changes from SRS v1.0

- Customer login is by **email** OTP; SMS is used only for order updates.
- *My Garage* is implemented (FR-SRC-05), no longer future work.
- Promo codes (FR-CHK-07, FR-ADM-12) and guest-order linking (FR-ACC-06) added.
