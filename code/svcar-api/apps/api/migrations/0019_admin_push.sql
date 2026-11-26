-- Admin push subscriptions (2026-10-22). Hand-written: run in the Supabase SQL
-- editor BEFORE deploying the API build that serves /admin/push.
-- (That build reads this table on every paid order and every new phone lead;
-- deploying it first would make the Admin → Notifications card fail. Orders and
-- leads themselves never wait on it — the push is fire-and-forget.)

-- One row per admin device (browser) that turned on notifications. `endpoint`
-- is the push service URL the browser handed out (FCM for Chrome/Android, Apple
-- for iPhone home-screen apps, Mozilla for Firefox); p256dh + auth are the
-- browser's encryption keys for that endpoint. The API deletes a row as soon as
-- the push service answers 404/410 (the browser dropped the subscription).
CREATE TABLE IF NOT EXISTS "admin_push_subscriptions" (
  "id" bigserial PRIMARY KEY,
  "admin_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "notify_orders" boolean NOT NULL DEFAULT true,
  "notify_leads" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_success_at" timestamptz,
  "last_error" text
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_push_subscriptions_admin_idx" ON "admin_push_subscriptions" ("admin_user_id");--> statement-breakpoint

-- Same as 0016/0018: RLS on, no policies. The API connects as the table owner,
-- which bypasses RLS; this only shuts Supabase's public Data API (anon key) out.
ALTER TABLE "admin_push_subscriptions" ENABLE ROW LEVEL SECURITY;
