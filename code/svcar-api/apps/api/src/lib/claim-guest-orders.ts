import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { orders } from "../db/schema.js";
import { log } from "./logger.js";

/**
 * Attach the guest orders placed with this email to the account that just
 * proved it owns the email (OTP or password sign-in), so "My orders" shows
 * them. The guest token keeps working too; only orders with no user move.
 * Best-effort: a failure here must never block the sign-in.
 */
export async function claimGuestOrders(db: DbClient, userId: string, email: string): Promise<void> {
  try {
    await db
      .update(orders)
      .set({ userId })
      .where(and(isNull(orders.userId), eq(sql`lower(${orders.customerEmail})`, email.toLowerCase())));
  } catch (err) {
    log("warn", "claim_guest_orders_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}
