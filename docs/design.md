# Design

The diagrams below are the same views as in the final report, drawn here with
Mermaid so they render on this site.

## SDLC model

Iterative and incremental, with roughly weekly increments: foundations → admin
→ read paths → auth and cart → payments → caching and observability → search,
fitment and SEO → post-launch increments (guest checkout, COD advance, promo
codes, analytics). Every increment goes through a pull request that must pass
CI.

## Architecture

```mermaid
flowchart TB
  C[Customer browser] -->|HTTPS| W
  A[Admin browser] -->|HTTPS| W
  W["Vercel: Next.js 16 storefront + admin<br/>server-rendered, cached pages"] -->|JSON / REST| API
  API["Fly.io: Hono REST API<br/>JWT auth, Zod validation, pricing, orders"]
  API -->|Drizzle ORM| DB[(Supabase PostgreSQL + Storage)]
  API <-->|signed hash + webhook| P[PayU]
  API --> J[Inngest jobs, Resend email, MSG91 SMS, Redis]
  API --> PIN[India Post pincode API]
  G[Google Search / Merchant Center] -->|crawl, feed.xml| W
```

## Use cases

```mermaid
flowchart LR
  Cu((Guest / Customer)) --- U1([Browse / search catalogue])
  Cu --- U2([Check vehicle fitment])
  Cu --- U3([Save car in My Garage])
  Cu --- U4([Manage cart])
  Cu --- U5([Checkout and pay])
  Cu --- U6([Sign in with email OTP])
  Cu --- U7([Track order])
  U5 --- PayU((PayU))
  Ad((Admin)) --- A1([Manage products and categories])
  Ad --- A2([Process orders / collect COD])
  Ad --- A3([Manage promo codes])
  Ad --- A4([Edit settings and home page])
  Ad --- A5([View analytics and audit log])
```

## Class diagram

```mermaid
classDiagram
  Category "0..*" -- "0..*" Product
  Product "1" *-- "0..*" SKU
  Product "1" *-- "1..*" ProductImage
  Product "0..*" -- "0..*" VehicleModel : Fitment
  User "1" -- "0..*" Order
  Order "1" *-- "1..*" OrderItem
  Order "1" *-- "0..*" OrderEvent
  class Product { id; title; slug; status }
  class SKU { id; price; stock; +inStock() bool }
  class Order { orderNumber; status; subtotal; discount; shippingFee; gst; total; paymentMethod; advanceAmount; +balanceDue() }
  class OrderItem { skuId; title; qty; unitPrice }
```

## Checkout sequence

```mermaid
sequenceDiagram
  participant UI as Customer UI
  participant API as Hono API
  participant DB as PostgreSQL
  participant P as PayU
  participant J as Inngest
  UI->>API: POST /checkout
  API->>DB: load cart, SKUs, settings
  DB-->>API: trusted data
  API->>API: compute totals
  API->>DB: create order + items (pending)
  API-->>UI: signed PayU form
  UI->>P: pay (full or 15% COD advance)
  P->>API: callback / webhook
  API->>API: verify hash + amount
  opt verified
    API->>DB: mark paid, add event
    API->>J: order.paid → email + SMS
  end
```

## Order states

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> paid : verified payment
  pending --> pending : payment failed, retry
  pending --> cancelled : fail / cancel
  paid --> confirmed : admin confirms
  paid --> refunded : refund
  confirmed --> refunded : refund
  confirmed --> shipped : dispatch
  shipped --> delivered : received
  delivered --> [*]
```

## Data flow (level 1)

```mermaid
flowchart LR
  C[Customer] -->|search, add to cart| P1((1.0 Browse and cart))
  D1[(D1 Catalogue)] -->|products, fitment| P1
  P1 -->|cart items| P2((2.0 Checkout and payment))
  PayU[PayU] <-->|payment| P2
  D3[(D3 Settings)] -->|GST, shipping| P2
  P2 -->|new order| D2[(D2 Orders)]
  D2 <-->|order updates| P3((3.0 Order management))
  Ad[Admin] <-->|status, settings| P3
  P3 -->|settings| D3
```

## Data model

28 tables in PostgreSQL:

| Area | Tables |
|------|--------|
| Catalogue | categories, products, product_images, product_categories |
| Variants | dimensions, dimension_values, skus |
| Fitment | vehicle_makes, vehicle_models, product_fitments |
| Customers | users, otp_codes, addresses |
| Commerce | carts, cart_items, orders, order_items, order_events, order_backups, promo_codes |
| Operations | settings, home_config, audit_log, admin_push_subscriptions |
| Growth | subscribers, analytics_events, whatsapp_leads, phone_leads |
