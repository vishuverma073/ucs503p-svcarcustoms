import { Hono } from "hono";
import { and, asc, desc, eq, gte, or, sql } from "drizzle-orm";
import {
  AddOrderEventRequestSchema,
  OrderEventListResponseSchema,
  type OrderStatus,
} from "@svcar/contracts";
import type { DbClient } from "../../db/client.js";
import { orderEvents, orders } from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/types.js";

/** Order ids are uuids; reject anything else before it reaches the query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Date-range presets shared by the order list filter and the stats tiles. */
const RANGE_DAYS: Record<string, number | null> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
  all: null,
};
function rangeStart(range: string | undefined): Date {
  const d = RANGE_DAYS[range ?? "12m"] ?? 365;
  return d == null ? new Date(0) : new Date(Date.now() - d * 86400000);
}

/** Event types that are also order statuses — posting one advances the order. */
const STATUS_EVENTS: ReadonlySet<string> = new Set<OrderStatus>([
  "paid",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

/**
 * Admin order management: list (status / text / date-range filters, cursor
 * paginated), per-order detail, the tracking timeline admins append to, and
 * COD balance collection.
 */
export function makeAdminOrdersRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  // GET /admin/orders?status=&q=&range=&cursor= — newest-first order list.
  //
  // Cursor-paginated. This used to return a flat `limit: 200` with a hard-coded
  // `nextCursor: null`, which silently hid every order past the newest 200 —
  // the rows were unreachable from the admin UI entirely once the store passed
  // that many orders.
  //
  // The cursor is the last row's `(createdAt, id)` pair, compared as a Postgres
  // row value. Ordering on createdAt alone is not a stable sort — orders placed
  // in the same instant (a burst, or seeded data) share a timestamp, so a
  // createdAt-only cursor would skip or repeat rows at the page boundary.
  router.get("/", async (c) => {
    const status = c.req.query("status") as OrderStatus | undefined;
    const q = c.req.query("q")?.trim();
    const range = c.req.query("range");
    const conditions = [];
    if (status) conditions.push(eq(orders.status, status));
    if (range && range !== "all") conditions.push(gte(orders.createdAt, rangeStart(range)));
    if (q) {
      conditions.push(
        or(
          sql`${orders.orderNumber} ILIKE ${`%${q}%`}`,
          sql`${orders.customerPhone} ILIKE ${`%${q}%`}`,
          sql`${orders.customerName} ILIKE ${`%${q}%`}`,
        ),
      );
    }

    // "<iso>|<uuid>". Anything malformed is ignored rather than 400'd: a stale
    // cursor from an older tab should restart the list, not break the page.
    const rawCursor = c.req.query("cursor");
    if (rawCursor) {
      const sep = rawCursor.lastIndexOf("|");
      const ts = sep > 0 ? rawCursor.slice(0, sep) : "";
      const id = sep > 0 ? rawCursor.slice(sep + 1) : "";
      const tsDate = new Date(ts);
      if (id && !Number.isNaN(tsDate.getTime())) {
        conditions.push(
          sql`(${orders.createdAt}, ${orders.id}) < (${ts}::timestamptz, ${id}::uuid)`,
        );
      }
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const PAGE = 100;
    const rows = await db.query.orders.findMany({
      where,
      // Must match the cursor's row-value comparison exactly, or pagination skips rows.
      orderBy: [desc(orders.createdAt), desc(orders.id)],
      limit: PAGE + 1, // one extra row tells us whether another page exists
      with: { items: { columns: { qty: true } } },
    });

    const hasMore = rows.length > PAGE;
    const pageRows = hasMore ? rows.slice(0, PAGE) : rows;
    const last = pageRows[pageRows.length - 1];

    return c.json({
      items: pageRows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        total: Number(o.total),
        promoCode: o.promoCode ?? null,
        discount: Number(o.discount ?? 0),
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        advanceAmount: Number(o.advanceAmount),
        advancePaid: Number(o.advancePaid),
        remainingAmount: Number(o.remainingAmount),
        status: o.status,
        itemCount: o.items.reduce((s, it) => s + it.qty, 0),
        createdAt: o.createdAt.toISOString(),
      })),
      nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    });
  });

  // GET /admin/orders/:id — full order detail for the admin order view.
  // GET /admin/orders/stats?range= — dashboard tiles + per-status counts.
  router.get("/stats", async (c) => {
    const range = c.req.query("range") ?? "12m";
    const start = rangeStart(range);
    // db.execute needs an ISO string cast to timestamptz (a JS Date serializes
    // via toString() and Postgres can't parse it).
    //
    // `paid_revenue` is money actually received: only orders past payment
    // (paid / confirmed / shipped / delivered). A COD order counts its online
    // advance until the balance is marked collected, then its full total.
    // (`revenue` / totalRevenue keep their old meaning for the Orders page.)
    const raw = await db.execute(sql`
      select status, count(*)::int cnt, coalesce(sum(total),0) revenue,
        coalesce(sum(
          case when status in ('paid','confirmed','shipped','delivered') then
            case when payment_method = 'cod' and payment_status <> 'paid' then advance_paid else total end
          else 0 end
        ),0) paid_revenue
      from orders where created_at >= ${start.toISOString()}::timestamptz group by status`);
    const rows = (Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? []) as {
      status: string;
      cnt: number;
      revenue: string;
      paid_revenue?: string;
    }[];
    const statusCounts: Record<string, number> = {};
    let totalOrders = 0;
    let totalRevenue = 0;
    let paidRevenue = 0;
    let pendingOrders = 0;
    let completedOrders = 0;
    for (const r of rows) {
      const cnt = Number(r.cnt);
      statusCounts[r.status] = cnt;
      totalOrders += cnt;
      if (r.status !== "cancelled" && r.status !== "refunded") totalRevenue += Number(r.revenue);
      paidRevenue += Number(r.paid_revenue ?? 0);
      if (["pending", "paid", "confirmed", "shipped"].includes(r.status)) pendingOrders += cnt;
      if (r.status === "delivered") completedOrders += cnt;
    }
    paidRevenue = Math.round(paidRevenue * 100) / 100;
    return c.json({ range, totalOrders, totalRevenue, paidRevenue, pendingOrders, completedOrders, statusCounts });
  });

  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: { orderBy: (oi, { asc }) => [asc(oi.id)] } },
    });
    if (!order) return c.json({ error: "Not Found" }, 404);
    return c.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      shippingAddress: order.shippingAddress,
      subtotal: Number(order.subtotal),
      shippingFee: Number(order.shippingFee),
      gstAmount: Number(order.gstAmount),
      total: Number(order.total),
      promoCode: order.promoCode ?? null,
      discount: Number(order.discount ?? 0),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      advanceAmount: Number(order.advanceAmount),
      advancePaid: Number(order.advancePaid),
      remainingAmount: Number(order.remainingAmount),
      razorpayPaymentId: order.razorpayPaymentId,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((it) => ({
        productName: it.productName,
        skuCode: it.skuCode,
        variantLabel: it.variantLabel,
        imageUrl: it.imageUrl,
        unitPrice: Number(it.unitPrice),
        qty: it.qty,
        lineTotal: Number(it.lineTotal),
      })),
    });
  });

  // GET /admin/orders/:id/events — full timeline for the admin order view.
  router.get("/:id/events", async (c) => {
    const id = c.req.param("id");
    const events = await db
      .select({
        id: orderEvents.id,
        eventType: orderEvents.eventType,
        note: orderEvents.note,
        createdAt: orderEvents.createdAt,
      })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(asc(orderEvents.createdAt));

    return c.json(
      OrderEventListResponseSchema.parse({
        events: events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
        })),
      }),
    );
  });

  // POST /admin/orders/:id/events — append a tracking event (and advance the
  // order status when the event maps to one).
  router.post("/:id/events", async (c) => {
    const id = c.req.param("id");
    const raw = await c.req.json().catch(() => null);
    const parsed = AddOrderEventRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { eventType, note } = parsed.data;

    // Optional custom timestamp: the admin can backdate/forward-date when a step
    // actually happened, instead of "now". Ignored if missing/invalid.
    let occurredAt: Date | undefined;
    const rawAt = (raw as { occurredAt?: unknown } | null)?.occurredAt;
    if (typeof rawAt === "string") {
      const d = new Date(rawAt);
      if (!Number.isNaN(d.getTime())) occurredAt = d;
    }

    const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return c.json({ error: "Not Found" }, 404);

    const adminUserId = c.get("adminUserId") ?? null;
    const [event] = await db
      .insert(orderEvents)
      .values({
        orderId: id,
        eventType,
        note: note ?? null,
        createdBy: adminUserId,
        ...(occurredAt ? { createdAt: occurredAt } : {}),
      })
      .returning();

    // Advance the order's status when the event is a status transition.
    if (STATUS_EVENTS.has(eventType)) {
      await db
        .update(orders)
        .set({ status: eventType as OrderStatus, updatedAt: new Date() })
        .where(eq(orders.id, id));
    }

    await logAudit(db, {
      actorUserId: adminUserId,
      action: "order.event.add",
      resourceType: "order",
      resourceId: id,
      changes: { after: { eventType, note: note ?? null } },
    });

    return c.json(
      {
        id: event!.id,
        eventType: event!.eventType,
        note: event!.note,
        createdAt: event!.createdAt.toISOString(),
      },
      201,
    );
  });

  // Record the cash balance once it has actually been collected on delivery.
  // This deliberately does not alter fulfilment status; delivery remains an
  // explicit admin workflow action.
  router.post("/:id/collect-cod", async (c) => {
    const id = c.req.param("id");
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return c.json({ error: "Not Found" }, 404);
    if (order.paymentMethod !== "cod") return c.json({ error: "Order is not COD" }, 409);
    if (order.paymentStatus !== "partially_paid") {
      return c.json({ error: "COD balance is not awaiting collection" }, 409);
    }
    await db.update(orders).set({
      paymentStatus: "paid",
      remainingAmount: "0",
      updatedAt: new Date(),
    }).where(eq(orders.id, id));
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "order.cod_collected",
      resourceType: "order",
      resourceId: id,
      changes: { after: { paymentStatus: "paid" } },
    });
    return c.json({ ok: true });
  });

  /** DELETE /admin/orders/:id — remove an order outright.
   *
   *  For clearing test and demo orders out of the list. `order_items` and
   *  `order_events` cascade from the row; `order_backups` does not carry a
   *  foreign key, so the snapshot of what was ordered survives the delete.
   *
   *  Orders that actually took money are refused. Once a customer has paid,
   *  the row is the record of that payment — reconciling against PayU, issuing
   *  a refund and answering "where is my order" all depend on it, and deleting
   *  it cannot be undone. Cancel or refund those instead.
   */
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return c.json({ error: "Not Found" }, 404);

    if (order.paymentStatus === "paid" || order.paymentStatus === "partially_paid") {
      return c.json(
        {
          error: "Order has been paid",
          message:
            `${order.orderNumber} has money against it (${order.paymentStatus.replace("_", " ")}), ` +
            "so it can't be deleted — it's the record of that payment. Cancel or refund it instead.",
        },
        409,
      );
    }

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "order.delete",
      resourceType: "order",
      resourceId: id,
      changes: {
        before: {
          orderNumber: order.orderNumber,
          total: order.total,
          status: order.status,
          paymentStatus: order.paymentStatus,
          customerPhone: order.customerPhone,
          createdAt: order.createdAt.toISOString(),
        },
      },
    });

    await db.delete(orders).where(eq(orders.id, id));
    return c.body(null, 204);
  });

  return router;
}
