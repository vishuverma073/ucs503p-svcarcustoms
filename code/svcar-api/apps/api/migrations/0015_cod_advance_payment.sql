-- COD uses a verified 15% online advance. Keep settlement separate from delivery status.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" text NOT NULL DEFAULT 'prepaid';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status" text NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "advance_amount" numeric(10,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "advance_paid" numeric(10,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "remaining_amount" numeric(10,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_valid" CHECK (payment_method IN ('prepaid', 'cod'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_valid" CHECK (payment_status IN ('pending', 'paid', 'partially_paid'));
