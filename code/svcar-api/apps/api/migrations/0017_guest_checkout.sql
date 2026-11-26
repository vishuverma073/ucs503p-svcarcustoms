-- Guest checkout (2026-10-18). Hand-written: run in the Supabase SQL editor
-- BEFORE deploying the API build that writes orders.guest_token_hash.
-- (That build selects the column; deploying it first would break checkout.)

-- A guest order (user_id IS NULL) is reachable only with the random token handed
-- to the buyer's browser when the order is placed: it lets them retry payment and
-- view/track the order without an account. Only the SHA-256 of the token is
-- stored, so a database read can't be replayed as access.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "guest_token_hash" text;
