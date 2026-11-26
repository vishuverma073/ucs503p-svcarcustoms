-- Promo codes (2026-10-27). Hand-written: run in the Supabase SQL editor
-- BEFORE deploying the API build that serves /cart/apply-promo, /promos/active
-- and /admin/promo-codes.
-- (That build reads promo_codes and writes orders.promo_code / orders.discount
-- on every order; deploying it first would make every checkout fail, with or
-- without a code.)

-- One row per code. `code` is stored uppercase (the API uppercases whatever the
-- shopper typed before looking it up). The discount is `percent_off` of the
-- order subtotal, rounded to the rupee and capped at `max_discount` when set.
-- A code applies only while `active`, inside [starts_at, ends_at] (either end
-- may be open), while used_count < usage_limit (null = unlimited) and when the
-- subtotal is at least `min_subtotal`. `used_count` goes up by one when an
-- order carrying the code is paid (the pending → paid transition, once).
CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id" serial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "percent_off" integer NOT NULL,
  "min_subtotal" numeric(10, 2) NOT NULL DEFAULT 0,
  "max_discount" numeric(10, 2),
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "active" boolean NOT NULL DEFAULT true,
  "usage_limit" integer,
  "used_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "promo_codes_code_upper" CHECK ("code" = upper("code") AND "code" <> ''),
  CONSTRAINT "promo_codes_percent_off_range" CHECK ("percent_off" BETWEEN 1 AND 90),
  CONSTRAINT "promo_codes_min_subtotal_nonneg" CHECK ("min_subtotal" >= 0),
  CONSTRAINT "promo_codes_max_discount_pos" CHECK ("max_discount" IS NULL OR "max_discount" > 0),
  CONSTRAINT "promo_codes_usage_limit_pos" CHECK ("usage_limit" IS NULL OR "usage_limit" > 0),
  CONSTRAINT "promo_codes_window" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at")
);--> statement-breakpoint

-- The order remembers which code it used and how much it took off. `subtotal`
-- stays the pre-discount sum of the lines; `total` (and so the PayU charge and
-- the COD advance) is subtotal − discount + shipping.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promo_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount" numeric(10, 2) NOT NULL DEFAULT 0;--> statement-breakpoint

-- Diwali 2026 sale codes, live from now until the end of 8 Nov (IST). Safe to
-- re-run: an existing code is left exactly as the admin last edited it.
INSERT INTO "promo_codes" ("code", "percent_off", "min_subtotal", "starts_at", "ends_at")
VALUES
  ('DIWALI10', 10, 7000, now(), '2026-11-08 23:59:59+05:30'),
  ('DIWALI5', 5, 3000, now(), '2026-11-08 23:59:59+05:30')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint

-- Same as 0016/0018/0019: RLS on, no policies. The API connects as the table
-- owner, which bypasses RLS; this only shuts Supabase's public Data API (anon
-- key) out.
ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;
