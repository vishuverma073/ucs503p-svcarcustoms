-- Security hardening (audit 2026-10-07). Hand-written: run in the Supabase SQL
-- editor BEFORE deploying the API build that reads users.password_changed_at.
-- (That build selects the column; deploying it first would break every login.)

-- 1. Password changes end older sessions: refresh and admin tokens issued
--    before this timestamp are rejected (src/lib/jwt.ts issuedBeforePasswordChange).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamptz;--> statement-breakpoint

-- 2. Row Level Security on every table in `public`, with no policies.
--    The API connects as the table owner (postgres), which bypasses RLS, so the
--    app is unaffected. What this shuts is Supabase's auto-generated Data API
--    (PostgREST): with RLS off, anyone holding the project's anon key could read
--    users.password_hash, orders and addresses directly.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
