# Implementation

## Code map

| Path | What it is |
|------|------------|
| `code/svcar-india/src/app/(store)` | Storefront pages: home, shop, category, product, cart, checkout, orders, track, account |
| `code/svcar-india/src/app/admin` | Admin panel pages |
| `code/svcar-india/src/mocks` | Mock Service Worker fixtures (run the UI without the API) |
| `code/svcar-api/apps/api/src/routes` | REST routes (public and `admin/`) |
| `code/svcar-api/apps/api/src/lib` | Business logic: pricing, promo, payments, PayU, OTP, rate limits, audit |
| `code/svcar-api/apps/api/src/inngest` | Background jobs: order-paid, reconcile-pending, unpaid-order alert |
| `code/svcar-api/apps/api/src/db/schema.ts` | Drizzle schema (28 tables) |
| `code/svcar-api/apps/api/migrations` | 22 SQL migrations |
| `code/svcar-api/packages/contracts` | Zod request/response contracts shared by both apps |
| `code/brand.config.ts` | White-label store configuration |

## Key modules

**Pricing** (`lib/pricing.ts`): subtotal from current SKU prices in integer
paise; free shipping when the pre-discount subtotal reaches the threshold;
GST shown as `net − net / (1 + rate)` because prices are GST-inclusive;
total = subtotal − discount + shipping.

**Payments** (`lib/payu.ts`, `routes/webhooks.ts`, `lib/mark-paid.ts`): the
order is created first; the PayU request is signed with SHA-512; the return
callback and the webhook both verify the hash and the amount before the order
becomes `paid`. `reconcile-pending` runs every 15 minutes for lost callbacks.

**Authentication** (`routes/auth.ts`, `lib/otp.ts`): six-digit email OTP,
bcrypt-hashed, 5-minute expiry, 5 attempts (counted atomically in SQL), rate
limited per email and per IP. Admin tokens use a separate secret and the admin
flag is re-checked in the database.

**Fitment and My Garage**: `product_fitments` links products to vehicle
models; the storefront `garageStore` keeps the shopper's car and filters
search and category results.

## Running locally

```bash
# API → http://localhost:8787
cd code/svcar-api && pnpm install && pnpm --filter @svcar/contracts build && pnpm dev

# Storefront → http://localhost:3000 (admin at /admin)
cd code/svcar-india && npm install && npm run dev
```

To run the storefront without the API, set `NEXT_PUBLIC_USE_MOCKS=true` in
`code/svcar-india/.env.local`. Environment variables are listed in the
`.env.example` files; no secrets are stored in this repository.
