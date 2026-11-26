# Week 1 : Choosing and wiring the payment gateway

**Team focus this week:** Requirements and project setup  
**Work this week:** PayU integration; deployment setup (Vercel, Fly.io, Supabase)

## Error

The store needed online payments; the first integration used Razorpay, which the business would not use.

## Relevant Context

Checkout code called one provider directly.

## Key Observation

Payments needed to be swappable without touching checkout logic.

## Solution

Added a provider selector (`lib/payments.ts`) and a PayU hosted-checkout module (`lib/payu.ts`) with request/response hashing, a browser return route and a server webhook, plus PayU columns on `orders` (migration 0011). Razorpay was switched off.

**Because** hiding the provider behind one interface keeps checkout independent of the gateway.
