# SV Car Customs — Project Overview

A full-stack e-commerce platform for a car-accessories / customisation business:
a public storefront, a custom-builds landing experience, and a full admin panel,
backed by its own API.

Built as a **white-label platform** — the store it currently runs is one brand;
a second business can be stood up from the same code by editing one config file.

> Nothing in this document contains credentials, environment values, live host
> names, database identifiers, or customer/business contact details.

---

## 1. At a glance

| | |
|---|---|
| **Repo layout** | Two apps in one repo (`svcar-api`, `svcar-india`) + a shared contracts package |
| **Backend** | Node.js 20+ · Hono · Drizzle ORM · PostgreSQL |
| **Frontend** | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 |
| **Payments** | PayU hosted checkout (server-verified, webhook-confirmed) |
| **Auth** | Email OTP for customers, separate password login for admins (both JWT) |
| **Tests** | ~62 test files — 40+ backend (Vitest), 20+ frontend (Vitest + MSW) |
| **Size** | ~12.7k lines backend, ~27.5k lines frontend TypeScript |
| **History** | 67 commits, ~3.5 months of work |
| **Hosting** | API on Fly.io (Docker), storefront on Vercel, Postgres + object storage on Supabase |

---

## 2. Repository structure

```
.
├── brand.config.ts          # the ONE file that defines a brand (see §7)
├── scripts/apply-brand.ts   # generator: pushes brand config into both apps
├── NEW-BUSINESS.md          # how to fork this into a different business
├── qa/                      # QA strategy + functional & security test catalogs
│
├── svcar-api/               # backend — pnpm workspace
│   ├── apps/api/            #   the Hono service
│   ├── packages/contracts/  #   shared Zod schemas (the API↔web contract)
│   ├── Dockerfile, fly.toml
│   └── .github/workflows/ci.yml
│
└── svcar-india/             # frontend — Next.js App Router
    ├── src/app/(store)/     #   public storefront
    ├── src/app/admin/       #   admin panel
    ├── src/app/customs/     #   custom-builds landing experience
    ├── src/components/      #   store / admin / customs / ui components
    ├── src/lib/             #   API clients, business helpers
    ├── src/store/           #   Zustand stores (cart, auth, garage, ui)
    ├── src/contracts/       #   mirrored Zod contracts
    └── src/mocks/           #   MSW handlers — run the UI with no backend
```

The two apps deploy independently, so they never import each other's source —
they agree through **Zod schemas** that exist on both sides.

---

## 3. Backend (`svcar-api`)

**Stack:** Hono (web framework) · Drizzle ORM · `postgres` driver · Zod ·
bcryptjs · Inngest (background jobs) · Upstash Redis (rate limiting / cache) ·
Sentry.

### Data model (25 tables)

- **Catalog** — `categories`, `products`, `product_images`, `product_categories`
- **Variants** — `dimensions`, `dimension_values`, `skus` (a product × size/colour matrix)
- **Vehicle fitment** — `vehicle_makes`, `vehicle_models`, `product_fitments`
  (which parts fit which car — this is a car-parts store, so fitment is first-class)
- **Customers** — `users`, `otp_codes`, `addresses`
- **Commerce** — `carts`, `cart_items`, `orders`, `order_items`, `order_events`, `order_backups`
- **Ops** — `settings` (singleton, admin-editable), `home_config`, `audit_log`
- **Growth** — `subscribers`, `analytics_events`, `whatsapp_leads`

### Route map

*Public:* `/healthz` · `/categories` · `/products` · `/vehicles` · `/search` ·
`/home` · `/settings` · `/pincode` · `/newsletter` · `/leads` · `/analytics/track`

*Customer (JWT):* `/auth/otp/send` · `/auth/otp/verify` · `/auth/password/login` ·
`/auth/refresh` · `/auth/logout` · `/me` (profile, cart, addresses, orders) ·
`/checkout/order` · `/payments/*`

*Webhooks:* `/webhooks/payu`

*Admin (separate JWT + DB re-check):* `/admin/auth/login` · `/admin/products` ·
`/admin/categories` · `/admin/orders` (incl. status events, COD collection) ·
`/admin/home` · `/admin/settings` · `/admin/uploads` · `/admin/analytics` ·
`/admin/audit-log` · `/admin/leads` · `/admin/subscribers` · `/admin/live`

### Cross-cutting middleware

Request ID → security headers → body-size limit (6 MB) → CORS → structured
JSON logging → cache-control. Errors funnel into one handler that logs, reports
to Sentry, and posts a Slack alert.

---

## 4. Frontend (`svcar-india`)

**Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · Zustand (client
state) · SWR (data fetching) · react-hook-form + Zod · dnd-kit (admin drag &
drop) · Sonner (toasts) · Sentry · Vercel Analytics & Speed Insights.

### Three surfaces in one app

**a) Storefront** — `/`, `/category/[slug]`, `/product/[slug]`, `/search`,
`/cart`, `/checkout`, `/login`, `/account`, `/orders`, `/order-confirmation`,
plus content/legal pages (about, contact, FAQ, shipping, refund, terms, privacy).

Notable pieces: hero + category carousels, a **"My Garage"** vehicle selector
that filters the catalog to parts fitting the shopper's car, fitment badges on
product pages, infinite-scroll category listings, WhatsApp lead capture,
newsletter signup, live visitor count, recent-purchase social proof, a store
location map, and a dark/light theme toggle.

**b) Admin panel** — `/admin/*`: dashboard, products (list, editor, variants
matrix, fitment editor, image uploader), a drag-and-drop category tree with
archive/restore, orders with a status timeline and COD collection, a homepage
layout builder, store settings, analytics, an audit log, leads, subscribers, and
a live-activity view. Mobile-aware (sidebar on desktop, bottom nav on phones).

