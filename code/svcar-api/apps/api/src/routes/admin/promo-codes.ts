import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import {
  AdminPromoCodeCreateSchema,
  AdminPromoCodePatchSchema,
  type AdminPromoCodeList,
} from "@svcar/contracts";
import type { DbClient } from "../../db/client.js";
import { promoCodes } from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { postgresErrorCode } from "../../lib/pg-error.js";
import { toAdminPromo, type PromoRow } from "../../lib/promo.js";
import type { AppEnv } from "../../lib/types.js";

/**
 * Admin → Promo codes: list (with how often each was used), create, edit
 * (on/off, % off, minimum, cap, window, usage limit) and delete.
 *
 * Nothing here needs a cache bust: checkout reads codes live, and the public
 * GET /promos/active list is only edge-cached for a minute.
 *
 * Orders keep the code as text (orders.promo_code), not a foreign key, so
 * deleting a code never touches the orders that used it.
 */

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);
const money = (v: number | null | undefined) => (v == null ? null : String(v));

export function makeAdminPromoCodesRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  // GET /admin/promo-codes — every code, newest first.
  router.get("/", async (c) => {
    const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt), desc(promoCodes.id));
    const body: AdminPromoCodeList = { items: rows.map(toAdminPromo) };
    return c.json(body);
  });

  // POST /admin/promo-codes — create. The code is uppercased by the schema.
  router.post("/", async (c) => {
    const parsed = AdminPromoCodeCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    const d = parsed.data;
    let row: PromoRow | undefined;
    try {
      [row] = await db
        .insert(promoCodes)
        .values({
          code: d.code,
          percentOff: d.percentOff,
          minSubtotal: String(d.minSubtotal),
          maxDiscount: money(d.maxDiscount),
          startsAt: toDate(d.startsAt),
          endsAt: toDate(d.endsAt),
          active: d.active,
          usageLimit: d.usageLimit,
        })
        .returning();
    } catch (err) {
      if (postgresErrorCode(err) === "23505") {
        return c.json({ error: "Code exists", message: `${d.code} already exists.` }, 409);
      }
      throw err;
    }
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "promo_code.create",
      resourceType: "promo_code",
      resourceId: String(row!.id),
      changes: { after: d },
    });
    return c.json(toAdminPromo(row!), 201);
  });

  // PATCH /admin/promo-codes/:id — any subset of the editable fields.
  router.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid id" }, 400);
    const parsed = AdminPromoCodePatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    const d = parsed.data;

    const [before] = await db.select().from(promoCodes).where(eq(promoCodes.id, id)).limit(1);
    if (!before) return c.json({ error: "Not Found" }, 404);

    // The window rule again, against whichever end this patch leaves unchanged.
    const startsAt = d.startsAt !== undefined ? toDate(d.startsAt) : before.startsAt;
    const endsAt = d.endsAt !== undefined ? toDate(d.endsAt) : before.endsAt;
    if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
      return c.json({ error: "Invalid request", message: "Ends must be after starts" }, 400);
    }

    const [row] = await db
      .update(promoCodes)
      .set({
        ...(d.percentOff !== undefined ? { percentOff: d.percentOff } : {}),
        ...(d.minSubtotal !== undefined ? { minSubtotal: String(d.minSubtotal) } : {}),
        ...(d.maxDiscount !== undefined ? { maxDiscount: money(d.maxDiscount) } : {}),
        ...(d.startsAt !== undefined ? { startsAt } : {}),
        ...(d.endsAt !== undefined ? { endsAt } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
        ...(d.usageLimit !== undefined ? { usageLimit: d.usageLimit } : {}),
      })
      .where(eq(promoCodes.id, id))
      .returning();
    if (!row) return c.json({ error: "Not Found" }, 404);

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "promo_code.update",
      resourceType: "promo_code",
      resourceId: String(id),
      changes: { before: toAdminPromo(before), after: d },
    });
    return c.json(toAdminPromo(row));
  });

  // DELETE /admin/promo-codes/:id
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid id" }, 400);
    const [deleted] = await db.delete(promoCodes).where(eq(promoCodes.id, id)).returning();
    if (!deleted) return c.json({ error: "Not Found" }, 404);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "promo_code.delete",
      resourceType: "promo_code",
      resourceId: String(id),
      changes: { before: toAdminPromo(deleted) },
    });
    return c.body(null, 204);
  });

  return router;
}
