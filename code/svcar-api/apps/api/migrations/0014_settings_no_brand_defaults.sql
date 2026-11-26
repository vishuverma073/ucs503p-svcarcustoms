-- Drop the SV Car Customs brand defaults off the settings singleton.
--
-- This repo is now a template: forking it for a second business means copying
-- the tree, editing src/config/brand.ts, and pointing at a fresh database. With
-- 'SV Car Customs' / '+919350529717' / 'support@svcarcustoms.com' baked in as
-- column defaults, a fork's brand-new settings row silently came up wearing the
-- wrong business's name — a bug you only notice once a customer email goes out.
--
-- Seeding now happens explicitly instead: scripts/init-store.ts (`pnpm store:init`)
-- writes every column from config/brand.ts, and scripts/seed-from-data.ts does
-- the same inline.
--
-- SAFETY: a column DEFAULT is only consulted when an INSERT omits the column.
-- This touches no existing row, and the settings table holds exactly one row
-- (id = 1, pinned by the settings_singleton CHECK) which is already populated.
-- The columns stay NOT NULL, so nothing can insert a blank row afterwards.

ALTER TABLE "settings" ALTER COLUMN "store_name" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "support_phone" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "support_email" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "whatsapp_number" DROP DEFAULT;
