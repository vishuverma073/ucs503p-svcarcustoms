-- Phone leads (2026-10-22). Hand-written: run in the Supabase SQL editor
-- BEFORE deploying the API build that writes phone_leads.
-- (That build inserts into and reads this table; deploying it first would make
-- every popup submission and the Admin → Phone leads page fail.)

-- One row per number a shopper typed into the storefront "Need help finding
-- the right part?" popup, after ticking consent. The phone is stored as the
-- 10-digit Indian mobile (no +91). The API skips the insert when the same
-- number already came in during the last 24 hours, so repeat taps don't pile up.
CREATE TABLE IF NOT EXISTS "phone_leads" (
  "id" bigserial PRIMARY KEY,
  "phone" text NOT NULL,
  "source" text NOT NULL DEFAULT 'popup',
  "page_path" text,
  "visitor_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "phone_leads_created_idx" ON "phone_leads" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_leads_phone_idx" ON "phone_leads" ("phone");--> statement-breakpoint

-- Same as 0016: RLS on, no policies. The API connects as the table owner, which
-- bypasses RLS; this only shuts Supabase's public Data API (anon key) out.
ALTER TABLE "phone_leads" ENABLE ROW LEVEL SECURITY;