**c) Customs experience** — `/customs`: a separate, more cinematic landing page
for the customisation side of the business — hero, particle background,
before/after slider, an interactive wrap configurator, builds carousel, animated
stat counters, service cards and a booking CTA.

### Rendering & performance choices

- Home and product pages render server-side (they work with JavaScript disabled).
- Images bypass Vercel's optimizer via a **custom image loader** that resizes
  through Supabase's render endpoint (AVIF/WebP), after the Vercel quota ran out.
- Session endpoints are proxied through Next so the refresh cookie is
  first-party — Safari and Firefox block third-party cookies and were silently
  signing customers out on every reload.
- Full SEO surface: `sitemap.ts`, `robots.ts`, canonical URLs, JSON-LD,
  code-drawn Open Graph images per product.
- CSP, HSTS, `X-Frame-Options`, `nosniff`, Referrer-Policy and Permissions-Policy
  set in `next.config.ts`.

### Working without a backend

`NEXT_PUBLIC_USE_MOCKS=true` boots **MSW** with a full set of handlers and
fixture data, so the whole UI (including admin) runs standalone. MSW is hard-off
in production.

---

## 5. How the interesting flows work

### Authentication
Customers log in with an **email OTP**: a 6-digit code is generated, hashed
(never stored in plaintext), given a 5-minute TTL and a 5-attempt cap, and
emailed via Resend. Verification issues a short-lived access JWT plus a
refresh token in an httpOnly cookie scoped to `/auth`. Refresh tokens carry a
`jti` and can be revoked. Customers can optionally set a password afterwards.
Unknown emails still pay the cost of a bcrypt compare against a dummy hash, so
the response time doesn't reveal which accounts exist.

Admins use a **completely separate JWT** signed with a different secret, and
every admin request re-checks `is_admin` against the database (cached 60 s)
rather than trusting the token's claim.

### Checkout and payments
1. The client posts a checkout request; the server loads the cart **from the
   database** and re-validates every SKU still exists.
2. Totals are computed server-side in **paise (integers)** to avoid float drift
   — subtotal, GST, and shipping (flat fee below a threshold, free above it),
   with the rates read from the admin-editable settings row.
3. An order row is created; the order number is derived by hashing the order's
   UUID rather than being a guessable counter.
4. The customer is handed off to **PayU hosted checkout** (a full-page form POST
   with a signed hash), so card data never touches this system.
5. Payment is confirmed by PayU's server callback **and** the
   `/webhooks/payu` webhook — both verify the response hash, and payment amount
   is re-checked against the order.
6. A paid order fires an Inngest job (`order-paid`) for confirmation email and
   follow-ups; a second job (`reconcile-pending`) sweeps orders stuck in
   pending. Orders are also snapshotted into `order_backups`.

COD is supported with an advance-payment variant, and admins can mark COD
collected.

The client is treated as hostile throughout: no price, total, discount,
quantity, ownership claim or payment status submitted by the browser is trusted.

### Analytics
Own first-party analytics: `/analytics/track` writes page-view rows
(visitor, session, device, referrer, city) that power an in-admin dashboard —
visitors, traffic trend, acquisition channels, devices, top cities — alongside
GA4 / Meta Pixel.

---

## 6. Quality, testing and operations

- **~62 test files.** Backend Vitest suites cover auth, checkout, pricing,
  PayU hashing, payment amounts, admin authorisation, uploads, caching,
  order events, search, settings and more. Frontend Vitest suites cover the
  cart store, checkout helpers, API clients, category/nav logic, SKU matrix
  maths and order tracking.
- **`qa/`** holds a written QA strategy plus a functional test catalog
  (Given/When/Then with stable IDs) and an **OWASP-mapped security test
  catalog** — BOLA/IDOR, JWT handling, payment integrity, injection,
  mass-assignment, file upload, business logic.
- **A structured security & correctness audit** was run against the codebase
  with its own evidence rules (every finding must cite `file:line` and carry a
  confidence status; findings sorted by real exploitability, not textbook
  severity) across inventory, business logic, authorisation, appsec and
  reliability.
- **CI** on GitHub Actions; observability via Sentry, structured JSON logs,
  a `/metrics` endpoint and Slack alerting on unhandled 5xx.
- **Audit log** — admin mutations are recorded and browsable in the panel.

---

## 7. The white-label angle

Everything that makes the store *that* store — name, colours, contact details,
tax and shipping defaults, SEO copy, social links — lives in a single root file,
`brand.config.ts`. Running `npm run brand:apply` generates the derived artifacts
in both apps (the API's brand defaults, the storefront's `BRAND` object, the CSS
theme tokens, and the env-var manifests for each app). `npm run brand:check`
fails CI if a generated file has been hand-edited and drifted.

Configuration resolves in three layers, in precedence order:

1. **Environment variables** — per-deploy, never committed
2. **`brand.config.ts`** — identity, committed, edited once per business
3. **The `settings` table** — admin-editable at runtime, no deploy needed

So a new business edits one file, runs one command, seeds the database, replaces
the assets and writes its own content pages.

---

## 8. Developer experience

```bash
# backend  → :8787
cd svcar-api && pnpm install && pnpm dev

# frontend → :3000   (admin at /admin)
cd svcar-india && npm install && npm run dev
```

In development, OTP codes print to the API terminal instead of being emailed,
payments run in stub mode, and CORS auto-allows localhost and LAN IPs so the
site can be tested from a phone. Operational scripts cover database migrations,
store initialisation, admin creation, catalog import from external sources,
image migration to object storage, order seeding, an end-to-end checkout smoke
test, and a search benchmark.
